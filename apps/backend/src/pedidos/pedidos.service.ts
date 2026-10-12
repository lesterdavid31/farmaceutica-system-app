import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  EstadoPedido,
  EstadoTraslado,
  EstadoTurnoCaja,
  EstadoVenta,
  MotivoTraslado,
  Puesto,
  Rol,
  TipoMovimientoCaja,
  TipoUbicacion,
} from '../generated/prisma/enums';
import { CajaService } from '../caja/caja.service';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { esRolGlobal, UsuarioAutenticado } from '../common/usuario-autenticado';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { hoyGuatemala, sumarDias } from '../inventario/fefo';
import type { Tx } from '../inventario/motor-inventario.service';
import { FuenteTiempo, masCercanos, Punto, TiempoRuta } from '../mapas/geo';
import { MapasService } from '../mapas/mapas.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrasladosService } from '../traslados/traslados.service';
import { VentasService } from '../ventas/ventas.service';
import {
  faltantesDe,
  ItemPedido,
  planearTraslados,
  Stock,
  tieneTodo,
  tiempoEstimado,
  TrasladoPlaneado,
} from './disponibilidad';
import {
  AsignarRepartidorDto,
  CancelarPedidoDto,
  ConsultaDisponibilidadDto,
  CrearPedidoDto,
  EntregarPedidoDto,
  FiltroPedidosDto,
  FiltroRepartidoresDto,
} from './pedidos.dto';
import {
  AccionPedido,
  accionesDisponibles,
  ESTADO_RESULTANTE,
  ESTADOS_FINALES,
  ESTADOS_PREVIOS,
  estaAtrasado,
  minutosDeAtraso,
  verificarAccion,
  verificarEstado,
} from './reglas-pedido';

/** Antes de llamar a la API de rutas se limita a las 10 sucursales más cercanas (sección 7.3). */
const MAXIMO_CANDIDATAS = 10;
const FORMAS_PAGO = ['CONTRA_ENTREGA', 'TARJETA'] as const;

const ubicacionCampos = {
  id: true,
  codigo: true,
  nombre: true,
  tipo: true,
  direccion: true,
  telefono: true,
  latitud: true,
  longitud: true,
} as const;
/** Ubicación con coordenadas como números (Prisma las entrega como Decimal). */
type UbicacionGeo = Omit<
  Prisma.UbicacionGetPayload<{ select: typeof ubicacionCampos }>,
  'latitud' | 'longitud'
> &
  Punto;

const productoCampos = {
  id: true,
  sku: true,
  nombre: true,
  presentacion: true,
  precioVenta: true,
  requiereReceta: true,
  activo: true,
} as const;
type ProductoPedido = Prisma.ProductoGetPayload<{ select: typeof productoCampos }>;

interface Contexto {
  productos: ProductoPedido[];
  ubicaciones: UbicacionGeo[];
  stock: Stock;
  preparacionMin: number;
  abiertas: Set<string>;
}

/** Plan de despacho de una sucursal: ruta al cliente y, si le falta producto, los traslados. */
export interface PlanDespacho {
  ubicacion: UbicacionGeo;
  ruta: TiempoRuta;
  traslados: TrasladoPlaneado[];
  sinCubrir: ItemPedido[];
  tiempoEstimadoMin: number;
}

const usuarioResumen = { select: { id: true, nombre: true } } as const;
const repartidorResumen = { select: { id: true, nombres: true, apellidos: true } } as const;

/**
 * Call center (RF-21 a RF-25, RN-15 a RN-21): disponibilidad con tiempos de ruta, pedidos con
 * traslado automático cuando la sucursal no tiene todo, y el ciclo de vida hasta la entrega.
 */
@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapas: MapasService,
    private readonly configuracion: ConfiguracionService,
    private readonly caja: CajaService,
    private readonly ventas: VentasService,
    private readonly traslados: TrasladosService,
  ) {}

  // ─── Disponibilidad (RN-15 a RN-17) ──────────────────────────────────────────

  /**
   * Sucursales activas que tienen todo el pedido con lotes vigentes, ordenadas por tiempo
   * estimado (ruta + preparación). Si ninguna lo tiene todo, propone la sucursal más cercana con
   * los traslados que le faltan y suma su tiempo.
   */
  async disponibilidad(dto: ConsultaDisponibilidadDto, db: Tx = this.prisma) {
    const destino = await this.destinoDe(db, dto);
    const ctx = await this.contexto(db, dto.items);
    const sucursales = ctx.ubicaciones.filter((u) => u.tipo !== TipoUbicacion.BODEGA_CENTRAL);

    const completas = masCercanos(
      sucursales.filter((s) => tieneTodo(ctx.stock, s.id, dto.items)),
      destino,
      MAXIMO_CANDIDATAS,
    );
    const tiempos = await this.mapas.calcularTiempos(completas, destino);
    const opciones = completas
      .map((s) => this.opcion(ctx, s, tiempos.get(s.id)!, []))
      .sort((a, b) => a.tiempoEstimadoMin - b.tiempoEstimadoMin);

    let sugerencia: ReturnType<PedidosService['sugerenciaDe']> | null = null;
    if (opciones.length === 0) {
      // RN-17: la sucursal más cercana por tiempo de ruta, completada con traslados.
      const cercanas = masCercanos(sucursales, destino, MAXIMO_CANDIDATAS);
      const rutas = await this.mapas.calcularTiempos(cercanas, destino);
      const masCercana = [...cercanas].sort(
        (a, b) => rutas.get(a.id)!.duracionMin - rutas.get(b.id)!.duracionMin,
      )[0];
      if (masCercana) {
        const plan = await this.planConTraslados(
          ctx,
          masCercana,
          rutas.get(masCercana.id)!,
          dto.items,
        );
        sugerencia = this.sugerenciaDe(ctx, plan);
      }
    }

    const fuentes = new Set<FuenteTiempo>([
      ...opciones.map((o) => o.fuente),
      ...(sugerencia ? [sugerencia.fuente, ...sugerencia.traslados.map((t) => t.fuente)] : []),
    ]);
    return {
      destino,
      preparacionMin: ctx.preparacionMin,
      items: this.lineas(ctx, dto.items),
      total: this.total(ctx, dto.items),
      opciones,
      mejorId: opciones[0]?.ubicacion.id ?? null,
      sugerencia,
      fuente: fuentes.size === 1 ? [...fuentes][0] : fuentes.size === 0 ? 'estimado' : 'mixta',
    };
  }

  /** Plan para una sucursal concreta: el que se usa al crear el pedido con la sucursal elegida. */
  async planPara(db: Tx, ubicacionId: string, items: ItemPedido[], destino: Punto) {
    const ctx = await this.contexto(db, items);
    const ubicacion = ctx.ubicaciones.find((u) => u.id === ubicacionId);
    if (!ubicacion || ubicacion.tipo === TipoUbicacion.BODEGA_CENTRAL) {
      throw new ReglaNegocioException(
        'La sucursal de despacho no existe, está desactivada o es la bodega central',
      );
    }
    const ruta = (await this.mapas.calcularTiempos([ubicacion], destino)).get(ubicacion.id)!;
    return { ctx, plan: await this.planConTraslados(ctx, ubicacion, ruta, items) };
  }

  private async planConTraslados(
    ctx: Contexto,
    ubicacion: UbicacionGeo,
    ruta: TiempoRuta,
    items: ItemPedido[],
  ): Promise<PlanDespacho> {
    const faltantes = faltantesDe(ctx.stock, ubicacion.id, items);
    if (faltantes.length === 0) {
      return {
        ubicacion,
        ruta,
        traslados: [],
        sinCubrir: [],
        tiempoEstimadoMin: tiempoEstimado(ruta.duracionMin, ctx.preparacionMin),
      };
    }
    // Orígenes posibles: la bodega u otras sucursales con existencia vigente de lo que falta.
    const origenes = masCercanos(
      ctx.ubicaciones.filter(
        (u) =>
          u.id !== ubicacion.id &&
          faltantes.some((f) => (ctx.stock.get(u.id)?.get(f.productoId) ?? 0) > 0),
      ),
      ubicacion,
      MAXIMO_CANDIDATAS,
    );
    const tiempos = await this.mapas.calcularTiempos(origenes, ubicacion);
    const plan = planearTraslados(faltantes, ctx.stock, tiempos);
    return {
      ubicacion,
      ruta,
      traslados: plan.traslados,
      sinCubrir: plan.sinCubrir,
      tiempoEstimadoMin: tiempoEstimado(ruta.duracionMin, ctx.preparacionMin, plan.duracionMin),
    };
  }

  private opcion(
    ctx: Contexto,
    ubicacion: UbicacionGeo,
    ruta: TiempoRuta,
    traslados: TrasladoPlaneado[],
  ) {
    const trasladoMin = traslados.length
      ? Math.max(...traslados.map((t) => t.tiempo.duracionMin))
      : undefined;
    return {
      ubicacion: this.ubicacionPublica(ubicacion),
      distanciaKm: ruta.distanciaKm,
      rutaMin: ruta.duracionMin,
      fuente: ruta.fuente,
      tiempoEstimadoMin: tiempoEstimado(ruta.duracionMin, ctx.preparacionMin, trasladoMin),
      formasPago: FORMAS_PAGO,
      // El cobro se registra en una caja abierta al entregar; se informa para el operador.
      cajaAbierta: ctx.abiertas.has(ubicacion.id),
    };
  }

  private sugerenciaDe(ctx: Contexto, plan: PlanDespacho) {
    const nombre = (productoId: string) => ctx.productos.find((p) => p.id === productoId)!.nombre;
    return {
      ...this.opcion(ctx, plan.ubicacion, plan.ruta, plan.traslados),
      traslados: plan.traslados.map((t) => {
        const origen = ctx.ubicaciones.find((u) => u.id === t.origenId)!;
        return {
          origen: { id: origen.id, nombre: origen.nombre, tipo: origen.tipo },
          distanciaKm: t.tiempo.distanciaKm,
          tiempoMin: t.tiempo.duracionMin,
          fuente: t.tiempo.fuente,
          items: t.items.map((i) => ({ ...i, nombre: nombre(i.productoId) })),
        };
      }),
      sinCubrir: plan.sinCubrir.map((i) => ({ ...i, nombre: nombre(i.productoId) })),
    };
  }

  /** Productos, ubicaciones activas, existencia vigente por ubicación y parámetros. */
  private async contexto(db: Tx, items: ItemPedido[]): Promise<Contexto> {
    const ids = items.map((i) => i.productoId);
    const productos = await db.producto.findMany({
      where: { id: { in: ids } },
      select: productoCampos,
    });
    const errores: string[] = [];
    const vistos = new Set<string>();
    items.forEach((i, n) => {
      const p = productos.find((x) => x.id === i.productoId);
      if (!p) {
        errores.push(`Fila ${n + 1}: el producto no existe`);
      } else if (!p.activo) {
        errores.push(`${p.nombre} está desactivado`);
      }
      if (vistos.has(i.productoId)) {
        errores.push(`Fila ${n + 1}: el producto está repetido; sume las cantidades`);
      }
      vistos.add(i.productoId);
    });
    if (errores.length > 0) {
      throw new ReglaNegocioException('Revise los productos del pedido', errores);
    }

    const ubicaciones = (
      await db.ubicacion.findMany({ where: { activa: true }, select: ubicacionCampos })
    ).map((u) => ({ ...u, latitud: Number(u.latitud), longitud: Number(u.longitud) }));
    const filas = await db.$queryRaw<
      { ubicacion_id: string; producto_id: string; cantidad: number }[]
    >`
      SELECT e.ubicacion_id, l.producto_id, SUM(e.cantidad)::int AS cantidad
      FROM existencia e
      JOIN lote l ON l.id = e.lote_id
      JOIN ubicacion u ON u.id = e.ubicacion_id
      WHERE u.activa AND e.cantidad > 0
        AND l.producto_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND l.fecha_vencimiento >= ${hoyGuatemala()}::date
      GROUP BY e.ubicacion_id, l.producto_id`;
    const stock: Stock = new Map();
    for (const f of filas) {
      const porProducto = stock.get(f.ubicacion_id) ?? new Map<string, number>();
      porProducto.set(f.producto_id, f.cantidad);
      stock.set(f.ubicacion_id, porProducto);
    }
    const abiertas = await db.turnoCaja.findMany({
      where: { estado: EstadoTurnoCaja.ABIERTO },
      select: { ubicacionId: true },
      distinct: ['ubicacionId'],
    });
    return {
      productos,
      ubicaciones,
      stock,
      preparacionMin: await this.configuracion.obtener('TIEMPO_PREPARACION_MIN'),
      abiertas: new Set(abiertas.map((a) => a.ubicacionId)),
    };
  }

  private async destinoDe(db: Tx, dto: ConsultaDisponibilidadDto): Promise<Punto> {
    if (dto.direccionId) {
      const d = await db.direccionCliente.findUnique({ where: { id: dto.direccionId } });
      if (!d?.activa) {
        throw new ReglaNegocioException('La dirección no existe o está desactivada');
      }
      return { latitud: Number(d.latitud), longitud: Number(d.longitud) };
    }
    if (dto.latitud === undefined || dto.longitud === undefined) {
      throw new ReglaNegocioException('Indique la dirección del cliente o sus coordenadas');
    }
    return { latitud: dto.latitud, longitud: dto.longitud };
  }

  private lineas(ctx: Contexto, items: ItemPedido[]) {
    return items.map((i) => {
      const p = ctx.productos.find((x) => x.id === i.productoId)!;
      return {
        producto: {
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
          presentacion: p.presentacion,
          precioVenta: p.precioVenta,
          requiereReceta: p.requiereReceta,
        },
        cantidad: i.cantidad,
        subtotal: p.precioVenta.mul(i.cantidad),
      };
    });
  }

  private total(ctx: Contexto, items: ItemPedido[]) {
    return items.reduce(
      (s, i) =>
        s.add(ctx.productos.find((p) => p.id === i.productoId)!.precioVenta.mul(i.cantidad)),
      new Prisma.Decimal(0),
    );
  }

  private ubicacionPublica(u: UbicacionGeo) {
    return {
      id: u.id,
      codigo: u.codigo,
      nombre: u.nombre,
      tipo: u.tipo,
      direccion: u.direccion,
      telefono: u.telefono,
      latitud: u.latitud,
      longitud: u.longitud,
    };
  }

  // ─── Crear (RF-22) ────────────────────────────────────────────────────────────

  async crear(dto: CrearPedidoDto, usuario: UsuarioAutenticado) {
    const id = await this.prisma.$transaction(
      (tx) => this.crearEn(tx, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  /**
   * Crea el pedido con la sucursal elegida. El plan se recalcula aquí (no se confía en el
   * cliente): si a la sucursal le falta producto, se solicitan los traslados con motivo
   * PEDIDO_CLIENTE en la misma transacción. El inventario se descuenta al preparar (RN-21).
   */
  async crearEn(tx: Tx, dto: CrearPedidoDto, usuario: UsuarioAutenticado): Promise<string> {
    const cliente = await tx.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente?.activo) {
      throw new ReglaNegocioException('El cliente no existe o está desactivado');
    }
    const direccion = await tx.direccionCliente.findFirst({
      where: { id: dto.direccionId, clienteId: cliente.id, activa: true },
    });
    if (!direccion) {
      throw new ReglaNegocioException('La dirección no pertenece al cliente o está desactivada');
    }
    const destino = { latitud: Number(direccion.latitud), longitud: Number(direccion.longitud) };
    const { ctx, plan } = await this.planPara(tx, dto.ubicacionDespachoId, dto.items, destino);
    if (plan.sinCubrir.length > 0) {
      throw new ReglaNegocioException(
        'Ninguna ubicación de la cadena tiene existencia vigente suficiente para completar el pedido',
        plan.sinCubrir.map(
          (i) =>
            `${ctx.productos.find((p) => p.id === i.productoId)!.nombre}: faltan ${i.cantidad}`,
        ),
      );
    }

    // RN-18: la fecha de compromiso no puede ser antes del tiempo estimado.
    const ahora = new Date();
    const minima = new Date(ahora.getTime() + plan.tiempoEstimadoMin * 60_000);
    let fechaCompromiso: Date;
    if (dto.fechaCompromiso) {
      fechaCompromiso = new Date(dto.fechaCompromiso);
      if (fechaCompromiso.getTime() < minima.getTime() - 60_000) {
        throw new ReglaNegocioException(
          `La fecha de compromiso debe ser al menos ${plan.tiempoEstimadoMin} minutos después de ahora (el tiempo estimado de entrega)`,
        );
      }
    } else {
      // Se redondea hacia arriba a los siguientes 5 minutos.
      const cinco = 5 * 60_000;
      fechaCompromiso = new Date(Math.ceil(minima.getTime() / cinco) * cinco);
    }

    const precio = (productoId: string) =>
      ctx.productos.find((p) => p.id === productoId)!.precioVenta;
    const pedido = await tx.pedido.create({
      data: {
        clienteId: cliente.id,
        direccionId: direccion.id,
        ubicacionDespachoId: plan.ubicacion.id,
        operadorId: usuario.id,
        metodoPago: dto.metodoPago,
        total: this.total(ctx, dto.items),
        tiempoEstimadoMin: plan.tiempoEstimadoMin,
        distanciaKm: plan.ruta.distanciaKm,
        fuenteEstimacion: plan.ruta.fuente,
        fechaCompromiso,
        observaciones: dto.observaciones || null,
        detalles: {
          create: dto.items.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            precioUnitario: precio(i.productoId),
            subtotal: precio(i.productoId).mul(i.cantidad),
          })),
        },
      },
    });

    const numeros: string[] = [];
    for (const t of plan.traslados) {
      const trasladoId = await this.traslados.crearEn(
        tx,
        {
          origenId: t.origenId,
          destinoId: plan.ubicacion.id,
          motivo: MotivoTraslado.PEDIDO_CLIENTE,
          pedidoId: pedido.id,
          observaciones: `Para el pedido #${pedido.numero}`,
          detalles: t.items,
        },
        usuario,
      );
      const { numero } = await tx.traslado.findUniqueOrThrow({ where: { id: trasladoId } });
      const origen = ctx.ubicaciones.find((u) => u.id === t.origenId)!.nombre;
      numeros.push(`#${numero} desde ${origen}`);
    }
    await tx.historialPedido.create({
      data: {
        pedidoId: pedido.id,
        estadoNuevo: EstadoPedido.PENDIENTE,
        nota: numeros.length
          ? `Pedido creado. Requiere ${numeros.length === 1 ? 'el traslado' : 'los traslados'} ${numeros.join(', ')}`
          : 'Pedido creado',
        usuarioId: usuario.id,
      },
    });
    return pedido.id;
  }

  // ─── Ciclo de vida (RN-19 a RN-21, RF-23, RF-24) ─────────────────────────────

  async ejecutar(
    accion: AccionPedido,
    id: string,
    usuario: UsuarioAutenticado,
    dto?: AsignarRepartidorDto | EntregarPedidoDto | CancelarPedidoDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      switch (accion) {
        case 'preparar':
          return this.prepararEn(tx, id, usuario);
        case 'asignar':
          return this.asignarEn(tx, id, dto as AsignarRepartidorDto, usuario);
        case 'salir':
          return this.salirEn(tx, id, usuario);
        case 'entregar':
          return this.entregarEn(tx, id, (dto ?? {}) as EntregarPedidoDto, usuario);
        case 'cancelar':
          return this.cancelarEn(tx, id, dto as CancelarPedidoDto, usuario);
      }
    }, OPCIONES_TRANSACCION);
    return this.obtener(id, usuario);
  }

  /** RN-21: al preparar se descuenta el inventario por FEFO y se genera la venta CALL_CENTER. */
  async prepararEn(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    const pedido = await this.cabecera(tx, id);
    verificarAccion('preparar', pedido, usuario);
    const pendientes = await tx.traslado.findMany({
      where: {
        pedidoId: id,
        estado: {
          in: [EstadoTraslado.SOLICITADO, EstadoTraslado.APROBADO, EstadoTraslado.EN_TRANSITO],
        },
      },
      orderBy: { numero: 'asc' },
    });
    if (pendientes.length > 0) {
      throw new ReglaNegocioException(
        `El pedido #${pedido.numero} espera ${pendientes.map((t) => `el traslado #${t.numero}`).join(' y ')}: recíbalo antes de prepararlo`,
      );
    }
    await this.transicionar(tx, pedido, 'preparar', usuario, {});
    const detalles = await tx.detallePedido.findMany({
      where: { pedidoId: id },
      include: { producto: { select: { nombre: true } } },
    });
    const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: pedido.clienteId } });
    const venta = await this.ventas.crearVentaPedidoEn(
      tx,
      { ...pedido, nit: cliente.nit, detalles },
      usuario,
    );
    await this.anotar(tx, id, `Venta #${venta.numero} generada; inventario descontado`, usuario);
  }

  async asignarEn(tx: Tx, id: string, dto: AsignarRepartidorDto, usuario: UsuarioAutenticado) {
    const pedido = await this.cabecera(tx, id);
    verificarAccion('asignar', pedido, usuario);
    const repartidor = await tx.empleado.findUnique({ where: { id: dto.repartidorId } });
    if (
      !repartidor?.activo ||
      repartidor.puesto !== Puesto.REPARTIDOR ||
      repartidor.ubicacionId !== pedido.ubicacionDespachoId
    ) {
      throw new ReglaNegocioException(
        'El repartidor debe ser un empleado activo con puesto de repartidor en la sucursal de despacho',
      );
    }
    await tx.entrega.upsert({
      where: { pedidoId: id },
      create: { pedidoId: id, repartidorId: repartidor.id },
      update: { repartidorId: repartidor.id },
    });
    const nombre = `${repartidor.nombres} ${repartidor.apellidos}`;
    await this.transicionar(tx, pedido, 'asignar', usuario, {}, `Repartidor: ${nombre}`);
  }

  async salirEn(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    const pedido = await this.cabecera(tx, id);
    verificarAccion('salir', pedido, usuario);
    await this.transicionar(tx, pedido, 'salir', usuario, {});
    await tx.entrega.update({ where: { pedidoId: id }, data: { horaSalida: new Date() } });
  }

  /**
   * RF-24: confirma la entrega y registra el cobro en una caja abierta de la sucursal: la del
   * cajero que confirma; si confirma el gerente, el turno abierto más antiguo de la sucursal.
   * Contra entrega cuenta como efectivo en el arqueo; la tarjeta no.
   */
  async entregarEn(tx: Tx, id: string, dto: EntregarPedidoDto, usuario: UsuarioAutenticado) {
    const pedido = await this.cabecera(tx, id);
    verificarAccion('entregar', pedido, usuario);
    const turno = await tx.turnoCaja.findFirst({
      where: {
        ubicacionId: pedido.ubicacionDespachoId,
        estado: EstadoTurnoCaja.ABIERTO,
        ...(usuario.rol === Rol.CAJERO && { cajeroId: usuario.id }),
      },
      include: { cajero: { select: { nombre: true } } },
      orderBy: { apertura: 'asc' },
    });
    if (!turno) {
      throw new ReglaNegocioException(
        usuario.rol === Rol.CAJERO
          ? 'Abra su turno de caja para registrar el cobro del pedido'
          : 'No hay una caja abierta en la sucursal para registrar el cobro del pedido',
      );
    }
    await this.caja.bloquearTurno(tx, turno.id);
    const venta = await tx.venta.findUnique({ where: { pedidoId: id } });
    if (!venta || venta.estado !== EstadoVenta.COMPLETADA) {
      throw new ReglaNegocioException(`El pedido #${pedido.numero} no tiene una venta vigente`);
    }

    await this.transicionar(
      tx,
      pedido,
      'entregar',
      usuario,
      { fechaEntrega: new Date() },
      `Cobrado en la caja de ${turno.cajero.nombre}`,
    );
    await tx.pago.create({
      data: {
        ventaId: venta.id,
        metodo: pedido.metodoPago,
        monto: pedido.total,
        referencia: dto.referencia || null,
      },
    });
    await this.caja.registrarEn(tx, {
      turnoCajaId: turno.id,
      tipo: TipoMovimientoCaja.COBRO_CONTRA_ENTREGA,
      metodoPago: pedido.metodoPago,
      monto: pedido.total,
      referenciaId: venta.id,
      descripcion: `Pedido #${pedido.numero} (venta #${venta.numero})`,
      usuarioId: usuario.id,
    });
    await tx.entrega.update({
      where: { pedidoId: id },
      data: { horaEntrega: new Date(), notas: dto.notas || null },
    });
  }

  /**
   * Cancela hasta EN_CAMINO (decisión del equipo). Si ya se descontó inventario, la venta se
   * anula y cada lote regresa con ANULACION_VENTA. Los traslados del pedido que no han salido se
   * cancelan; los que están en tránsito llegan como reabastecimiento.
   */
  async cancelarEn(tx: Tx, id: string, dto: CancelarPedidoDto, usuario: UsuarioAutenticado) {
    const pedido = await this.cabecera(tx, id);
    verificarAccion('cancelar', pedido, usuario);
    await this.transicionar(
      tx,
      pedido,
      'cancelar',
      usuario,
      { motivoCancelacion: dto.motivo },
      dto.motivo,
    );
    const venta = await tx.venta.findUnique({ where: { pedidoId: id } });
    if (venta) {
      await this.ventas.anularVentaPedidoEn(
        tx,
        venta.id,
        `Pedido #${pedido.numero} cancelado: ${dto.motivo}`,
        usuario,
      );
      await this.anotar(tx, id, `Venta #${venta.numero} anulada; inventario devuelto`, usuario);
    }
    const { cancelados, enTransito } = await this.traslados.cancelarDePedidoEn(
      tx,
      id,
      `Pedido #${pedido.numero} cancelado`,
      usuario,
    );
    const notas = [
      ...cancelados.map((n) => `traslado #${n} cancelado`),
      ...enTransito.map((n) => `traslado #${n} sigue en tránsito como reabastecimiento`),
    ];
    if (notas.length > 0) {
      await this.anotar(tx, id, notas.join('; '), usuario);
    }
  }

  private async cabecera(tx: Tx, id: string) {
    const pedido = await tx.pedido.findUnique({ where: { id } });
    if (!pedido) {
      throw new NotFoundException('El pedido no existe');
    }
    return pedido;
  }

  /**
   * Cambia el estado solo si sigue en uno de los previos permitidos (dos personas no pueden
   * preparar el mismo pedido dos veces) y deja el cambio en el historial inmutable.
   */
  private async transicionar(
    tx: Tx,
    pedido: { id: string; numero: number; estado: EstadoPedido },
    accion: AccionPedido,
    usuario: UsuarioAutenticado,
    datos: Prisma.PedidoUncheckedUpdateManyInput,
    nota?: string,
  ) {
    const { count } = await tx.pedido.updateMany({
      where: { id: pedido.id, estado: { in: [...ESTADOS_PREVIOS[accion]] } },
      data: { ...datos, estado: ESTADO_RESULTANTE[accion] },
    });
    if (count === 0) {
      verificarEstado(accion, await tx.pedido.findUniqueOrThrow({ where: { id: pedido.id } }));
      throw new ReglaNegocioException('El pedido cambió mientras se procesaba. Intente de nuevo.');
    }
    await tx.historialPedido.create({
      data: {
        pedidoId: pedido.id,
        estadoAnterior: pedido.estado,
        estadoNuevo: ESTADO_RESULTANTE[accion],
        nota: nota ?? null,
        usuarioId: usuario.id,
      },
    });
  }

  /** Nota adicional en el historial sin cambio de estado. */
  private async anotar(tx: Tx, pedidoId: string, nota: string, usuario: UsuarioAutenticado) {
    const { estado } = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    await tx.historialPedido.create({
      data: { pedidoId, estadoAnterior: estado, estadoNuevo: estado, nota, usuarioId: usuario.id },
    });
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  /**
   * Seguimiento del operador (todos) y bandeja de la sucursal (GERENTE y CAJERO, la suya).
   * El atraso se calcula al consultar (sección 7.5): no hay tareas programadas.
   */
  async listar(filtro: FiltroPedidosDto, usuario: UsuarioAutenticado) {
    const ahora = new Date();
    const ubicacionId = esRolGlobal(usuario.rol) ? filtro.ubicacionId : usuario.ubicacionId!;
    const q = filtro.q?.trim().replace(/^#/, '');
    const digitos = q?.replace(/[\s-]/g, '');
    const where: Prisma.PedidoWhereInput = {
      AND: [
        ubicacionId ? { ubicacionDespachoId: ubicacionId } : {},
        filtro.estado ? { estado: filtro.estado } : {},
        filtro.clienteId ? { clienteId: filtro.clienteId } : {},
        filtro.activos || filtro.atrasados ? { estado: { notIn: [...ESTADOS_FINALES] } } : {},
        filtro.atrasados ? { fechaCompromiso: { lt: ahora } } : {},
        q
          ? digitos && /^\d+$/.test(digitos)
            ? {
                OR: [
                  ...(digitos.length <= 7 ? [{ numero: Number(digitos) }] : []),
                  { cliente: { telefono: { contains: digitos } } },
                ],
              }
            : { cliente: { nombre: { contains: q, mode: 'insensitive' } } }
          : {},
        filtro.desde || filtro.hasta
          ? {
              createdAt: {
                ...(filtro.desde && { gte: new Date(filtro.desde) }),
                ...(filtro.hasta && { lt: sumarDias(new Date(filtro.hasta), 1) }),
              },
            }
          : {},
      ],
    };
    const pendientes = filtro.activos || filtro.atrasados;
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.pedido.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true, telefono: true } },
          ubicacionDespacho: { select: { id: true, codigo: true, nombre: true, tipo: true } },
          entrega: { include: { repartidor: repartidorResumen } },
          _count: { select: { detalles: true } },
        },
        orderBy: pendientes ? { fechaCompromiso: 'asc' } : { createdAt: 'desc' },
        ...saltar(filtro),
      }),
      this.prisma.pedido.count({ where }),
    ]);
    const data = filas.map((p) => ({
      ...p,
      atrasado: estaAtrasado(p, ahora),
      minutosAtraso: minutosDeAtraso(p, ahora),
      acciones: accionesDisponibles(p, usuario),
    }));
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true, nit: true } },
        direccion: { include: { municipio: { select: { nombre: true } } } },
        ubicacionDespacho: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            tipo: true,
            direccion: true,
            telefono: true,
          },
        },
        operador: usuarioResumen,
        detalles: {
          include: {
            producto: { select: { id: true, sku: true, nombre: true, presentacion: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        historial: { include: { usuario: usuarioResumen }, orderBy: { createdAt: 'asc' } },
        entrega: { include: { repartidor: repartidorResumen } },
        venta: {
          select: {
            id: true,
            numero: true,
            estado: true,
            pagos: { select: { metodo: true, monto: true, referencia: true } },
          },
        },
        traslados: {
          select: {
            id: true,
            numero: true,
            estado: true,
            origen: { select: { id: true, nombre: true } },
          },
          orderBy: { numero: 'asc' },
        },
      },
    });
    if (!pedido) {
      throw new NotFoundException('El pedido no existe');
    }
    if (!esRolGlobal(usuario.rol) && usuario.ubicacionId !== pedido.ubicacionDespachoId) {
      throw new ForbiddenException('Solo puede ver los pedidos de su sucursal');
    }
    const ahora = new Date();
    const cajaAbierta =
      (await this.prisma.turnoCaja.count({
        where: { ubicacionId: pedido.ubicacionDespachoId, estado: EstadoTurnoCaja.ABIERTO },
      })) > 0;
    return {
      ...pedido,
      atrasado: estaAtrasado(pedido, ahora),
      minutosAtraso: minutosDeAtraso(pedido, ahora),
      acciones: accionesDisponibles(pedido, usuario),
      cajaAbierta,
    };
  }

  /** Repartidores activos de la sucursal (RN-20: empleados sin acceso al sistema). */
  async repartidores(filtro: FiltroRepartidoresDto, usuario: UsuarioAutenticado) {
    const ubicacionId = esRolGlobal(usuario.rol) ? filtro.ubicacionId : usuario.ubicacionId;
    if (!ubicacionId) {
      throw new ReglaNegocioException('Indique la sucursal');
    }
    return this.prisma.empleado.findMany({
      where: { ubicacionId, puesto: Puesto.REPARTIDOR, activo: true },
      select: { id: true, nombres: true, apellidos: true },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
  }
}
