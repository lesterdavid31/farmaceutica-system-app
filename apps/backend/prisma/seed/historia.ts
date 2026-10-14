// Seed de historia: unos 3 meses de operación, desde hace 92 días hasta ayer (sección 9).
//
// Simula en memoria, en orden cronológico, lo que harían los servicios de la API:
// - compras quincenales de reabastecimiento de la bodega (la última con lotes de corta fecha);
// - traslados quincenales de la bodega a cada sucursal, despachados por FEFO, algunos con
//   faltantes al recibir, y unos pocos cancelados;
// - un turno de caja diario por sucursal con ventas de mostrador (FEFO sin vencidos), gastos,
//   depósitos, retiros, anulaciones y arqueo, algunos con sobrante o faltante;
// - pedidos del call center cobrados al entregar en la caja de la sucursal, algunos entregados
//   tarde y otros cancelados;
// - bajas de lotes vencidos en la bodega, Xela y Escuintla (las demás sucursales todavía los
//   tienen, para las alertas).
//
// Usar los servicios para miles de ventas haría decenas de miles de viajes a Neon, así que la
// simulación reproduce sus reglas con las mismas funciones puras (asignarFefo, montoConSigno,
// estimarRuta, normalizarNit) y guarda todo en bloque con createMany en una sola transacción: si
// algo falla, no queda nada a medias. Es reproducible (semilla fija), salvo los identificadores.
// Idempotente: si la primera compra de la historia ya existe, no hace nada.

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import {
  CanalVenta,
  EstadoPedido,
  EstadoTraslado,
  EstadoTurnoCaja,
  EstadoVenta,
  MetodoPago,
  MotivoTraslado,
  Puesto,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
  TipoUbicacion,
} from '../../src/generated/prisma/enums';
import { montoConSigno, METODOS_EN_EFECTIVO } from '../../src/caja/arqueo';
import { fechaCorta } from '../../src/common/formato';
import { PARAMETROS } from '../../src/configuracion/parametros';
import { asignarFefo, hoyGuatemala, sumarDias, type Asignacion } from '../../src/inventario/fefo';
import { estimarRuta } from '../../src/mapas/geo';
import { normalizarNit } from '../../src/ventas/reglas-venta';
import { PROVEEDORES, UBICACIONES } from './datos-base';
import { generador } from './inventario';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const DIAS = 92;
const DOCUMENTO_MARCA = 'SEED-FAC-0004';
/** Días (relativos a hoy) de las compras de reabastecimiento; la última trae lotes de corta fecha. */
const DIAS_COMPRA = [-84, -70, -56, -42, -28, -14];

/** Productos que solo existen en la bodega y en Xela (demostración del call center). */
const EXCLUSIVOS = ['MED-0014', 'MED-0022', 'MED-0031'];
/** Los de mayor venta: analgésicos, amoxicilina, loratadina, omeprazol, losartán, metformina... */
const ROTACION_ALTA = [
  'MED-0001',
  'MED-0002',
  'MED-0003',
  'MED-0009',
  'MED-0017',
  'MED-0021',
  'MED-0027',
  'MED-0028',
  'MED-0032',
];
/** Baja rotación: son los que tienen un lote ya vencido (inventario.ts, i % 5 === 4). */
const esRotacionBaja = (sku: string) => Number(sku.slice(4)) % 5 === 0;

/** Ventas de mostrador por día en un día normal, por sucursal. */
const VENTAS_POR_DIA: Record<string, number> = {
  'CC-XELA': 20,
  'CC-ESCUINTLA': 17,
  'CC-HUEHUE': 15,
  'CC-COBAN': 15,
  'CC-PETEN': 13,
  'SG-CHIMAL': 9,
  'SG-ZACAPA': 8,
  'SG-REU': 8,
};
/** Unidades por venta en promedio (líneas × unidades por línea), para estimar la demanda. */
const UNIDADES_POR_VENTA = 2.8;
/** Factor por día de la semana (domingo = 0). */
const FACTOR_SEMANA = [0.75, 0.95, 1, 1, 1, 1.1, 1.2];

const GASTOS: [string, number, number][] = [
  ['Agua pura para la sucursal', 18, 35],
  ['Artículos de limpieza', 25, 80],
  ['Papel para la impresora de comprobantes', 30, 60],
  ['Pago de mensajería', 20, 45],
  ['Bolsas para despacho', 15, 40],
];
const MOTIVOS_ANULACION = [
  'El cliente cambió de opinión antes de salir',
  'Se cobró un producto equivocado',
  'Error en la cantidad registrada',
  'El cliente no presentó la receta del antibiótico',
];
const FALTANTES_TRASLADO = [
  'Un empaque llegó dañado por humedad',
  'Faltó una caja en el despacho',
  'Blíster roto durante el viaje',
];
const MOTIVOS_CANCELACION_PEDIDO = [
  'El cliente canceló por teléfono',
  'El cliente compró en otra farmacia',
  'El cliente no confirmó la dirección',
];
const NOTAS_ATRASO = [
  'Tráfico en la ruta',
  'El cliente no estaba; se esperó en la puerta',
  'Lluvia fuerte en la ruta',
  'Dirección difícil de encontrar',
];

/** Clientes frecuentes del call center: tres por sucursal, con dirección cerca de ella. */
const CLIENTES: [nombre: string, nit: string | null][] = [
  ['Marta Julia Xicará', null],
  ['Rodrigo Andrés Barrios', '5523871'],
  ['Silvia Eugenia Ajcip', null],
  ['Fernando José Letona', '9182736K'],
  ['Claudia Marisol Ortiz', null],
  ['Estuardo Rafael Polanco', '4410298'],
  ['Brenda Lisseth Mérida', null],
  ['Walter Humberto Sales', '6637215'],
  ['Ingrid Paola Villatoro', null],
  ['Sergio Antonio Choc', null],
  ['Alba Luz Maquín', '3092847'],
  ['Juan Carlos Bol', null],
  ['Nidia Esperanza Sagastume', '7281934'],
  ['Mario René Pacay', null],
  ['Karen Yesenia Ical', null],
  ['Ronaldo Efraín Bámaca', '2918374'],
  ['Mirna Leticia Tuy', null],
  ['Óscar Leonel Tum', null],
  ['Vilma Consuelo Cordón', '8812093'],
  ['Henry Josué Guzmán', null],
  ['Telma Odilia Solares', null],
  ['Douglas Arnoldo Pineda', '1029384'],
  ['Elsa Marina Cabrera', null],
  ['Gerson Isaí Monzón', null],
];

interface LoteSim {
  id: string;
  productoId: string;
  numeroLote: string;
  vence: Date;
  costo: Decimal;
  creado: Date;
}

interface ProductoSim {
  id: string;
  sku: string;
  nombre: string;
  precio: Decimal;
  peso: number;
}

interface Evento {
  t: number;
  orden: number;
  accion: () => void;
}

interface TurnoSim {
  id: string;
  ubicacionId: string;
  cajeroId: string;
  cajeroNombre: string;
  montoInicial: Decimal;
  apertura: Date;
  /** Efectivo en la gaveta (monto inicial + movimientos en efectivo con signo). */
  efectivo: Decimal;
  ventas: { id: string; numero: number; t: number }[];
}

/** Divide en bloques para no superar el límite de parámetros de PostgreSQL. */
function bloques<T>(filas: T[], tamano = 1000): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < filas.length; i += tamano) {
    resultado.push(filas.slice(i, i + tamano));
  }
  return resultado;
}

export async function sembrarHistoria(prisma: PrismaClient) {
  if (await prisma.compra.findFirst({ where: { numeroDocumento: DOCUMENTO_MARCA } })) {
    console.log('Historia: ya estaba cargada, se omite');
    return;
  }
  const inicio = Date.now();
  const azar = generador(20260714);
  const probabilidad = (p: number) => azar.decimal(0, 1) < p;
  const elegir = <T>(lista: readonly T[]) => lista[azar.entero(0, lista.length - 1)];
  const hoy = hoyGuatemala();
  /** Instante de un día a una hora local de Guatemala (UTC−6). */
  const instante = (dia: Date, horas: number, minutos = 0) =>
    new Date(dia.getTime() + ((horas + 6) * 60 + minutos) * 60_000);
  const masMinutos = (t: Date, minutos: number) => new Date(t.getTime() + minutos * 60_000);

  // ─── Datos existentes ────────────────────────────────────────────────────────
  const ubicaciones = await prisma.ubicacion.findMany({
    where: { codigo: { in: UBICACIONES.map((u) => u.codigo) } },
    include: { municipio: true },
  });
  const ubicacion = (codigo: string) => ubicaciones.find((u) => u.codigo === codigo)!;
  const bodega = ubicaciones.find((u) => u.tipo === TipoUbicacion.BODEGA_CENTRAL)!;
  const sucursales = UBICACIONES.filter((u) => u.tipo !== TipoUbicacion.BODEGA_CENTRAL).map(
    (u) => ({
      ...ubicacion(u.codigo),
      slug: u.slug,
    }),
  );
  const usuarios = await prisma.usuario.findMany();
  const usuario = (cuenta: string) => usuarios.find((u) => u.email === `${cuenta}@farmacia.gt`)!;
  const gerenteBodega = usuario('gerente.bodega');
  const operador = usuario('operador');
  const proveedores = await prisma.proveedor.findMany({
    where: { nit: { in: PROVEEDORES.map((p) => p.nit) } },
    orderBy: { nit: 'asc' },
  });
  const minimos = new Map(
    (await prisma.stockMinimo.findMany()).map((m) => [
      `${m.ubicacionId}|${m.productoId}`,
      m.cantidadMinima,
    ]),
  );
  const repartidores = await prisma.empleado.findMany({
    where: { puesto: Puesto.REPARTIDOR, activo: true },
    orderBy: { dpi: 'asc' },
  });

  const productos: ProductoSim[] = (
    await prisma.producto.findMany({ where: { activo: true }, orderBy: { sku: 'asc' } })
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    precio: p.precioVenta,
    peso: ROTACION_ALTA.includes(p.sku)
      ? 3
      : esRotacionBaja(p.sku)
        ? 0.35
        : Math.round(azar.decimal(0.7, 1.3) * 100) / 100,
  }));
  const producto = (id: string) => productos.find((p) => p.id === id)!;

  const lotes = new Map<string, LoteSim>();
  const lotesPorProducto = new Map<string, LoteSim[]>();
  const agregarLote = (l: LoteSim) => {
    lotes.set(l.id, l);
    lotesPorProducto.set(l.productoId, [...(lotesPorProducto.get(l.productoId) ?? []), l]);
  };
  for (const l of await prisma.lote.findMany()) {
    agregarLote({
      id: l.id,
      productoId: l.productoId,
      numeroLote: l.numeroLote,
      vence: l.fechaVencimiento,
      costo: l.costoUnitario,
      creado: l.createdAt,
    });
  }

  /** Existencia por `ubicacion|lote`. */
  const stock = new Map<string, number>();
  const existentes = new Map<string, { id: string; cantidad: number }>();
  for (const e of await prisma.existencia.findMany()) {
    stock.set(`${e.ubicacionId}|${e.loteId}`, e.cantidad);
    existentes.set(`${e.ubicacionId}|${e.loteId}`, { id: e.id, cantidad: e.cantidad });
  }
  const cantidad = (ubicacionId: string, loteId: string) =>
    stock.get(`${ubicacionId}|${loteId}`) ?? 0;
  const mover = (ubicacionId: string, loteId: string, delta: number) => {
    const nueva = cantidad(ubicacionId, loteId) + delta;
    if (nueva < 0) {
      throw new Error(`Existencia negativa simulada en ${ubicacionId} / ${loteId}`);
    }
    stock.set(`${ubicacionId}|${loteId}`, nueva);
  };
  const vigente = (ubicacionId: string, productoId: string, dia: Date) =>
    (lotesPorProducto.get(productoId) ?? [])
      .filter((l) => l.vence.getTime() >= dia.getTime())
      .reduce((s, l) => s + cantidad(ubicacionId, l.id), 0);
  /** FEFO sin vencidos con la misma función que la API; null si no alcanza. */
  const fefo = (
    ubicacionId: string,
    productoId: string,
    requerida: number,
    dia: Date,
  ): Asignacion[] | null => {
    try {
      return asignarFefo(
        (lotesPorProducto.get(productoId) ?? []).map((l) => ({
          loteId: l.id,
          numeroLote: l.numeroLote,
          fechaVencimiento: l.vence,
          cantidad: cantidad(ubicacionId, l.id),
          creadoEn: l.creado,
        })),
        requerida,
        dia,
        producto(productoId).nombre,
      );
    } catch {
      return null;
    }
  };

  /** Productos que maneja cada sucursal: los de su inventario de apertura. */
  const surtido = new Map<string, ProductoSim[]>();
  for (const s of sucursales) {
    surtido.set(
      s.id,
      productos.filter((p) =>
        (lotesPorProducto.get(p.id) ?? []).some((l) => existentes.has(`${s.id}|${l.id}`)),
      ),
    );
  }
  /** Demanda diaria estimada de un producto en una sucursal (unidades). */
  const demanda = (sucursalId: string, p: ProductoSim) => {
    const lista = surtido.get(sucursalId)!;
    if (!lista.includes(p)) {
      return 0;
    }
    const codigo = sucursales.find((s) => s.id === sucursalId)!.codigo;
    const pesos = lista.reduce((s, x) => s + x.peso, 0);
    return (VENTAS_POR_DIA[codigo] * UNIDADES_POR_VENTA * p.peso) / pesos;
  };

  // ─── Registros que se guardan al final ───────────────────────────────────────
  const filas = {
    clientes: [] as Prisma.ClienteCreateManyInput[],
    direcciones: [] as Prisma.DireccionClienteCreateManyInput[],
    lotes: [] as Prisma.LoteCreateManyInput[],
    compras: [] as Prisma.CompraCreateManyInput[],
    detallesCompra: [] as Prisma.DetalleCompraCreateManyInput[],
    traslados: [] as Prisma.TrasladoCreateManyInput[],
    detallesTraslado: [] as Prisma.DetalleTrasladoCreateManyInput[],
    turnos: [] as Prisma.TurnoCajaCreateManyInput[],
    pedidos: [] as Prisma.PedidoCreateManyInput[],
    detallesPedido: [] as Prisma.DetallePedidoCreateManyInput[],
    ventas: [] as Prisma.VentaCreateManyInput[],
    detallesVenta: [] as Prisma.DetalleVentaCreateManyInput[],
    pagos: [] as Prisma.PagoCreateManyInput[],
    movimientosCaja: [] as Prisma.MovimientoCajaCreateManyInput[],
    kardex: [] as Prisma.MovimientoInventarioCreateManyInput[],
    historialPedido: [] as Prisma.HistorialPedidoCreateManyInput[],
    entregas: [] as Prisma.EntregaCreateManyInput[],
  };
  const maximo = async (tabla: 'venta' | 'pedido' | 'traslado') =>
    (
      await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COALESCE(MAX(numero), 0)::int AS n FROM ${tabla}`,
      )
    )[0].n;
  const numeros = {
    venta: await maximo('venta'),
    pedido: await maximo('pedido'),
    traslado: await maximo('traslado'),
  };

  const kardex = (datos: {
    tipo: TipoMovimientoInventario;
    ubicacionId: string;
    loteId: string;
    cantidad: number;
    usuarioId: string;
    fecha: Date;
    referenciaTipo: string;
    referenciaId?: string;
    motivo?: string;
  }) => {
    mover(datos.ubicacionId, datos.loteId, datos.cantidad);
    filas.kardex.push({
      id: randomUUID(),
      tipo: datos.tipo,
      ubicacionId: datos.ubicacionId,
      loteId: datos.loteId,
      cantidad: datos.cantidad,
      costoUnitario: lotes.get(datos.loteId)!.costo,
      referenciaTipo: datos.referenciaTipo,
      referenciaId: datos.referenciaId,
      motivo: datos.motivo,
      usuarioId: datos.usuarioId,
      createdAt: datos.fecha,
    });
  };
  const movimientoCaja = (
    turno: TurnoSim,
    datos: {
      tipo: TipoMovimientoCaja;
      metodoPago: MetodoPago;
      monto: Decimal;
      referenciaId?: string;
      descripcion: string;
      usuarioId: string;
      fecha: Date;
    },
  ) => {
    const monto = montoConSigno(datos.tipo, datos.monto);
    if (METODOS_EN_EFECTIVO.includes(datos.metodoPago)) {
      turno.efectivo = turno.efectivo.add(monto);
    }
    filas.movimientosCaja.push({
      id: randomUUID(),
      turnoCajaId: turno.id,
      tipo: datos.tipo,
      metodoPago: datos.metodoPago,
      monto,
      referenciaId: datos.referenciaId,
      descripcion: datos.descripcion,
      usuarioId: datos.usuarioId,
      createdAt: datos.fecha,
    });
  };
  const autorizacion = () => `AUT-${azar.entero(100000, 999999)}`;

  // ─── Clientes del call center ────────────────────────────────────────────────
  const clientes = CLIENTES.map(([nombre, nit], i) => {
    const sucursal = sucursales[i % sucursales.length];
    const latitud = Number(sucursal.latitud) + azar.decimal(-0.012, 0.012);
    const longitud = Number(sucursal.longitud) + azar.decimal(-0.012, 0.012);
    const cliente = {
      id: randomUUID(),
      nombre,
      nit,
      sucursal,
      direccionId: randomUUID(),
      destino: { latitud, longitud },
    };
    const creado = instante(sumarDias(hoy, -DIAS - 5 + (i % 5)), 9);
    filas.clientes.push({
      id: cliente.id,
      nombre,
      telefono: `553${String(10_001 + i * 37).padStart(5, '0')}`,
      nit,
      createdAt: creado,
      updatedAt: creado,
    });
    filas.direcciones.push({
      id: cliente.direccionId,
      clienteId: cliente.id,
      alias: 'Casa',
      direccion: `${azar.entero(1, 12)}a. calle ${azar.entero(1, 20)}-${azar.entero(10, 90)}, zona ${azar.entero(1, 6)}, ${sucursal.municipio.nombre}`,
      municipioId: sucursal.municipioId,
      latitud: Math.round(latitud * 1e6) / 1e6,
      longitud: Math.round(longitud * 1e6) / 1e6,
      principal: true,
      createdAt: creado,
      updatedAt: creado,
    });
    return cliente;
  });

  // ─── Agenda de eventos ───────────────────────────────────────────────────────
  // Primero se programa todo; después se ejecuta en orden cronológico. Un evento puede programar
  // otro más tarde (preparar y entregar un pedido), que se inserta en su lugar.
  const agenda: Evento[] = [];
  let orden = 0;
  let actual = -1;
  const programar = (t: Date, accion: () => void) => {
    const evento = { t: t.getTime(), orden: orden++, accion };
    if (actual < 0) {
      agenda.push(evento);
      return;
    }
    let desde = actual + 1;
    let hasta = agenda.length;
    while (desde < hasta) {
      const medio = (desde + hasta) >> 1;
      if (agenda[medio].t <= evento.t) {
        desde = medio + 1;
      } else {
        hasta = medio;
      }
    }
    agenda.splice(desde, 0, evento);
  };

  for (let d = -DIAS; d <= -1; d++) {
    const dia = sumarDias(hoy, d);
    const avance = (d + DIAS) / DIAS;
    const quincena = [1, 15, 16, 28, 29, 30, 31].includes(dia.getUTCDate()) ? 1.12 : 1;
    const factorDia = FACTOR_SEMANA[dia.getUTCDay()] * (0.9 + 0.2 * avance) * quincena;

    // Compras de reabastecimiento de la bodega (RF-07).
    const nCompra = DIAS_COMPRA.indexOf(d);
    if (nCompra >= 0) {
      programar(instante(dia, 9), () => {
        const proveedor = proveedores[(nCompra + 1) % proveedores.length];
        const compraId = randomUUID();
        const fecha = instante(dia, 9);
        let total = new Decimal(0);
        const comprar = (
          p: ProductoSim,
          unidades: number,
          vence: Date,
          sufijo: string,
          descuento = 1,
        ) => {
          const lote: LoteSim = {
            id: randomUUID(),
            productoId: p.id,
            numeroLote: `${p.sku.replace('MED-', 'L')}-${sufijo}${azar.entero(10, 99)}`,
            vence,
            costo: p.precio.mul(azar.decimal(0.55, 0.68) * descuento).toDecimalPlaces(2),
            creado: fecha,
          };
          agregarLote(lote);
          filas.lotes.push({
            id: lote.id,
            productoId: p.id,
            numeroLote: lote.numeroLote,
            fechaVencimiento: vence,
            costoUnitario: lote.costo,
            proveedorId: proveedor.id,
            createdAt: fecha,
            updatedAt: fecha,
          });
          const subtotal = lote.costo.mul(unidades);
          total = total.add(subtotal);
          filas.detallesCompra.push({
            compraId,
            productoId: p.id,
            loteId: lote.id,
            cantidad: unidades,
            costoUnitario: lote.costo,
            subtotal,
            createdAt: fecha,
            updatedAt: fecha,
          });
          kardex({
            tipo: TipoMovimientoInventario.COMPRA,
            ubicacionId: bodega.id,
            loteId: lote.id,
            cantidad: unidades,
            usuarioId: gerenteBodega.id,
            fecha,
            referenciaTipo: 'COMPRA',
            referenciaId: compraId,
          });
        };
        for (const p of productos) {
          // Se compra si la bodega tiene menos del 75 % de seis semanas de demanda de la cadena.
          const objetivo = sucursales.reduce((s, x) => s + demanda(x.id, p), 0) * 42;
          const hay = vigente(bodega.id, p.id, dia);
          if (hay < objetivo * 0.75) {
            const unidades = Math.max(30, Math.ceil((objetivo - hay) / 10) * 10);
            comprar(p, unidades, sumarDias(dia, azar.entero(330, 720)), `R${nCompra + 1}`);
          }
          // La última compra trae lotes de corta fecha con descuento: hoy están por vencer.
          if (nCompra === DIAS_COMPRA.length - 1 && Number(p.sku.slice(4)) % 6 === 2) {
            comprar(p, azar.entero(40, 90), sumarDias(hoy, azar.entero(25, 80)), 'CF', 0.8);
          }
        }
        filas.compras.push({
          id: compraId,
          proveedorId: proveedor.id,
          ubicacionId: bodega.id,
          numeroDocumento: `SEED-FAC-${String(nCompra + 4).padStart(4, '0')}`,
          fecha: dia,
          total,
          observaciones:
            nCompra === DIAS_COMPRA.length - 1
              ? 'Reabastecimiento; incluye lotes de corta fecha con descuento'
              : 'Reabastecimiento de la bodega (datos de demostración)',
          usuarioId: gerenteBodega.id,
          createdAt: fecha,
          updatedAt: fecha,
        });
      });
    }

    // Traslados quincenales de la bodega: se solicitan el día d y salen al día siguiente.
    sucursales.forEach((s, k) => {
      const diasViaje = s.codigo === 'CC-PETEN' ? 2 : 1;
      if ((d + 140 + 2 * k) % 14 !== 0 || d + diasViaje > -1) {
        return;
      }
      const gerente = usuario(`gerente.${s.slug}`);
      const solicitud = instante(dia, 9, 30 + k * 3);
      const aprobacion = instante(dia, 11, azar.entero(0, 50));
      const manana = sumarDias(dia, 1);
      const despacho = instante(manana, 7, 30 + k * 6);
      const recepcion =
        diasViaje === 2
          ? instante(sumarDias(dia, 2), 10, azar.entero(0, 40))
          : instante(manana, 14, azar.entero(0, 90));

      // Unos pocos se cancelan por error en la solicitud (no mueven inventario).
      if (probabilidad(0.06)) {
        programar(solicitud, () => {
          const trasladoId = randomUUID();
          const numero = ++numeros.traslado;
          const cancelacion = masMinutos(solicitud, azar.entero(20, 90));
          filas.traslados.push({
            id: trasladoId,
            numero,
            origenId: bodega.id,
            destinoId: s.id,
            estado: EstadoTraslado.CANCELADO,
            motivo: MotivoTraslado.REABASTECIMIENTO,
            observaciones: 'Reposición programada de existencias',
            motivoCancelacion: elegir([
              'Solicitud duplicada',
              'Se pidió por error; la sucursal sí tenía existencia',
            ]),
            solicitadoPorId: gerente.id,
            canceladoPorId: gerente.id,
            fechaSolicitud: solicitud,
            fechaCancelacion: cancelacion,
            createdAt: solicitud,
            updatedAt: cancelacion,
          });
          for (const p of surtido.get(s.id)!.slice(k, k + 2)) {
            filas.detallesTraslado.push({
              trasladoId,
              productoId: p.id,
              cantidadSolicitada: azar.entero(10, 30),
              createdAt: solicitud,
              updatedAt: solicitud,
            });
          }
        });
        return;
      }

      // Lo que se pide se decide con la existencia de la mañana del despacho.
      const trasladoId = randomUUID();
      let numero = 0;
      const enviados: {
        productoId: string;
        loteId: string;
        cantidad: number;
        detalleId: string;
      }[] = [];
      programar(despacho, () => {
        for (const p of surtido.get(s.id)!) {
          if (EXCLUSIVOS.includes(p.sku) && s.codigo !== 'CC-XELA') {
            continue;
          }
          // Se pide si quedan menos de 16 días de venta o menos del stock mínimo; se repone hasta 30
          // días de venta o 1.5 veces el mínimo.
          const r = demanda(s.id, p);
          const minimo = minimos.get(`${s.id}|${p.id}`) ?? 0;
          const hay = vigente(s.id, p.id, manana);
          if (hay >= Math.max(Math.ceil(r * 16) + 4, minimo)) {
            continue;
          }
          const objetivo = Math.max(Math.ceil(r * 30) + 8, Math.ceil(minimo * 1.5 + r * 14));
          const pedir = Math.min(objetivo - hay, vigente(bodega.id, p.id, manana));
          if (pedir < 3) {
            continue;
          }
          for (const a of fefo(bodega.id, p.id, pedir, manana)!) {
            const detalleId = randomUUID();
            enviados.push({ productoId: p.id, loteId: a.loteId, cantidad: a.cantidad, detalleId });
          }
        }
        if (enviados.length === 0) {
          return;
        }
        numero = ++numeros.traslado;
        for (const e of enviados) {
          kardex({
            tipo: TipoMovimientoInventario.TRASLADO_SALIDA,
            ubicacionId: bodega.id,
            loteId: e.loteId,
            cantidad: -e.cantidad,
            usuarioId: gerenteBodega.id,
            fecha: despacho,
            referenciaTipo: 'TRASLADO',
            referenciaId: trasladoId,
            motivo: `Traslado #${numero} hacia ${s.nombre}`,
          });
        }
      });
      programar(recepcion, () => {
        if (enviados.length === 0) {
          return;
        }
        const conFaltante = probabilidad(0.1) ? azar.entero(0, enviados.length - 1) : -1;
        const motivoFaltante = elegir(FALTANTES_TRASLADO);
        enviados.forEach((e, i) => {
          const faltante = i === conFaltante ? Math.min(e.cantidad, azar.entero(1, 3)) : 0;
          filas.detallesTraslado.push({
            id: e.detalleId,
            trasladoId,
            productoId: e.productoId,
            loteId: e.loteId,
            cantidadSolicitada: e.cantidad,
            cantidadEnviada: e.cantidad,
            cantidadRecibida: e.cantidad - faltante,
            createdAt: solicitud,
            updatedAt: recepcion,
          });
          kardex({
            tipo: TipoMovimientoInventario.TRASLADO_ENTRADA,
            ubicacionId: s.id,
            loteId: e.loteId,
            cantidad: e.cantidad,
            usuarioId: gerente.id,
            fecha: recepcion,
            referenciaTipo: 'TRASLADO',
            referenciaId: trasladoId,
            motivo: `Traslado #${numero} desde ${bodega.nombre}`,
          });
          if (faltante > 0) {
            kardex({
              tipo: TipoMovimientoInventario.AJUSTE,
              ubicacionId: s.id,
              loteId: e.loteId,
              cantidad: -faltante,
              usuarioId: gerente.id,
              // Un segundo después de la entrada, para que el kardex la muestre primero.
              fecha: new Date(recepcion.getTime() + 1000),
              referenciaTipo: 'TRASLADO',
              referenciaId: trasladoId,
              motivo: `Diferencia al recibir el traslado #${numero}: ${motivoFaltante}`,
            });
          }
        });
        filas.traslados.push({
          id: trasladoId,
          numero,
          origenId: bodega.id,
          destinoId: s.id,
          estado: EstadoTraslado.RECIBIDO,
          motivo: MotivoTraslado.REABASTECIMIENTO,
          observaciones: 'Reposición programada de existencias',
          solicitadoPorId: gerente.id,
          aprobadoPorId: gerenteBodega.id,
          despachadoPorId: gerenteBodega.id,
          recibidoPorId: gerente.id,
          fechaSolicitud: solicitud,
          fechaAprobacion: aprobacion,
          fechaDespacho: despacho,
          fechaRecepcion: recepcion,
          createdAt: solicitud,
          updatedAt: recepcion,
        });
      });
    });

    // Un turno de caja por sucursal (RF-14 a RF-17).
    const turnos = new Map<string, TurnoSim>();
    for (const s of sucursales) {
      const cajero = usuario(`cajero.${s.slug}`);
      const gerente = usuario(`gerente.${s.slug}`);
      const apertura = instante(dia, 7, 30 + azar.entero(0, 20));
      const cierre = instante(dia, 19, 30 + azar.entero(0, 25));
      const montoInicial = new Decimal(s.tipo === TipoUbicacion.FARMACIA_CC ? 500 : 300);
      const turno: TurnoSim = {
        id: randomUUID(),
        ubicacionId: s.id,
        cajeroId: cajero.id,
        cajeroNombre: cajero.nombre,
        montoInicial,
        apertura,
        efectivo: montoInicial,
        ventas: [],
      };
      turnos.set(s.id, turno);

      if (probabilidad(0.05)) {
        programar(masMinutos(apertura, 3), () =>
          movimientoCaja(turno, {
            tipo: TipoMovimientoCaja.DEPOSITO,
            metodoPago: MetodoPago.EFECTIVO,
            monto: new Decimal(elegir([100, 150, 200])),
            descripcion: 'Sencillo para cambio',
            usuarioId: cajero.id,
            fecha: masMinutos(apertura, 3),
          }),
        );
      }

      // Ventas de mostrador repartidas en el día.
      const nVentas = Math.round(VENTAS_POR_DIA[s.codigo] * factorDia * azar.decimal(0.8, 1.2));
      const span = cierre.getTime() - apertura.getTime() - 25 * 60_000;
      for (let v = 0; v < nVentas; v++) {
        const t = new Date(apertura.getTime() + 10 * 60_000 + azar.decimal(0, 1) * span);
        programar(t, () => {
          const lineas = elegir([1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
          const items: { p: ProductoSim; asignados: Asignacion[] }[] = [];
          const lista = surtido.get(s.id)!;
          const pesos = lista.reduce((x, p) => x + p.peso, 0);
          for (let intento = 0; items.length < lineas && intento < lineas * 4; intento++) {
            let r = azar.decimal(0, pesos);
            const p = lista.find((x) => (r -= x.peso) <= 0) ?? lista[lista.length - 1];
            if (items.some((i) => i.p === p)) {
              continue;
            }
            const asignados = fefo(s.id, p.id, elegir([1, 1, 1, 1, 1, 2, 2, 2, 3, 4, 6]), dia);
            if (asignados) {
              items.push({ p, asignados });
            }
          }
          if (items.length === 0) {
            return;
          }
          const ventaId = randomUUID();
          const numero = ++numeros.venta;
          let total = new Decimal(0);
          for (const { p, asignados } of items) {
            for (const a of asignados) {
              const subtotal = p.precio.mul(a.cantidad);
              total = total.add(subtotal);
              filas.detallesVenta.push({
                ventaId,
                productoId: p.id,
                loteId: a.loteId,
                cantidad: a.cantidad,
                precioUnitario: p.precio,
                subtotal,
                createdAt: t,
                updatedAt: t,
              });
              kardex({
                tipo: TipoMovimientoInventario.VENTA,
                ubicacionId: s.id,
                loteId: a.loteId,
                cantidad: -a.cantidad,
                usuarioId: cajero.id,
                fecha: t,
                referenciaTipo: 'VENTA',
                referenciaId: ventaId,
                motivo: `Venta #${numero}`,
              });
            }
          }
          // 60 % efectivo, 30 % tarjeta y 10 % pago mixto.
          const r = azar.decimal(0, 1);
          const tarjeta =
            r < 0.6
              ? new Decimal(0)
              : r < 0.9 || total.lessThan(20)
                ? total
                : total.mul(azar.decimal(0.4, 0.8)).toDecimalPlaces(0);
          const pagos = [
            ...(tarjeta.greaterThan(0)
              ? [{ metodo: MetodoPago.TARJETA, monto: tarjeta, referencia: autorizacion() }]
              : []),
            ...(total.sub(tarjeta).greaterThan(0)
              ? [{ metodo: MetodoPago.EFECTIVO, monto: total.sub(tarjeta), referencia: null }]
              : []),
          ];
          filas.ventas.push({
            id: ventaId,
            numero,
            ubicacionId: s.id,
            turnoCajaId: turno.id,
            nit: probabilidad(0.22)
              ? `${azar.entero(1_000_000, 9_999_999)}${azar.entero(0, 9)}`
              : 'CF',
            canal: CanalVenta.MOSTRADOR,
            total,
            usuarioId: cajero.id,
            createdAt: t,
            updatedAt: t,
          });
          for (const pago of pagos) {
            filas.pagos.push({ ventaId, ...pago, createdAt: t, updatedAt: t });
            movimientoCaja(turno, {
              tipo: TipoMovimientoCaja.VENTA,
              metodoPago: pago.metodo,
              monto: pago.monto,
              referenciaId: ventaId,
              descripcion: `Venta #${numero}`,
              usuarioId: cajero.id,
              fecha: t,
            });
          }
          turno.ventas.push({ id: ventaId, numero, t: t.getTime() });
        });
      }

      // Gastos menores pagados de la gaveta.
      if (probabilidad(0.18)) {
        const [descripcion, min, max] = elegir(GASTOS);
        const t = instante(dia, azar.entero(10, 16), azar.entero(0, 59));
        programar(t, () =>
          movimientoCaja(turno, {
            tipo: TipoMovimientoCaja.GASTO,
            metodoPago: MetodoPago.EFECTIVO,
            monto: new Decimal(azar.entero(min * 4, max * 4) / 4),
            descripcion,
            usuarioId: cajero.id,
            fecha: t,
          }),
        );
      }

      // Retiro parcial a la caja fuerte si a media tarde hay mucho efectivo.
      const tRetiro = instante(dia, 15, azar.entero(0, 40));
      programar(tRetiro, () => {
        if (turno.efectivo.lessThan(2_500)) {
          return;
        }
        movimientoCaja(turno, {
          tipo: TipoMovimientoCaja.RETIRO,
          metodoPago: MetodoPago.EFECTIVO,
          monto: turno.efectivo.sub(700).div(500).floor().mul(500),
          descripcion: 'Retiro parcial a caja fuerte',
          usuarioId: cajero.id,
          fecha: tRetiro,
        });
      });

      // Anulación de una venta del turno por el gerente (RN-14), mientras el turno sigue abierto.
      if (probabilidad(0.035)) {
        const t = instante(dia, azar.entero(12, 18), azar.entero(0, 59));
        programar(t, () => {
          const venta = [...turno.ventas].reverse().find((v) => v.t < t.getTime());
          if (!venta) {
            return;
          }
          const fila = filas.ventas.find((v) => v.id === venta.id)!;
          const pagos = filas.pagos.filter((p) => p.ventaId === venta.id);
          const efectivo = pagos
            .filter((p) => p.metodo === MetodoPago.EFECTIVO)
            .reduce((x, p) => x.add(p.monto as Decimal), new Decimal(0));
          if (turno.efectivo.lessThan(efectivo)) {
            return;
          }
          const razon = elegir(MOTIVOS_ANULACION);
          const motivo = `Anulación de la venta #${venta.numero}: ${razon}`;
          Object.assign(fila, {
            estado: EstadoVenta.ANULADA,
            motivoAnulacion: razon,
            fechaAnulacion: t,
            anuladaPorId: gerente.id,
            updatedAt: t,
          });
          for (const dv of filas.detallesVenta.filter((x) => x.ventaId === venta.id)) {
            kardex({
              tipo: TipoMovimientoInventario.ANULACION_VENTA,
              ubicacionId: s.id,
              loteId: dv.loteId,
              cantidad: dv.cantidad,
              usuarioId: gerente.id,
              fecha: t,
              referenciaTipo: 'VENTA',
              referenciaId: venta.id,
              motivo,
            });
          }
          for (const p of pagos) {
            movimientoCaja(turno, {
              tipo: TipoMovimientoCaja.ANULACION,
              metodoPago: p.metodo,
              monto: p.monto as Decimal,
              referenciaId: venta.id,
              descripcion: motivo,
              usuarioId: gerente.id,
              fecha: t,
            });
          }
        });
      }

      // Cierre con arqueo (RN-12): la mayoría cuadra; algunos con faltante o sobrante.
      programar(cierre, () => {
        const r = azar.decimal(0, 1);
        const diferencia =
          r < 0.07
            ? -elegir([0.5, 1, 2.5, 5, 10, 12.75, 20, 35.5])
            : r < 0.11
              ? elegir([0.25, 1, 2, 5, 10])
              : 0;
        const observaciones =
          diferencia < 0
            ? elegir([
                'Faltante sin explicación; se reportó al gerente',
                'Posible error al dar cambio',
                'Faltante en monedas',
              ])
            : diferencia > 0
              ? elegir([
                  'Sobrante: un cliente no esperó su cambio',
                  'Sobrante sin identificar; se reportó al gerente',
                ])
              : null;
        filas.turnos.push({
          id: turno.id,
          ubicacionId: s.id,
          cajeroId: cajero.id,
          apertura,
          cierre,
          montoInicial,
          efectivoEsperado: turno.efectivo,
          efectivoContado: turno.efectivo.add(diferencia),
          diferencia: new Decimal(diferencia),
          estado: EstadoTurnoCaja.CERRADO,
          observaciones,
          createdAt: apertura,
          updatedAt: cierre,
        });
      });
    }

    // Pedidos del call center (RF-20 a RF-24), cobrados al entregar en la caja de la sucursal.
    const nPedidos = Math.round((dia.getUTCDay() === 0 ? 2 : 3) * factorDia + azar.entero(0, 2));
    for (let n = 0; n < nPedidos; n++) {
      const cliente = elegir(clientes);
      const s = cliente.sucursal;
      const cajero = usuario(`cajero.${s.slug}`);
      const creado = instante(dia, azar.entero(8, 16), azar.entero(0, 59) + 30);
      programar(creado, () => {
        const lista = surtido.get(s.id)!.filter((p) => !EXCLUSIVOS.includes(p.sku));
        const items: { p: ProductoSim; cantidad: number }[] = [];
        for (let i = 0; i < azar.entero(1, 3); i++) {
          const p = elegir(lista);
          const unidades = azar.entero(1, 3);
          if (!items.some((x) => x.p === p) && vigente(s.id, p.id, dia) >= unidades) {
            items.push({ p, cantidad: unidades });
          }
        }
        if (items.length === 0) {
          return;
        }
        const pedidoId = randomUUID();
        const numero = ++numeros.pedido;
        const ruta = estimarRuta(
          { latitud: Number(s.latitud), longitud: Number(s.longitud) },
          cliente.destino,
          PARAMETROS.VELOCIDAD_PROMEDIO_KMH.porDefecto,
        );
        const tiempo = ruta.duracionMin + PARAMETROS.TIEMPO_PREPARACION_MIN.porDefecto;
        const cinco = 5 * 60_000;
        const compromiso = new Date(
          Math.ceil((creado.getTime() + tiempo * 60_000) / cinco) * cinco,
        );
        const total = items.reduce((x, i) => x.add(i.p.precio.mul(i.cantidad)), new Decimal(0));
        const metodoPago = probabilidad(0.7) ? MetodoPago.CONTRA_ENTREGA : MetodoPago.TARJETA;
        const pedido: Prisma.PedidoCreateManyInput = {
          id: pedidoId,
          numero,
          clienteId: cliente.id,
          direccionId: cliente.direccionId,
          ubicacionDespachoId: s.id,
          operadorId: operador.id,
          estado: EstadoPedido.PENDIENTE,
          metodoPago,
          total,
          tiempoEstimadoMin: tiempo,
          distanciaKm: ruta.distanciaKm,
          fuenteEstimacion: ruta.fuente,
          fechaCompromiso: compromiso,
          createdAt: creado,
          updatedAt: creado,
        };
        filas.pedidos.push(pedido);
        for (const i of items) {
          filas.detallesPedido.push({
            pedidoId,
            productoId: i.p.id,
            cantidad: i.cantidad,
            precioUnitario: i.p.precio,
            subtotal: i.p.precio.mul(i.cantidad),
            createdAt: creado,
            updatedAt: creado,
          });
        }
        const historial = (
          anterior: EstadoPedido | null,
          nuevo: EstadoPedido,
          t: Date,
          usuarioId: string,
          nota: string | null = null,
        ) =>
          filas.historialPedido.push({
            pedidoId,
            estadoAnterior: anterior,
            estadoNuevo: nuevo,
            nota,
            usuarioId,
            createdAt: t,
          });
        historial(null, EstadoPedido.PENDIENTE, creado, operador.id, 'Pedido creado');
        const cancelar = (estado: EstadoPedido, t: Date, motivo: string) => {
          Object.assign(pedido, {
            estado: EstadoPedido.CANCELADO,
            motivoCancelacion: motivo,
            updatedAt: t,
          });
          historial(estado, EstadoPedido.CANCELADO, t, operador.id, motivo);
        };

        // Algunos se cancelan antes de prepararlos.
        if (probabilidad(0.07)) {
          cancelar(
            EstadoPedido.PENDIENTE,
            masMinutos(creado, azar.entero(4, 20)),
            elegir(MOTIVOS_CANCELACION_PEDIDO),
          );
          return;
        }

        // RN-21: al preparar se descuenta por FEFO y se genera la venta CALL_CENTER.
        const tPreparar = masMinutos(creado, azar.entero(2, 6));
        programar(tPreparar, () => {
          const asignados = items.map((i) => fefo(s.id, i.p.id, i.cantidad, dia));
          if (asignados.some((a) => a === null)) {
            cancelar(
              EstadoPedido.PENDIENTE,
              tPreparar,
              'Se vendió la última existencia en mostrador antes de prepararlo',
            );
            return;
          }
          const ventaId = randomUUID();
          const nVenta = ++numeros.venta;
          const venta: Prisma.VentaCreateManyInput = {
            id: ventaId,
            numero: nVenta,
            ubicacionId: s.id,
            nit: normalizarNit(cliente.nit),
            canal: CanalVenta.CALL_CENTER,
            pedidoId,
            total,
            usuarioId: cajero.id,
            createdAt: tPreparar,
            updatedAt: tPreparar,
          };
          filas.ventas.push(venta);
          items.forEach((i, k) => {
            for (const a of asignados[k]!) {
              filas.detallesVenta.push({
                ventaId,
                productoId: i.p.id,
                loteId: a.loteId,
                cantidad: a.cantidad,
                precioUnitario: i.p.precio,
                subtotal: i.p.precio.mul(a.cantidad),
                createdAt: tPreparar,
                updatedAt: tPreparar,
              });
              kardex({
                tipo: TipoMovimientoInventario.VENTA,
                ubicacionId: s.id,
                loteId: a.loteId,
                cantidad: -a.cantidad,
                usuarioId: cajero.id,
                fecha: tPreparar,
                referenciaTipo: 'VENTA',
                referenciaId: ventaId,
                motivo: `Venta #${nVenta}`,
              });
            }
          });
          historial(EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION, tPreparar, cajero.id);
          historial(
            EstadoPedido.EN_PREPARACION,
            EstadoPedido.EN_PREPARACION,
            tPreparar,
            cajero.id,
            `Venta #${nVenta} generada; inventario descontado`,
          );

          // Pocos se cancelan ya preparados: la venta se anula y el inventario regresa.
          if (probabilidad(0.03)) {
            const t = masMinutos(tPreparar, azar.entero(3, 10));
            programar(t, () => {
              const motivo = 'El cliente canceló; el pedido aún no salía';
              cancelar(EstadoPedido.EN_PREPARACION, t, motivo);
              Object.assign(venta, {
                estado: EstadoVenta.ANULADA,
                motivoAnulacion: `Pedido #${numero} cancelado: ${motivo}`,
                fechaAnulacion: t,
                anuladaPorId: operador.id,
                updatedAt: t,
              });
              for (const dv of filas.detallesVenta.filter((x) => x.ventaId === ventaId)) {
                kardex({
                  tipo: TipoMovimientoInventario.ANULACION_VENTA,
                  ubicacionId: s.id,
                  loteId: dv.loteId,
                  cantidad: dv.cantidad,
                  usuarioId: operador.id,
                  fecha: t,
                  referenciaTipo: 'VENTA',
                  referenciaId: ventaId,
                  motivo: `Anulación de la venta #${nVenta}: Pedido #${numero} cancelado: ${motivo}`,
                });
              }
              historial(
                EstadoPedido.CANCELADO,
                EstadoPedido.CANCELADO,
                t,
                operador.id,
                `Venta #${nVenta} anulada; inventario devuelto`,
              );
            });
            return;
          }

          const delSitio = repartidores.filter((r) => r.ubicacionId === s.id);
          const repartidor = elegir(delSitio);
          const tAsignar = masMinutos(tPreparar, azar.entero(2, 4));
          const tSalir = masMinutos(tAsignar, azar.entero(1, 3));
          const atrasado = probabilidad(0.12);
          let tEntrega = masMinutos(tSalir, ruta.duracionMin + azar.entero(0, 5));
          if (atrasado) {
            tEntrega = masMinutos(
              new Date(Math.max(tEntrega.getTime(), compromiso.getTime())),
              azar.entero(8, 40),
            );
          }
          historial(
            EstadoPedido.EN_PREPARACION,
            EstadoPedido.ASIGNADO,
            tAsignar,
            cajero.id,
            `Repartidor: ${repartidor.nombres} ${repartidor.apellidos}`,
          );
          historial(EstadoPedido.ASIGNADO, EstadoPedido.EN_CAMINO, tSalir, cajero.id);
          const notas = atrasado
            ? elegir(NOTAS_ATRASO)
            : probabilidad(0.2)
              ? 'Entregado en portería'
              : null;
          filas.entregas.push({
            pedidoId,
            repartidorId: repartidor.id,
            horaSalida: tSalir,
            horaEntrega: tEntrega,
            notas,
            createdAt: tAsignar,
            updatedAt: tEntrega,
          });

          // RF-24: el cobro entra a la caja del cajero que confirma la entrega.
          programar(tEntrega, () => {
            const turno = turnos.get(s.id)!;
            historial(
              EstadoPedido.EN_CAMINO,
              EstadoPedido.ENTREGADO,
              tEntrega,
              cajero.id,
              `Cobrado en la caja de ${turno.cajeroNombre}`,
            );
            Object.assign(pedido, {
              estado: EstadoPedido.ENTREGADO,
              fechaEntrega: tEntrega,
              updatedAt: tEntrega,
            });
            const referencia = metodoPago === MetodoPago.TARJETA ? autorizacion() : null;
            filas.pagos.push({
              ventaId,
              metodo: metodoPago,
              monto: total,
              referencia,
              createdAt: tEntrega,
              updatedAt: tEntrega,
            });
            movimientoCaja(turno, {
              tipo: TipoMovimientoCaja.COBRO_CONTRA_ENTREGA,
              metodoPago,
              monto: total,
              referenciaId: ventaId,
              descripcion: `Pedido #${numero} (venta #${nVenta})`,
              usuarioId: cajero.id,
              fecha: tEntrega,
            });
          });
        });
      });
    }

    // Bajas de lotes vencidos (RN-07): la bodega a las tres semanas; Xela y Escuintla enseguida.
    const plazos: [string, number, string][] = [
      [bodega.id, 21, gerenteBodega.id],
      [ubicacion('CC-XELA').id, 3, usuario('gerente.xela').id],
      [ubicacion('CC-ESCUINTLA').id, 5, usuario('gerente.escuintla').id],
    ];
    programar(instante(dia, 7, 10), () => {
      for (const lote of lotes.values()) {
        for (const [ubicacionId, plazo, usuarioId] of plazos) {
          const unidades = cantidad(ubicacionId, lote.id);
          if (unidades > 0 && sumarDias(lote.vence, plazo + 1).getTime() === dia.getTime()) {
            kardex({
              tipo: TipoMovimientoInventario.BAJA_VENCIMIENTO,
              ubicacionId,
              loteId: lote.id,
              cantidad: -unidades,
              usuarioId,
              fecha: instante(dia, 7, 10),
              referenciaTipo: 'BAJA',
              motivo: `Lote vencido el ${fechaCorta(lote.vence)}`,
            });
          }
        }
      }
    });
  }
  agenda.sort((a, b) => a.t - b.t || a.orden - b.orden);
  for (actual = 0; actual < agenda.length; actual++) {
    agenda[actual].accion();
  }

  // ─── Guardar en una sola transacción ─────────────────────────────────────────
  const nuevasExistencias: Prisma.ExistenciaCreateManyInput[] = [];
  const cambios: [string, number][] = [];
  for (const [clave, valor] of stock) {
    const previa = existentes.get(clave);
    if (previa) {
      if (previa.cantidad !== valor) {
        cambios.push([previa.id, valor]);
      }
    } else {
      const [ubicacionId, loteId] = clave.split('|');
      nuevasExistencias.push({ ubicacionId, loteId, cantidad: valor });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const insertar = async <T>(crear: (data: T[]) => Promise<unknown>, datos: T[]) => {
        for (const b of bloques(datos)) {
          await crear(b);
        }
      };
      await insertar((data) => tx.cliente.createMany({ data }), filas.clientes);
      await insertar((data) => tx.direccionCliente.createMany({ data }), filas.direcciones);
      await insertar((data) => tx.lote.createMany({ data }), filas.lotes);
      await insertar((data) => tx.compra.createMany({ data }), filas.compras);
      await insertar((data) => tx.detalleCompra.createMany({ data }), filas.detallesCompra);
      await insertar((data) => tx.traslado.createMany({ data }), filas.traslados);
      await insertar((data) => tx.detalleTraslado.createMany({ data }), filas.detallesTraslado);
      await insertar((data) => tx.turnoCaja.createMany({ data }), filas.turnos);
      await insertar((data) => tx.pedido.createMany({ data }), filas.pedidos);
      await insertar((data) => tx.detallePedido.createMany({ data }), filas.detallesPedido);
      await insertar((data) => tx.venta.createMany({ data }), filas.ventas);
      await insertar((data) => tx.detalleVenta.createMany({ data }), filas.detallesVenta);
      await insertar((data) => tx.pago.createMany({ data }), filas.pagos);
      await insertar((data) => tx.movimientoCaja.createMany({ data }), filas.movimientosCaja);
      await insertar((data) => tx.movimientoInventario.createMany({ data }), filas.kardex);
      await insertar((data) => tx.historialPedido.createMany({ data }), filas.historialPedido);
      await insertar((data) => tx.entrega.createMany({ data }), filas.entregas);
      await insertar((data) => tx.existencia.createMany({ data }), nuevasExistencias);
      for (const b of bloques(cambios)) {
        await tx.$executeRaw`
          UPDATE existencia e SET cantidad = v.cantidad, updated_at = now()
          FROM (VALUES ${Prisma.join(b.map(([id, c]) => Prisma.sql`(${id}::uuid, ${c}::int)`))})
            AS v(id, cantidad)
          WHERE e.id = v.id`;
      }
      // Los números se asignaron en la simulación: las secuencias siguen desde el mayor.
      for (const tabla of ['venta', 'pedido', 'traslado']) {
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('${tabla}', 'numero'), GREATEST((SELECT MAX(numero) FROM ${tabla}), 1))`,
        );
      }
    },
    { maxWait: 30_000, timeout: 600_000 },
  );

  const anuladas = filas.ventas.filter((v) => v.estado === EstadoVenta.ANULADA).length;
  const conDiferencia = filas.turnos.filter((t) => Number(t.diferencia) !== 0).length;
  const atrasados = filas.pedidos.filter(
    (p) =>
      p.fechaEntrega && new Date(p.fechaEntrega).getTime() > new Date(p.fechaCompromiso).getTime(),
  ).length;
  console.log(
    `Historia (${DIAS} días, ${((Date.now() - inicio) / 1000).toFixed(1)} s): ` +
      `${filas.compras.length} compras, ${filas.traslados.length} traslados, ` +
      `${filas.turnos.length} turnos (${conDiferencia} con diferencia), ` +
      `${filas.ventas.length} ventas (${anuladas} anuladas), ` +
      `${filas.pedidos.length} pedidos (${atrasados} entregados tarde), ` +
      `${filas.kardex.length} movimientos de inventario`,
  );
}
