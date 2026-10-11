// Seed de caja y ventas: turnos de tres sucursales creados con los mismos servicios que usa la API,
// para que inventario, caja y arqueo queden como en la operación real.
// - Escuintla: turno cerrado con faltante.
// - Huehuetenango: turno cerrado cuadrado, con una venta anulada y un retiro.
// - Cobán: turno abierto con ventas, para probar la anulación y el cierre.
// Xela queda sin turno para probar la apertura. Idempotente por la marca en las observaciones.

import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { MetodoPago } from '../../src/generated/prisma/enums';
import { CajaService } from '../../src/caja/caja.service';
import type { UsuarioAutenticado } from '../../src/common/usuario-autenticado';
import { MotorInventarioService } from '../../src/inventario/motor-inventario.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { VentasService } from '../../src/ventas/ventas.service';

const MARCA = 'Turno de demostración';

/** Productos reservados para la demostración del call center: no se venden en el seed. */
const EXCLUSIVOS = ['MED-0014', 'MED-0022', 'MED-0031'];

interface VentaPlan {
  /** Cantidades de los productos de la venta. */
  cantidades: number[];
  /** Parte del total que se paga con tarjeta (el resto en efectivo); 1 = todo con tarjeta. */
  tarjeta?: number;
  nit?: string;
}

interface TurnoPlan {
  sucursal: string;
  cajero: string;
  gerente: string;
  montoInicial: number;
  ventas: VentaPlan[];
  gastos?: { tipo: 'GASTO' | 'RETIRO' | 'DEPOSITO'; monto: number; descripcion: string }[];
  /** Índice de la venta que el gerente anula. */
  anular?: number;
  /** Diferencia del arqueo; sin valor, el turno queda abierto. */
  diferencia?: number;
  observacionesCierre?: string;
}

const PLANES: TurnoPlan[] = [
  {
    sucursal: 'CC-ESCUINTLA',
    cajero: 'cajero.escuintla',
    gerente: 'gerente.escuintla',
    montoInicial: 500,
    ventas: [
      { cantidades: [2, 1] },
      { cantidades: [1], tarjeta: 1, nit: '4521879-3' },
      { cantidades: [3, 2, 1], tarjeta: 0.5 },
      { cantidades: [1] },
    ],
    gastos: [{ tipo: 'GASTO', monto: 25, descripcion: 'Agua pura para la sucursal' }],
    diferencia: -15.5,
    observacionesCierre: 'Faltante sin explicación; se reportó al gerente',
  },
  {
    sucursal: 'CC-HUEHUE',
    cajero: 'cajero.huehue',
    gerente: 'gerente.huehue',
    montoInicial: 400,
    ventas: [{ cantidades: [1, 1] }, { cantidades: [2] }, { cantidades: [1], tarjeta: 1 }],
    gastos: [
      { tipo: 'DEPOSITO', monto: 100, descripcion: 'Sencillo para cambio' },
      { tipo: 'RETIRO', monto: 200, descripcion: 'Retiro parcial a caja fuerte' },
    ],
    anular: 1,
    diferencia: 0,
  },
  {
    sucursal: 'CC-COBAN',
    cajero: 'cajero.coban',
    gerente: 'gerente.coban',
    montoInicial: 300,
    ventas: [{ cantidades: [1] }, { cantidades: [2, 1], tarjeta: 1 }, { cantidades: [1, 1] }],
  },
];

export async function sembrarVentas(prisma: PrismaClient) {
  if (await prisma.turnoCaja.findFirst({ where: { observaciones: { startsWith: MARCA } } })) {
    console.log('Caja y ventas: ya estaban cargadas, se omite');
    return;
  }
  const motor = new MotorInventarioService();
  const db = prisma as unknown as PrismaService;
  const caja = new CajaService(db);
  const ventas = new VentasService(db, motor, caja);
  const usuario = async (cuenta: string): Promise<UsuarioAutenticado> => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: `${cuenta}@farmacia.gt` } });
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, ubicacionId: u.ubicacionId };
  };
  const productos = await prisma.producto.findMany({
    where: { activo: true, sku: { notIn: EXCLUSIVOS } },
    orderBy: { sku: 'asc' },
  });

  let totalVentas = 0;
  for (const plan of PLANES) {
    const cajero = await usuario(plan.cajero);
    const vigente = await motor.vigentePorProducto(
      prisma,
      cajero.ubicacionId!,
      productos.map((p) => p.id),
    );
    // Productos con existencia holgada en la sucursal, rotando para variar las ventas.
    const disponibles = productos.filter((p) => (vigente.get(p.id) ?? 0) >= 10);
    let siguiente = 0;
    const turno = await caja.abrir(
      { montoInicial: plan.montoInicial, observaciones: MARCA },
      cajero,
    );

    const ventaIds: string[] = [];
    for (const v of plan.ventas) {
      const items = v.cantidades.map((cantidad) => ({
        productoId: disponibles[siguiente++ % disponibles.length].id,
        cantidad,
      }));
      const total = items.reduce(
        (s, i) => s.add(productos.find((p) => p.id === i.productoId)!.precioVenta.mul(i.cantidad)),
        new Prisma.Decimal(0),
      );
      const tarjeta = total.mul(v.tarjeta ?? 0).toDecimalPlaces(2);
      const efectivo = total.sub(tarjeta);
      const pagos = [
        ...(tarjeta.greaterThan(0)
          ? [{ metodo: MetodoPago.TARJETA, monto: tarjeta.toNumber(), referencia: 'AUT-DEMO' }]
          : []),
        ...(efectivo.greaterThan(0)
          ? [{ metodo: MetodoPago.EFECTIVO, monto: efectivo.toNumber() }]
          : []),
      ];
      const venta = await ventas.crear({ items, pagos, nit: v.nit }, cajero);
      ventaIds.push(venta.id);
      totalVentas++;
    }
    for (const g of plan.gastos ?? []) {
      await caja.registrarMovimiento(turno.id, g, cajero);
    }
    if (plan.anular !== undefined) {
      await ventas.anular(
        ventaIds[plan.anular],
        { motivo: 'El cliente cambió de opinión antes de salir' },
        await usuario(plan.gerente),
      );
    }
    if (plan.diferencia !== undefined) {
      const { resumen } = await caja.obtener(turno.id, cajero);
      await caja.cerrar(
        turno.id,
        {
          efectivoContado: resumen.efectivoEsperado.add(plan.diferencia).toNumber(),
          observaciones: plan.observacionesCierre,
        },
        cajero,
      );
    }
  }
  console.log(`Caja y ventas: ${PLANES.length} turnos y ${totalVentas} ventas creados`);
}
