import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { EstadoPedido, EstadoPlanilla, EstadoTurnoCaja } from '../generated/prisma/enums';
import { ActivosService } from '../activos/activos.service';
import { resolverUbicacion } from '../common/alcance';
import { pagina } from '../common/paginacion';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { sumarDias } from '../inventario/fefo';
import { InventarioService } from '../inventario/inventario.service';
import type { Tx } from '../inventario/motor-inventario.service';
import { minutosDeAtraso } from '../pedidos/reglas-pedido';
import { PrismaService } from '../prisma/prisma.service';
import { periodosActuales, rangoDeFechas, ultimosDias } from './fechas';
import { FiltroDashboardDto, FiltroMovimientosDto, RangoFechasDto } from './reportes.dto';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
const cero = () => new Decimal(0);
const dec = (v: Decimal | string | number | null | undefined) => new Decimal(v ?? 0);

/** Filtro opcional por ubicación en SQL crudo: `NULL` significa todas. */
const porUbicacion = (columna: Prisma.Sql, ubicacionId: string | null) =>
  Prisma.sql`(${ubicacionId}::uuid IS NULL OR ${columna} = ${ubicacionId}::uuid)`;

/** Día de Guatemala de una marca de tiempo guardada en UTC. */
const diaGt = (columna: Prisma.Sql) =>
  Prisma.sql`((${columna}) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guatemala')::date`;

const METODOS = ['EFECTIVO', 'TARJETA', 'CONTRA_ENTREGA'] as const;
type Metodo = (typeof METODOS)[number];

/**
 * Dashboards y reportes de auditoría (RF-32 a RF-34, RF-37). Las sumas se hacen en SQL
 * (sección 10): nunca se traen todas las filas a memoria. GERENTE solo ve su ubicación.
 */
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly activos: ActivosService,
  ) {}

  // ─── Dashboard (RF-32, RF-37) ─────────────────────────────────────────────────

  async dashboard(filtro: FiltroDashboardDto, usuario: UsuarioAutenticado, db: Tx = this.prisma) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId) ?? null;
    const p = periodosActuales();

    const [ventas] = await db.$queryRaw<
      {
        hoy: Decimal;
        n_hoy: number;
        mes: Decimal;
        n_mes: number;
        anio: Decimal;
        n_anio: number;
      }[]
    >`
      SELECT COALESCE(SUM(total) FILTER (WHERE created_at >= ${p.inicioHoy}), 0) AS hoy,
             COUNT(*) FILTER (WHERE created_at >= ${p.inicioHoy})::int AS n_hoy,
             COALESCE(SUM(total) FILTER (WHERE created_at >= ${p.inicioMes}), 0) AS mes,
             COUNT(*) FILTER (WHERE created_at >= ${p.inicioMes})::int AS n_mes,
             COALESCE(SUM(total), 0) AS anio,
             COUNT(*)::int AS n_anio
      FROM venta
      WHERE estado = 'COMPLETADA' AND created_at >= ${p.inicioAnio}
        AND ${porUbicacion(Prisma.sql`ubicacion_id`, ubicacionId)}`;

    // Ventas por día de los últimos 30 días (se completan con cero los días sin ventas).
    const dias = ultimosDias(p.hoy, 30);
    const porDia = await db.$queryRaw<{ dia: Date; total: Decimal; ventas: number }[]>`
      SELECT ${diaGt(Prisma.sql`created_at`)} AS dia, SUM(total) AS total, COUNT(*)::int AS ventas
      FROM venta
      WHERE estado = 'COMPLETADA' AND created_at >= ${sumarDias(p.inicioHoy, -29)}
        AND ${porUbicacion(Prisma.sql`ubicacion_id`, ubicacionId)}
      GROUP BY 1`;
    const ventasPorDia = dias.map((dia) => {
      const f = porDia.find((x) => x.dia.toISOString().slice(0, 10) === dia);
      return { dia, total: dec(f?.total), ventas: f?.ventas ?? 0 };
    });

    // Ventas e ingresos del mes por sucursal y método (flujo de efectivo del dashboard).
    const ventasSucursal = await db.$queryRaw<
      { ubicacion_id: string; total: Decimal; ventas: number }[]
    >`
      SELECT ubicacion_id, SUM(total) AS total, COUNT(*)::int AS ventas
      FROM venta
      WHERE estado = 'COMPLETADA' AND created_at >= ${p.inicioMes}
        AND ${porUbicacion(Prisma.sql`ubicacion_id`, ubicacionId)}
      GROUP BY ubicacion_id`;
    const ingresos = await this.ingresosPorMetodo(db, p.inicioMes, null, ubicacionId);
    const ubicaciones = await db.ubicacion.findMany({
      where: ubicacionId ? { id: ubicacionId } : {},
      select: { id: true, codigo: true, nombre: true, tipo: true },
      orderBy: { nombre: 'asc' },
    });
    const flujoPorSucursal = ubicaciones
      .map((u) => {
        const porMetodo = Object.fromEntries(
          METODOS.map((m) => [m, ingresos.get(u.id)?.get(m) ?? cero()]),
        ) as Record<Metodo, Decimal>;
        const v = ventasSucursal.find((x) => x.ubicacion_id === u.id);
        return {
          ubicacion: u,
          ventas: v?.ventas ?? 0,
          totalVentas: dec(v?.total),
          porMetodo,
          totalIngresos: METODOS.reduce((s, m) => s.add(porMetodo[m]), cero()),
        };
      })
      .filter((f) => f.ventas > 0 || !f.totalIngresos.isZero() || ubicacionId);
    const flujoPorMetodo = Object.fromEntries(
      METODOS.map((m) => [m, flujoPorSucursal.reduce((s, f) => s.add(f.porMetodo[m]), cero())]),
    ) as Record<Metodo, Decimal>;

    // Pedidos atrasados (RN-18), calculados al consultar.
    const ahora = new Date();
    const whereAtrasados: Prisma.PedidoWhereInput = {
      estado: { notIn: [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO] },
      fechaCompromiso: { lt: ahora },
      ...(ubicacionId && { ubicacionDespachoId: ubicacionId }),
    };
    // Consultas en secuencia: con una transacción hay una sola conexión.
    const totalAtrasados = await db.pedido.count({ where: whereAtrasados });
    const atrasados = await db.pedido.findMany({
      where: whereAtrasados,
      select: {
        id: true,
        numero: true,
        estado: true,
        fechaCompromiso: true,
        cliente: { select: { nombre: true } },
        ubicacionDespacho: { select: { nombre: true } },
      },
      orderBy: { fechaCompromiso: 'asc' },
      take: 5,
    });

    // Alertas de inventario (RF-09) y valor del inventario a costo.
    const alertas = await this.inventario.alertas(ubicacionId ?? undefined, usuario);
    const [inventario] = await db.$queryRaw<
      { total: Decimal; vigente: Decimal; unidades: number }[]
    >`
      SELECT COALESCE(SUM(e.cantidad * l.costo_unitario), 0) AS total,
             COALESCE(SUM(e.cantidad * l.costo_unitario) FILTER (WHERE l.fecha_vencimiento >= ${p.hoy}::date), 0) AS vigente,
             COALESCE(SUM(e.cantidad), 0)::int AS unidades
      FROM existencia e JOIN lote l ON l.id = e.lote_id
      WHERE e.cantidad > 0 AND ${porUbicacion(Prisma.sql`e.ubicacion_id`, ubicacionId)}`;

    // Valor de los activos a hoy y gasto en planilla.
    const activos = await this.activos.reporte(
      { ubicacionId: ubicacionId ?? undefined },
      usuario,
      db,
    );
    const planillaMes = await db.planilla.aggregate({
      where: {
        anio: p.anio,
        mes: p.mes,
        estado: EstadoPlanilla.CERRADA,
        ...(ubicacionId && { ubicacionId }),
      },
      _sum: { total: true },
      _count: true,
    });
    const ultimaCerrada = await db.planilla.findFirst({
      where: { estado: EstadoPlanilla.CERRADA, ...(ubicacionId && { ubicacionId }) },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      select: { anio: true, mes: true },
    });
    const ultimoMes = ultimaCerrada
      ? await db.planilla.aggregate({
          where: {
            anio: ultimaCerrada.anio,
            mes: ultimaCerrada.mes,
            estado: EstadoPlanilla.CERRADA,
            ...(ubicacionId && { ubicacionId }),
          },
          _sum: { total: true },
          _count: true,
        })
      : null;

    // Cajas con diferencia de arqueo en los últimos 7 días.
    const cajasConDiferencia = await db.turnoCaja.findMany({
      where: {
        estado: EstadoTurnoCaja.CERRADO,
        diferencia: { not: 0 },
        cierre: { gte: sumarDias(p.inicioHoy, -6) },
        ...(ubicacionId && { ubicacionId }),
      },
      select: {
        id: true,
        cierre: true,
        diferencia: true,
        cajero: { select: { nombre: true } },
        ubicacion: { select: { nombre: true } },
      },
      orderBy: { cierre: 'desc' },
      take: 5,
    });

    return {
      ubicacionId,
      fecha: p.hoy,
      ventas: {
        hoy: { total: ventas.hoy, cantidad: ventas.n_hoy },
        mes: { total: ventas.mes, cantidad: ventas.n_mes },
        anio: { total: ventas.anio, cantidad: ventas.n_anio },
      },
      ventasPorDia,
      flujoPorSucursal,
      flujoPorMetodo,
      pedidosAtrasados: {
        total: totalAtrasados,
        lista: atrasados.map((x) => ({ ...x, minutosAtraso: minutosDeAtraso(x, ahora) })),
      },
      alertas: {
        vencidos: alertas.vencidos.length,
        porVencer: alertas.porVencer.length,
        bajoMinimo: alertas.bajoMinimo.length,
      },
      inventario: {
        valorCosto: inventario.total,
        valorVigente: inventario.vigente,
        unidades: inventario.unidades,
      },
      activos: { cantidad: activos.totales.cantidad, valorEnLibros: activos.totales.valorEnLibros },
      planilla: {
        anio: p.anio,
        mes: p.mes,
        totalMes: dec(planillaMes._sum.total),
        cerradasMes: planillaMes._count,
        ultimoCierre: ultimaCerrada &&
          ultimoMes && {
            ...ultimaCerrada,
            total: dec(ultimoMes._sum.total),
            planillas: ultimoMes._count,
          },
      },
      cajasConDiferencia,
    };
  }

  /**
   * Ingresos netos por sucursal y método: ventas y cobros de pedidos menos anulaciones. Los
   * montos ya tienen signo en la base, así que es una suma directa.
   */
  private async ingresosPorMetodo(
    db: Tx,
    inicio: Date,
    fin: Date | null,
    ubicacionId: string | null,
  ) {
    const filas = await db.$queryRaw<{ ubicacion_id: string; metodo: Metodo; total: Decimal }[]>`
      SELECT t.ubicacion_id, m.metodo_pago::text AS metodo, SUM(m.monto) AS total
      FROM movimiento_caja m JOIN turno_caja t ON t.id = m.turno_caja_id
      WHERE m.tipo IN ('VENTA', 'COBRO_CONTRA_ENTREGA', 'ANULACION')
        AND m.created_at >= ${inicio}
        AND (${fin}::timestamp IS NULL OR m.created_at < ${fin}::timestamp)
        AND ${porUbicacion(Prisma.sql`t.ubicacion_id`, ubicacionId)}
      GROUP BY t.ubicacion_id, m.metodo_pago`;
    const mapa = new Map<string, Map<Metodo, Decimal>>();
    for (const f of filas) {
      const porMetodo = mapa.get(f.ubicacion_id) ?? new Map<Metodo, Decimal>();
      porMetodo.set(f.metodo, dec(f.total));
      mapa.set(f.ubicacion_id, porMetodo);
    }
    return mapa;
  }

  // ─── Flujo de efectivo (RF-33) ────────────────────────────────────────────────

  /**
   * Consolidado y por sucursal en un rango de fechas: ingresos netos por método, depósitos,
   * gastos y retiros (por fecha del movimiento), diferencias de arqueo de los turnos cerrados en el
   * rango y el detalle de esos turnos.
   */
  async flujoEfectivo(dto: RangoFechasDto, usuario: UsuarioAutenticado, db: Tx = this.prisma) {
    const ubicacionId = resolverUbicacion(usuario, dto.ubicacionId) ?? null;
    const r = rangoDeFechas(dto.desde, dto.hasta);
    const movimientos = await db.$queryRaw<
      { ubicacion_id: string; tipo: string; metodo: Metodo; total: Decimal; n: number }[]
    >`
      SELECT t.ubicacion_id, m.tipo::text AS tipo, m.metodo_pago::text AS metodo,
             SUM(m.monto) AS total, COUNT(*)::int AS n
      FROM movimiento_caja m JOIN turno_caja t ON t.id = m.turno_caja_id
      WHERE m.created_at >= ${r.inicio} AND m.created_at < ${r.fin}
        AND ${porUbicacion(Prisma.sql`t.ubicacion_id`, ubicacionId)}
      GROUP BY t.ubicacion_id, m.tipo, m.metodo_pago`;
    const arqueos = await db.$queryRaw<
      { ubicacion_id: string; turnos: number; sobrantes: Decimal; faltantes: Decimal }[]
    >`
      SELECT ubicacion_id, COUNT(*)::int AS turnos,
             COALESCE(SUM(diferencia) FILTER (WHERE diferencia > 0), 0) AS sobrantes,
             COALESCE(-SUM(diferencia) FILTER (WHERE diferencia < 0), 0) AS faltantes
      FROM turno_caja
      WHERE estado = 'CERRADO' AND cierre >= ${r.inicio} AND cierre < ${r.fin}
        AND ${porUbicacion(Prisma.sql`ubicacion_id`, ubicacionId)}
      GROUP BY ubicacion_id`;
    const ubicaciones = await db.ubicacion.findMany({
      where: ubicacionId ? { id: ubicacionId } : {},
      select: { id: true, codigo: true, nombre: true, tipo: true },
      orderBy: { nombre: 'asc' },
    });

    const suma = (u: string, cond: (m: (typeof movimientos)[number]) => boolean) =>
      movimientos
        .filter((m) => m.ubicacion_id === u && cond(m))
        .reduce((s, m) => s.add(m.total), cero());
    const ingreso = (m: (typeof movimientos)[number]) =>
      ['VENTA', 'COBRO_CONTRA_ENTREGA', 'ANULACION'].includes(m.tipo);
    const filas = ubicaciones.map((u) => {
      const a = arqueos.find((x) => x.ubicacion_id === u.id);
      const ingresos = Object.fromEntries(
        METODOS.map((met) => [met, suma(u.id, (m) => ingreso(m) && m.metodo === met)]),
      ) as Record<Metodo, Decimal>;
      const depositos = suma(u.id, (m) => m.tipo === 'DEPOSITO');
      const gastos = suma(u.id, (m) => m.tipo === 'GASTO').abs();
      const retiros = suma(u.id, (m) => m.tipo === 'RETIRO').abs();
      return {
        ubicacion: u,
        ingresos,
        totalIngresos: METODOS.reduce((s, m) => s.add(ingresos[m]), cero()),
        depositos,
        gastos,
        retiros,
        // Lo que entró y salió de las gavetas: efectivo y contra entrega.
        netoEfectivo: ingresos.EFECTIVO.add(ingresos.CONTRA_ENTREGA)
          .add(depositos)
          .sub(gastos)
          .sub(retiros),
        movimientos: movimientos
          .filter((m) => m.ubicacion_id === u.id)
          .reduce((s, m) => s + m.n, 0),
        turnosCerrados: a?.turnos ?? 0,
        sobrantes: dec(a?.sobrantes),
        faltantes: dec(a?.faltantes),
      };
    });
    const conActividad = filas.filter((f) => f.movimientos > 0 || f.turnosCerrados > 0);

    const totalDe = <
      K extends
        | 'depositos'
        | 'gastos'
        | 'retiros'
        | 'netoEfectivo'
        | 'sobrantes'
        | 'faltantes'
        | 'totalIngresos',
    >(
      k: K,
    ) => conActividad.reduce((s, f) => s.add(f[k]), cero());
    const consolidado = {
      ingresos: Object.fromEntries(
        METODOS.map((m) => [m, conActividad.reduce((s, f) => s.add(f.ingresos[m]), cero())]),
      ) as Record<Metodo, Decimal>,
      totalIngresos: totalDe('totalIngresos'),
      depositos: totalDe('depositos'),
      gastos: totalDe('gastos'),
      retiros: totalDe('retiros'),
      netoEfectivo: totalDe('netoEfectivo'),
      turnosCerrados: conActividad.reduce((s, f) => s + f.turnosCerrados, 0),
      sobrantes: totalDe('sobrantes'),
      faltantes: totalDe('faltantes'),
    };

    const turnos = await db.turnoCaja.findMany({
      where: {
        OR: [{ apertura: { gte: r.inicio, lt: r.fin } }, { cierre: { gte: r.inicio, lt: r.fin } }],
        ...(ubicacionId && { ubicacionId }),
      },
      select: {
        id: true,
        estado: true,
        apertura: true,
        cierre: true,
        montoInicial: true,
        efectivoEsperado: true,
        efectivoContado: true,
        diferencia: true,
        cajero: { select: { nombre: true } },
        ubicacion: { select: { id: true, nombre: true } },
      },
      orderBy: { apertura: 'desc' },
      take: 500,
    });

    return { desde: r.desde, hasta: r.hasta, consolidado, porSucursal: conActividad, turnos };
  }

  // ─── Movimiento de medicamentos (RF-34) ───────────────────────────────────────

  /** Kardex global: todos los movimientos de inventario con filtros, y el resumen por tipo. */
  async movimientos(
    filtro: FiltroMovimientosDto,
    usuario: UsuarioAutenticado,
    db: Tx = this.prisma,
  ) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId) ?? null;
    const r = rangoDeFechas(filtro.desde, filtro.hasta);
    const condiciones = [
      Prisma.sql`m.created_at >= ${r.inicio}`,
      Prisma.sql`m.created_at < ${r.fin}`,
      porUbicacion(Prisma.sql`m.ubicacion_id`, ubicacionId),
    ];
    if (filtro.productoId) {
      condiciones.push(Prisma.sql`l.producto_id = ${filtro.productoId}::uuid`);
    }
    if (filtro.tipo) {
      condiciones.push(Prisma.sql`m.tipo = ${filtro.tipo}::tipo_movimiento_inventario`);
    }
    const donde = Prisma.join(condiciones, ' AND ');

    const resumen = await db.$queryRaw<
      { tipo: string; movimientos: number; unidades: number; valor: Decimal }[]
    >`
      SELECT m.tipo::text AS tipo, COUNT(*)::int AS movimientos, SUM(m.cantidad)::int AS unidades,
             SUM(m.cantidad * m.costo_unitario) AS valor
      FROM movimiento_inventario m JOIN lote l ON l.id = m.lote_id
      WHERE ${donde}
      GROUP BY m.tipo ORDER BY m.tipo`;
    const filas = await db.$queryRaw<
      {
        id: string;
        fecha: Date;
        tipo: string;
        cantidad: number;
        costo_unitario: Decimal;
        motivo: string | null;
        referencia_tipo: string | null;
        referencia_id: string | null;
        sku: string;
        producto: string;
        numero_lote: string;
        fecha_vencimiento: Date;
        ubicacion: string;
        usuario: string;
        total: number;
      }[]
    >`
      SELECT m.id, m.created_at AS fecha, m.tipo::text AS tipo, m.cantidad, m.costo_unitario,
             m.motivo, m.referencia_tipo, m.referencia_id, p.sku, p.nombre AS producto,
             l.numero_lote, l.fecha_vencimiento, u.nombre AS ubicacion, us.nombre AS usuario,
             COUNT(*) OVER ()::int AS total
      FROM movimiento_inventario m
      JOIN lote l ON l.id = m.lote_id
      JOIN producto p ON p.id = l.producto_id
      JOIN ubicacion u ON u.id = m.ubicacion_id
      JOIN usuario us ON us.id = m.usuario_id
      WHERE ${donde}
      ORDER BY m.created_at DESC, m.id
      LIMIT ${filtro.limit} OFFSET ${(filtro.page - 1) * filtro.limit}`;
    const data = filas.map(({ total: _total, costo_unitario, ...f }) => ({
      ...f,
      costoUnitario: costo_unitario,
      valor: dec(costo_unitario).mul(f.cantidad),
    }));
    return {
      ...pagina(data, filas[0]?.total ?? 0, filtro),
      desde: r.desde,
      hasta: r.hasta,
      resumen: resumen.map((x) => ({ ...x, valor: dec(x.valor) })),
    };
  }

  /**
   * Traslados entre ubicaciones por ruta (origen → destino) en un rango de fechas de solicitud:
   * cantidad por estado, unidades y valor a costo de lo enviado, y faltantes de recepción.
   */
  async traslados(dto: RangoFechasDto, usuario: UsuarioAutenticado, db: Tx = this.prisma) {
    const ubicacionId = resolverUbicacion(usuario, dto.ubicacionId) ?? null;
    const r = rangoDeFechas(dto.desde, dto.hasta);
    const rutas = await db.$queryRaw<
      {
        origen_id: string;
        origen: string;
        destino_id: string;
        destino: string;
        traslados: number;
        recibidos: number;
        en_transito: number;
        pendientes: number;
        cancelados: number;
        unidades_enviadas: number;
        unidades_recibidas: number;
        valor_enviado: Decimal;
      }[]
    >`
      WITH envios AS (
        SELECT d.traslado_id,
               COALESCE(SUM(d.cantidad_enviada), 0) AS enviadas,
               COALESCE(SUM(d.cantidad_recibida), 0) AS recibidas,
               COALESCE(SUM(d.cantidad_enviada * l.costo_unitario), 0) AS valor
        FROM detalle_traslado d LEFT JOIN lote l ON l.id = d.lote_id
        GROUP BY d.traslado_id
      )
      SELECT t.origen_id, o.nombre AS origen, t.destino_id, de.nombre AS destino,
             COUNT(*)::int AS traslados,
             COUNT(*) FILTER (WHERE t.estado = 'RECIBIDO')::int AS recibidos,
             COUNT(*) FILTER (WHERE t.estado = 'EN_TRANSITO')::int AS en_transito,
             COUNT(*) FILTER (WHERE t.estado IN ('SOLICITADO', 'APROBADO'))::int AS pendientes,
             COUNT(*) FILTER (WHERE t.estado = 'CANCELADO')::int AS cancelados,
             COALESCE(SUM(e.enviadas), 0)::int AS unidades_enviadas,
             COALESCE(SUM(e.recibidas) FILTER (WHERE t.estado = 'RECIBIDO'), 0)::int AS unidades_recibidas,
             COALESCE(SUM(e.valor), 0) AS valor_enviado
      FROM traslado t
      JOIN ubicacion o ON o.id = t.origen_id
      JOIN ubicacion de ON de.id = t.destino_id
      LEFT JOIN envios e ON e.traslado_id = t.id
      WHERE t.fecha_solicitud >= ${r.inicio} AND t.fecha_solicitud < ${r.fin}
        AND (${ubicacionId}::uuid IS NULL OR t.origen_id = ${ubicacionId}::uuid OR t.destino_id = ${ubicacionId}::uuid)
      GROUP BY t.origen_id, o.nombre, t.destino_id, de.nombre
      ORDER BY o.nombre, de.nombre`;
    const filas = rutas.map((x) => ({
      origen: { id: x.origen_id, nombre: x.origen },
      destino: { id: x.destino_id, nombre: x.destino },
      traslados: x.traslados,
      recibidos: x.recibidos,
      enTransito: x.en_transito,
      pendientes: x.pendientes,
      cancelados: x.cancelados,
      unidadesEnviadas: x.unidades_enviadas,
      unidadesRecibidas: x.unidades_recibidas,
      valorEnviado: dec(x.valor_enviado),
    }));
    // Faltantes: diferencia entre lo enviado y lo recibido solo en los traslados ya recibidos.
    const faltantes = await db.$queryRaw<
      { origen_id: string; destino_id: string; faltante: number }[]
    >`
      SELECT t.origen_id, t.destino_id,
             COALESCE(SUM(d.cantidad_enviada - d.cantidad_recibida), 0)::int AS faltante
      FROM traslado t JOIN detalle_traslado d ON d.traslado_id = t.id
      WHERE t.estado = 'RECIBIDO' AND t.fecha_solicitud >= ${r.inicio} AND t.fecha_solicitud < ${r.fin}
        AND (${ubicacionId}::uuid IS NULL OR t.origen_id = ${ubicacionId}::uuid OR t.destino_id = ${ubicacionId}::uuid)
      GROUP BY t.origen_id, t.destino_id`;
    const rutasFinal = filas.map((f) => ({
      ...f,
      faltanteRecepcion:
        faltantes.find((x) => x.origen_id === f.origen.id && x.destino_id === f.destino.id)
          ?.faltante ?? 0,
    }));
    const sumar = (
      k:
        | 'traslados'
        | 'recibidos'
        | 'enTransito'
        | 'pendientes'
        | 'cancelados'
        | 'unidadesEnviadas'
        | 'unidadesRecibidas'
        | 'faltanteRecepcion',
    ) => rutasFinal.reduce((s, f) => s + f[k], 0);
    return {
      desde: r.desde,
      hasta: r.hasta,
      rutas: rutasFinal,
      totales: {
        traslados: sumar('traslados'),
        recibidos: sumar('recibidos'),
        enTransito: sumar('enTransito'),
        pendientes: sumar('pendientes'),
        cancelados: sumar('cancelados'),
        unidadesEnviadas: sumar('unidadesEnviadas'),
        unidadesRecibidas: sumar('unidadesRecibidas'),
        faltanteRecepcion: sumar('faltanteRecepcion'),
        valorEnviado: rutasFinal.reduce((s, f) => s.add(f.valorEnviado), cero()),
      },
    };
  }
}
