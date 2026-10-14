// Seed de planilla y activos fijos, con los mismos servicios que usa la API:
// - Empleados: el gerente y el cajero de cada sucursal (vinculados a su usuario), el gerente y un
//   bodeguero en la bodega. Los repartidores ya los crea el seed del call center.
// - Planillas de agosto y septiembre de 2026 cerradas en todas las ubicaciones.
// - Activos fijos por ubicación (mobiliario, cómputo y refrigeración; edificio y vehículo en la
//   bodega) y un traslado de un equipo de cómputo, para que haya historial.
// Idempotente por el DPI del primer empleado.

import { PrismaClient } from '../../src/generated/prisma/client';
import { Puesto, Rol, TipoUbicacion } from '../../src/generated/prisma/enums';
import { ActivosService } from '../../src/activos/activos.service';
import type { UsuarioAutenticado } from '../../src/common/usuario-autenticado';
import { ConfiguracionService } from '../../src/configuracion/configuracion.service';
import { PlanillasService } from '../../src/planilla/planillas.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

const PRIMER_DPI = '1900000000001';

/** "Ana Lucía Pérez" → nombres "Ana Lucía", apellidos "Pérez". */
function partirNombre(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  const corte = partes.length > 2 ? 2 : 1;
  return {
    nombres: partes.slice(0, corte).join(' '),
    apellidos: partes.slice(corte).join(' ') || '—',
  };
}

interface ActivoPlan {
  codigo: string;
  descripcion: string;
  categoria: string;
  fecha: string;
  costo: number;
  residual: number;
}

function activosDe(codigo: string, i: number, bodega: boolean): ActivoPlan[] {
  const anio = 2022 + (i % 4);
  const lista: ActivoPlan[] = [
    {
      codigo: `AF-${codigo}-MOB`,
      descripcion: 'Estanterías y mostrador de atención',
      categoria: 'Mobiliario y equipo',
      fecha: `${anio}-03-15`,
      costo: 18_500 + i * 750,
      residual: 1_850,
    },
    {
      codigo: `AF-${codigo}-PC`,
      descripcion: 'Computadora e impresora del punto de venta',
      categoria: 'Equipo de cómputo',
      fecha: `${Math.max(anio, 2024)}-07-01`,
      costo: 9_800,
      residual: 980,
    },
    {
      codigo: `AF-${codigo}-REF`,
      descripcion: 'Refrigerador vertical para medicamentos',
      categoria: 'Refrigeración médica',
      fecha: `${anio}-05-20`,
      costo: 14_200,
      residual: 1_420,
    },
  ];
  if (bodega) {
    lista.push(
      {
        codigo: `AF-${codigo}-EDI`,
        descripcion: 'Nave de la bodega central',
        categoria: 'Edificios',
        fecha: '2019-01-10',
        costo: 2_400_000,
        residual: 480_000,
      },
      {
        codigo: `AF-${codigo}-VEH`,
        descripcion: 'Camión de reparto de 3.5 toneladas',
        categoria: 'Vehículos',
        fecha: '2023-02-01',
        costo: 285_000,
        residual: 57_000,
      },
      {
        codigo: `AF-${codigo}-PC2`,
        descripcion: 'Computadora de reserva',
        categoria: 'Equipo de cómputo',
        fecha: '2025-11-03',
        costo: 7_600,
        residual: 760,
      },
    );
  }
  return lista;
}

export async function sembrarPlanillaYActivos(prisma: PrismaClient) {
  if (await prisma.empleado.findUnique({ where: { dpi: PRIMER_DPI } })) {
    console.log('Planilla y activos: ya estaban cargados, se omite');
    return;
  }
  const db = prisma as unknown as PrismaService;
  const configuracion = new ConfiguracionService(db, undefined as never);
  const planillas = new PlanillasService(db, configuracion);
  const activos = new ActivosService(db);
  const u = await prisma.usuario.findUniqueOrThrow({ where: { email: 'admin@farmacia.gt' } });
  const admin: UsuarioAutenticado = {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    ubicacionId: null,
  };

  // Empleados vinculados a los usuarios de cada ubicación.
  const usuarios = await prisma.usuario.findMany({
    where: { rol: { in: [Rol.GERENTE, Rol.CAJERO] }, ubicacionId: { not: null } },
    orderBy: { email: 'asc' },
  });
  let dpi = Number(PRIMER_DPI);
  const ingreso = new Date('2026-02-02T00:00:00Z');
  for (const usuario of usuarios) {
    await prisma.empleado.create({
      data: {
        ...partirNombre(usuario.nombre),
        dpi: String(dpi++),
        puesto: usuario.rol === Rol.GERENTE ? Puesto.GERENTE : Puesto.CAJERO,
        salarioBase: usuario.rol === Rol.GERENTE ? 7_500 : 4_200,
        ubicacionId: usuario.ubicacionId!,
        fechaIngreso: ingreso,
        usuarioId: usuario.id,
      },
    });
  }
  const ubicaciones = await prisma.ubicacion.findMany({ orderBy: { codigo: 'asc' } });
  const bodega = ubicaciones.find((x) => x.tipo === TipoUbicacion.BODEGA_CENTRAL)!;
  await prisma.empleado.create({
    data: {
      nombres: 'Rigoberto',
      apellidos: 'Sican Ajanel',
      dpi: String(dpi),
      puesto: Puesto.BODEGUERO,
      salarioBase: 4_000,
      ubicacionId: bodega.id,
      fechaIngreso: ingreso,
    },
  });
  const empleados = await prisma.empleado.count();

  // Planillas de agosto y septiembre cerradas en cada ubicación.
  let generadas = 0;
  for (const ubicacion of ubicaciones) {
    for (const mes of [8, 9]) {
      const planilla = await planillas.generar(
        { ubicacionId: ubicacion.id, anio: 2026, mes },
        admin,
      );
      // Un descuento por anticipo en septiembre, para que no todas las líneas sean iguales.
      if (mes === 9 && planilla.detalles.length > 1) {
        await planillas.editarLinea(
          planilla.id,
          planilla.detalles[0].id,
          { otrosDescuentos: 300 },
          admin,
        );
      }
      await planillas.cerrar(planilla.id, admin);
      generadas++;
    }
  }

  // Activos fijos por ubicación.
  const categorias = await prisma.categoriaActivo.findMany();
  let registrados = 0;
  for (const [i, ubicacion] of ubicaciones.entries()) {
    const codigo = ubicacion.codigo.replace(/^(CC|SG|BOD)-/, '');
    for (const a of activosDe(codigo, i, ubicacion.id === bodega.id)) {
      await activos.crear(
        {
          codigo: a.codigo,
          descripcion: a.descripcion,
          categoriaId: categorias.find((c) => c.nombre === a.categoria)!.id,
          ubicacionId: ubicacion.id,
          fechaAdquisicion: a.fecha,
          costo: a.costo,
          valorResidual: a.residual,
        },
        admin,
      );
      registrados++;
    }
  }
  const reserva = await prisma.activoFijo.findUniqueOrThrow({
    where: { codigo: 'AF-CENTRAL-PC2' },
  });
  await activos.trasladar(
    reserva.id,
    {
      ubicacionDestinoId: ubicaciones.find((x) => x.codigo === 'SG-ZACAPA')!.id,
      motivo: 'Reemplazo de la computadora dañada del stand',
    },
    admin,
  );

  console.log(
    `Planilla y activos: ${empleados} empleados, ${generadas} planillas cerradas y ${registrados} activos`,
  );
}
