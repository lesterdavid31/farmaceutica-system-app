// Seed de traslados: uno en cada estado del ciclo de vida (RN-08), creados con el mismo servicio
// que usa la API para que el kardex quede igual que en la operación real.
// Idempotente: si el primer traslado del seed ya existe, no hace nada.

import { PrismaClient } from '../../src/generated/prisma/client';
import { MotivoTraslado } from '../../src/generated/prisma/enums';
import type { UsuarioAutenticado } from '../../src/common/usuario-autenticado';
import { MotorInventarioService } from '../../src/inventario/motor-inventario.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { TrasladosService } from '../../src/traslados/traslados.service';

const MARCA = 'Reabastecimiento quincenal de la bodega';

/** Productos que solo existen en la bodega y en Xela (demostración del call center): no se mueven. */
const EXCLUSIVOS = ['MED-0014', 'MED-0022', 'MED-0031'];

interface Plan {
  origen: string;
  destino: string;
  solicita: string;
  cantidades: number[];
  observaciones: string;
  hasta: 'SOLICITADO' | 'APROBADO' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO';
  faltante?: { unidades: number; motivo: string };
}

const PLANES: Plan[] = [
  {
    origen: 'BOD-CENTRAL',
    destino: 'CC-XELA',
    solicita: 'gerente.xela',
    cantidades: [24, 36, 12],
    observaciones: MARCA,
    hasta: 'RECIBIDO',
    faltante: { unidades: 2, motivo: 'Un empaque llegó dañado por humedad' },
  },
  {
    origen: 'BOD-CENTRAL',
    destino: 'SG-ZACAPA',
    solicita: 'gerente.bodega',
    cantidades: [20, 15],
    observaciones: 'Reposición del stand antes del fin de semana',
    hasta: 'EN_TRANSITO',
  },
  {
    origen: 'CC-XELA',
    destino: 'CC-HUEHUE',
    solicita: 'gerente.huehue',
    cantidades: [6],
    observaciones: 'Préstamo entre sucursales mientras llega el reabastecimiento',
    hasta: 'APROBADO',
  },
  {
    origen: 'BOD-CENTRAL',
    destino: 'CC-COBAN',
    solicita: 'gerente.coban',
    cantidades: [30, 18],
    observaciones: 'Productos bajo el stock mínimo',
    hasta: 'SOLICITADO',
  },
  {
    origen: 'BOD-CENTRAL',
    destino: 'CC-PETEN',
    solicita: 'gerente.peten',
    cantidades: [10],
    observaciones: 'Pedido duplicado',
    hasta: 'CANCELADO',
  },
];

export async function sembrarTraslados(prisma: PrismaClient) {
  if (await prisma.traslado.findFirst({ where: { observaciones: MARCA } })) {
    console.log('Traslados: ya estaban cargados, se omite');
    return;
  }
  const motor = new MotorInventarioService();
  const servicio = new TrasladosService(prisma as unknown as PrismaService, motor);

  const usuario = async (cuenta: string): Promise<UsuarioAutenticado> => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: `${cuenta}@farmacia.gt` } });
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, ubicacionId: u.ubicacionId };
  };
  const ubicacion = async (codigo: string) =>
    (await prisma.ubicacion.findUniqueOrThrow({ where: { codigo } })).id;
  const productos = await prisma.producto.findMany({
    where: { activo: true, sku: { notIn: EXCLUSIVOS } },
    orderBy: { sku: 'asc' },
  });
  const admin = await usuario('admin');
  const usados = new Set<string>();

  for (const plan of PLANES) {
    const origenId = await ubicacion(plan.origen);
    const destinoId = await ubicacion(plan.destino);
    const vigente = await motor.vigentePorProducto(
      prisma,
      origenId,
      productos.map((p) => p.id),
    );
    // Productos distintos en cada traslado, con existencia vigente holgada en el origen.
    const detalles = plan.cantidades.map((cantidad) => {
      const producto = productos.find(
        (p) => !usados.has(p.id) && (vigente.get(p.id) ?? 0) >= cantidad * 2,
      );
      if (!producto) {
        throw new Error(`No hay productos con existencia suficiente en ${plan.origen}`);
      }
      usados.add(producto.id);
      return { productoId: producto.id, cantidad };
    });

    const solicitante = await usuario(plan.solicita);
    const traslado = await servicio.crear(
      {
        origenId,
        destinoId,
        motivo: MotivoTraslado.REABASTECIMIENTO,
        observaciones: plan.observaciones,
        detalles,
      },
      solicitante,
    );
    if (plan.hasta === 'CANCELADO') {
      await servicio.cancelar(traslado.id, { motivo: plan.observaciones }, solicitante);
      continue;
    }
    if (plan.hasta === 'SOLICITADO') {
      continue;
    }
    await servicio.aprobar(traslado.id, admin);
    if (plan.hasta === 'APROBADO') {
      continue;
    }
    const despachado = await servicio.despachar(traslado.id, admin);
    if (plan.hasta === 'EN_TRANSITO') {
      continue;
    }
    const [primera, ...resto] = despachado.detalles;
    const faltante = plan.faltante?.unidades ?? 0;
    await servicio.recibir(
      traslado.id,
      {
        detalles: [
          {
            detalleId: primera.id,
            cantidadRecibida: primera.cantidadEnviada! - faltante,
          },
          ...resto.map((d) => ({ detalleId: d.id, cantidadRecibida: d.cantidadEnviada! })),
        ],
        motivoDiferencia: plan.faltante?.motivo,
      },
      await usuario(plan.solicita),
    );
  }
  console.log(`Traslados: ${PLANES.length} creados`);
}
