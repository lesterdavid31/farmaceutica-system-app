// Seed del call center: repartidores por sucursal, clientes con direcciones y pedidos en varios
// estados, creados con los mismos servicios que usa la API (inventario, caja y traslados quedan
// como en la operación real). Idempotente por el teléfono del primer cliente.
//
// Para demostrar el atraso (RN-18), a dos pedidos se les mueve la fecha de compromiso al pasado
// después de crearlos: la API nunca permite una fecha anterior al tiempo estimado.

import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../src/generated/prisma/client';
import { MetodoPago, Puesto, TipoUbicacion } from '../../src/generated/prisma/enums';
import { CajaService } from '../../src/caja/caja.service';
import type { UsuarioAutenticado } from '../../src/common/usuario-autenticado';
import { ConfiguracionService } from '../../src/configuracion/configuracion.service';
import { MotorInventarioService } from '../../src/inventario/motor-inventario.service';
import { MapasService } from '../../src/mapas/mapas.service';
import { PedidosService } from '../../src/pedidos/pedidos.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { TrasladosService } from '../../src/traslados/traslados.service';
import { VentasService } from '../../src/ventas/ventas.service';
import { UBICACIONES } from './datos-base';

const NOMBRES_REPARTIDOR = [
  ['Carlos Enrique', 'Ajú Tzoc'],
  ['José Luis', 'Pérez Coyoy'],
  ['Byron Estuardo', 'Morales Chun'],
  ['Kevin Alexander', 'García Xol'],
  ['Marvin Rolando', 'López Tut'],
  ['Wilson Adolfo', 'Hernández Caal'],
  ['Edgar Iván', 'Ramírez Pop'],
  ['Selvin Orlando', 'Cifuentes Ical'],
];

/** Clientes con una dirección cerca de una sucursal (desplazamiento en grados, unos cientos de metros). */
const CLIENTES = [
  {
    nombre: 'Lucía Fernanda Say',
    telefono: '55210001',
    nit: '4521879-3',
    cerca: 'CC-XELA',
    d: [0.006, 0.004],
    direccion: '7a. avenida 3-45, zona 1, Quetzaltenango',
  },
  {
    nombre: 'Héctor Rodolfo Chávez',
    telefono: '55210002',
    cerca: 'CC-XELA',
    d: [-0.008, 0.007],
    direccion: 'Diagonal 11 8-20, zona 7, Quetzaltenango',
  },
  {
    nombre: 'Ana Beatriz Monzón',
    telefono: '55210003',
    nit: '78125466',
    cerca: 'CC-ESCUINTLA',
    d: [0.005, -0.006],
    direccion: '4a. calle 6-12, zona 1, Escuintla',
  },
  {
    nombre: 'Pedro Pablo Jiatz',
    telefono: '55210004',
    cerca: 'CC-HUEHUE',
    d: [0.004, 0.005],
    direccion: '2a. avenida 5-30, zona 1, Huehuetenango',
  },
  {
    nombre: 'Rosa Elvira Caal',
    telefono: '55210005',
    cerca: 'CC-COBAN',
    d: [-0.005, 0.004],
    direccion: '1a. calle 4-18, zona 4, Cobán',
  },
  {
    nombre: 'Miguel Ángel Tut',
    telefono: '55210006',
    nit: '3366998K',
    cerca: 'CC-COBAN',
    d: [0.007, -0.003],
    direccion: '3a. avenida 2-40, zona 2, Cobán',
  },
  {
    nombre: 'Gabriela Alejandra Ordóñez',
    telefono: '55210007',
    cerca: 'SG-ZACAPA',
    d: [0.003, 0.006],
    direccion: 'Barrio El Centro, 5a. calle, Zacapa',
  },
  {
    nombre: 'Julio César Batz',
    telefono: '55210008',
    cerca: 'SG-CHIMAL',
    d: [-0.004, -0.005],
    direccion: '6a. avenida 1-15, zona 2, Chimaltenango',
  },
];

export async function sembrarPedidos(prisma: PrismaClient) {
  if (await prisma.cliente.findFirst({ where: { telefono: CLIENTES[0].telefono } })) {
    console.log('Call center: ya estaba cargado, se omite');
    return;
  }
  const db = prisma as unknown as PrismaService;
  const motor = new MotorInventarioService();
  const caja = new CajaService(db);
  const ventas = new VentasService(db, motor, caja);
  const traslados = new TrasladosService(db, motor);
  // El seed solo lee parámetros: la bitácora no se usa.
  const configuracion = new ConfiguracionService(db, undefined as never);
  const mapas = new MapasService(new ConfigService(process.env), configuracion);
  const pedidos = new PedidosService(db, mapas, configuracion, caja, ventas, traslados);

  const usuario = async (cuenta: string): Promise<UsuarioAutenticado> => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: `${cuenta}@farmacia.gt` } });
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, ubicacionId: u.ubicacionId };
  };
  const ubicaciones = await prisma.ubicacion.findMany();
  const ubicacion = (codigo: string) => ubicaciones.find((u) => u.codigo === codigo)!;

  // Dos repartidores por sucursal (RN-20: empleados sin acceso al sistema).
  let n = 0;
  for (const u of UBICACIONES.filter((x) => x.tipo !== TipoUbicacion.BODEGA_CENTRAL)) {
    for (let i = 0; i < 2; i++) {
      const [nombres, apellidos] = NOMBRES_REPARTIDOR[n % NOMBRES_REPARTIDOR.length];
      const dpi = String(2_400_000_000_000 + n * 7_919);
      await prisma.empleado.upsert({
        where: { dpi },
        update: {},
        create: {
          nombres,
          apellidos,
          dpi,
          puesto: Puesto.REPARTIDOR,
          salarioBase: 3_400,
          ubicacionId: ubicacion(u.codigo).id,
          fechaIngreso: new Date('2026-03-01T00:00:00Z'),
        },
      });
      n++;
    }
  }

  const clientes: { id: string; direcciones: { id: string }[] }[] = [];
  for (const c of CLIENTES) {
    const base = ubicacion(c.cerca);
    clientes.push(
      await prisma.cliente.create({
        data: {
          nombre: c.nombre,
          telefono: c.telefono,
          nit: c.nit?.replace('-', '') ?? null,
          direcciones: {
            create: {
              alias: 'Casa',
              direccion: c.direccion,
              municipioId: base.municipioId,
              latitud: Number(base.latitud) + c.d[0],
              longitud: Number(base.longitud) + c.d[1],
              principal: true,
            },
          },
        },
        include: { direcciones: true },
      }),
    );
  }

  const operador = await usuario('operador');
  const productos = await prisma.producto.findMany({ orderBy: { sku: 'asc' } });
  const sku = (s: string) => productos.find((p) => p.sku === s)!.id;
  const repartidorDe = async (codigo: string) =>
    (
      await prisma.empleado.findFirstOrThrow({
        where: { ubicacionId: ubicacion(codigo).id, puesto: Puesto.REPARTIDOR },
        orderBy: { dpi: 'asc' },
      })
    ).id;
  /** Productos con existencia vigente holgada en la sucursal (excepto los exclusivos de Xela). */
  const disponibles = async (codigo: string) => {
    const vigente = await motor.vigentePorProducto(
      prisma,
      ubicacion(codigo).id,
      productos.map((p) => p.id),
    );
    return productos
      .filter((p) => !['MED-0014', 'MED-0022', 'MED-0031'].includes(p.sku))
      .filter((p) => (vigente.get(p.id) ?? 0) >= 10)
      .map((p) => p.id);
  };
  const crear = async (
    cliente: number,
    codigo: string,
    items: { productoId: string; cantidad: number }[],
    metodoPago: 'CONTRA_ENTREGA' | 'TARJETA' = MetodoPago.CONTRA_ENTREGA,
    observaciones?: string,
  ) =>
    (
      await pedidos.crear(
        {
          clienteId: clientes[cliente].id,
          direccionId: clientes[cliente].direcciones[0].id,
          ubicacionDespachoId: ubicacion(codigo).id,
          items,
          metodoPago,
          observaciones,
        },
        operador,
      )
    ).id;
  const atrasar = (id: string, minutos: number) =>
    prisma.pedido.update({
      where: { id },
      data: { fechaCompromiso: new Date(Date.now() - minutos * 60_000) },
    });

  // Cobán tiene un turno abierto: un pedido entregado y cobrado, y otro en camino atrasado.
  const cajeroCoban = await usuario('cajero.coban');
  const enCoban = await disponibles('CC-COBAN');
  const entregado = await crear(4, 'CC-COBAN', [
    { productoId: enCoban[0], cantidad: 2 },
    { productoId: enCoban[1], cantidad: 1 },
  ]);
  await pedidos.ejecutar('preparar', entregado, cajeroCoban);
  await pedidos.ejecutar('asignar', entregado, cajeroCoban, {
    repartidorId: await repartidorDe('CC-COBAN'),
  });
  await pedidos.ejecutar('salir', entregado, cajeroCoban);
  await pedidos.ejecutar('entregar', entregado, cajeroCoban, { notas: 'Entregado en portería' });

  const enCamino = await crear(
    5,
    'CC-COBAN',
    [{ productoId: enCoban[2], cantidad: 3 }],
    MetodoPago.TARJETA,
  );
  await pedidos.ejecutar('preparar', enCamino, cajeroCoban);
  await pedidos.ejecutar('asignar', enCamino, cajeroCoban, {
    repartidorId: await repartidorDe('CC-COBAN'),
  });
  await pedidos.ejecutar('salir', enCamino, cajeroCoban);
  await atrasar(enCamino, 25);

  // Xela: uno pendiente a tiempo y otro pendiente atrasado, para preparar desde la bandeja.
  const enXela = await disponibles('CC-XELA');
  await crear(0, 'CC-XELA', [{ productoId: enXela[0], cantidad: 2 }]);
  const atrasadoXela = await crear(1, 'CC-XELA', [
    { productoId: enXela[1], cantidad: 1 },
    { productoId: enXela[2], cantidad: 1 },
  ]);
  await atrasar(atrasadoXela, 40);

  // Escuintla: en preparación (inventario ya descontado), esperando repartidor.
  const enEscuintla = await disponibles('CC-ESCUINTLA');
  const preparando = await crear(2, 'CC-ESCUINTLA', [{ productoId: enEscuintla[0], cantidad: 4 }]);
  await pedidos.ejecutar('preparar', preparando, await usuario('gerente.escuintla'));

  // Huehuetenango: MED-0014 solo existe en la bodega y en Xela, así que el pedido genera un
  // traslado (RN-17) y queda pendiente hasta recibirlo.
  await crear(
    3,
    'CC-HUEHUE',
    [{ productoId: sku('MED-0014'), cantidad: 2 }],
    MetodoPago.CONTRA_ENTREGA,
    'Llamar antes de llegar',
  );

  // Zacapa: cancelado por el operador.
  const enZacapa = await disponibles('SG-ZACAPA');
  const cancelado = await crear(6, 'SG-ZACAPA', [{ productoId: enZacapa[0], cantidad: 1 }]);
  await pedidos.ejecutar('cancelar', cancelado, operador, {
    motivo: 'El cliente compró en otra farmacia',
  });

  console.log(`Call center: ${n} repartidores, ${clientes.length} clientes y 7 pedidos creados`);
}
