import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  CanalVenta,
  EstadoTurnoCaja,
  EstadoVenta,
  MetodoPago,
  Rol,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
} from '../generated/prisma/enums';
import { resolverUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { esRolGlobal, UsuarioAutenticado } from '../common/usuario-autenticado';
import { CajaService } from '../caja/caja.service';
import { hoyGuatemala, sumarDias } from '../inventario/fefo';
import { MotorInventarioService, Tx } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarNit, validarPagos } from './reglas-venta';
import {
  AnularVentaDto,
  BusquedaProductosVentaDto,
  CrearVentaDto,
  FiltroVentasDto,
} from './ventas.dto';

const REFERENCIA = 'VENTA';
const Decimal = Prisma.Decimal;

const usuarioResumen = { select: { id: true, nombre: true } } as const;
const ubicacionResumen = { select: { id: true, codigo: true, nombre: true, tipo: true } } as const;

/** Ventas de mostrador y anulaciones (RF-15, RF-18, RN-11, RN-14). */
@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorInventarioService,
    private readonly caja: CajaService,
  ) {}

  async crear(dto: CrearVentaDto, usuario: UsuarioAutenticado) {
    const id = await this.prisma.$transaction(
      (tx) => this.crearEn(tx, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  async anular(id: string, dto: AnularVentaDto, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction(
      (tx) => this.anularEn(tx, id, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  /**
   * Venta de mostrador: exige turno abierto del cajero (RN-11), descuenta por FEFO sin lotes
   * vencidos, guarda una fila de detalle por lote y registra cada pago en la caja (RN-13).
   * Todo en una transacción: si algo falla, no queda nada a medias.
   */
  async crearEn(tx: Tx, dto: CrearVentaDto, usuario: UsuarioAutenticado): Promise<string> {
    const turno = await this.caja.turnoAbiertoDe(tx, usuario);
    const nit = normalizarNit(dto.nit);

    const productos = await tx.producto.findMany({
      where: { id: { in: dto.items.map((i) => i.productoId) } },
      select: { id: true, nombre: true, activo: true, precioVenta: true },
    });
    const errores: string[] = [];
    const vistos = new Set<string>();
    for (const item of dto.items) {
      const producto = productos.find((p) => p.id === item.productoId);
      if (!producto) {
        errores.push('Uno de los productos no existe');
        continue;
      }
      if (!producto.activo) {
        errores.push(`${producto.nombre} está desactivado`);
      }
      if (vistos.has(item.productoId)) {
        errores.push(`${producto.nombre} está repetido; sume las cantidades en una sola línea`);
      }
      vistos.add(item.productoId);
    }
    if (errores.length > 0) {
      throw new ReglaNegocioException('Revise los productos de la venta', errores);
    }
    const producto = (id: string) => productos.find((p) => p.id === id)!;

    // Se revisa toda la venta antes de descontar, para informar todos los faltantes juntos.
    const vigente = await this.motor.vigentePorProducto(
      tx,
      turno.ubicacionId,
      dto.items.map((i) => i.productoId),
    );
    const faltantes = dto.items
      .filter((i) => (vigente.get(i.productoId) ?? 0) < i.cantidad)
      .map((i) => {
        const hay = vigente.get(i.productoId) ?? 0;
        return `${producto(i.productoId).nombre}: pidió ${i.cantidad} y hay ${hay} ${hay === 1 ? 'unidad vigente' : 'unidades vigentes'}`;
      });
    if (faltantes.length > 0) {
      throw new ReglaNegocioException('No hay existencia suficiente para la venta', faltantes);
    }

    const total = dto.items.reduce(
      (s, i) => s.add(producto(i.productoId).precioVenta.mul(i.cantidad)),
      new Decimal(0),
    );
    validarPagos(total, dto.pagos);

    const venta = await tx.venta.create({
      data: {
        ubicacionId: turno.ubicacionId,
        turnoCajaId: turno.id,
        nit,
        canal: CanalVenta.MOSTRADOR,
        total,
        usuarioId: usuario.id,
      },
    });
    for (const item of dto.items) {
      const precio = producto(item.productoId).precioVenta;
      const asignados = await this.motor.descontarFefo(tx, {
        ubicacionId: turno.ubicacionId,
        productoId: item.productoId,
        cantidad: item.cantidad,
        tipo: TipoMovimientoInventario.VENTA,
        referenciaTipo: REFERENCIA,
        referenciaId: venta.id,
        motivo: `Venta #${venta.numero}`,
        usuarioId: usuario.id,
      });
      for (const a of asignados) {
        await tx.detalleVenta.create({
          data: {
            ventaId: venta.id,
            productoId: item.productoId,
            loteId: a.loteId,
            cantidad: a.cantidad,
            precioUnitario: precio,
            subtotal: precio.mul(a.cantidad),
          },
        });
      }
    }
    for (const pago of dto.pagos) {
      await tx.pago.create({
        data: {
          ventaId: venta.id,
          metodo: pago.metodo,
          monto: pago.monto,
          referencia: pago.referencia || null,
        },
      });
      await this.caja.registrarEn(tx, {
        turnoCajaId: turno.id,
        tipo: TipoMovimientoCaja.VENTA,
        metodoPago: pago.metodo,
        monto: pago.monto,
        referenciaId: venta.id,
        descripcion: `Venta #${venta.numero}`,
        usuarioId: usuario.id,
      });
    }
    return venta.id;
  }

  /**
   * Anulación (RN-14): solo el gerente de la ubicación, con motivo, y mientras el turno de la
   * venta siga abierto. Revierte con movimientos nuevos: ANULACION_VENTA devuelve cada lote a la
   * existencia y ANULACION saca de la caja lo cobrado, por método. Nada se borra.
   */
  async anularEn(tx: Tx, id: string, dto: AnularVentaDto, usuario: UsuarioAutenticado) {
    const venta = await tx.venta.findUnique({
      where: { id },
      include: { detalles: true, pagos: true },
    });
    if (!venta) {
      throw new NotFoundException('La venta no existe');
    }
    if (usuario.rol !== Rol.GERENTE || usuario.ubicacionId !== venta.ubicacionId) {
      throw new ForbiddenException('Solo el gerente de la sucursal puede anular sus ventas');
    }
    if (venta.estado === EstadoVenta.ANULADA) {
      throw new ReglaNegocioException(`La venta #${venta.numero} ya está anulada`);
    }
    if (!venta.turnoCajaId) {
      throw new ReglaNegocioException(
        `La venta #${venta.numero} no tiene turno de caja; se revierte desde su pedido`,
      );
    }
    const turno = await tx.turnoCaja.findUniqueOrThrow({ where: { id: venta.turnoCajaId } });
    if (turno.estado !== EstadoTurnoCaja.ABIERTO) {
      throw new ReglaNegocioException(
        `El turno de caja de la venta #${venta.numero} ya se cerró: solo se anulan ventas de un turno abierto`,
      );
    }
    await this.caja.bloquearTurno(tx, turno.id);

    // La devolución en efectivo sale de la gaveta: no puede ser mayor que lo que hay.
    const efectivo = venta.pagos
      .filter((p) => p.metodo === MetodoPago.EFECTIVO)
      .reduce((s, p) => s.add(p.monto), new Decimal(0));
    if (efectivo.greaterThan(0)) {
      const { efectivoEsperado } = await this.caja.resumen(tx, turno.id, turno.montoInicial);
      if (efectivoEsperado.lessThan(efectivo)) {
        throw new ReglaNegocioException(
          `En la caja hay Q${efectivoEsperado.toFixed(2)} en efectivo; no alcanza para devolver Q${efectivo.toFixed(2)}`,
        );
      }
    }

    const { count } = await tx.venta.updateMany({
      where: { id, estado: EstadoVenta.COMPLETADA },
      data: {
        estado: EstadoVenta.ANULADA,
        motivoAnulacion: dto.motivo,
        fechaAnulacion: new Date(),
        anuladaPorId: usuario.id,
      },
    });
    if (count === 0) {
      throw new ReglaNegocioException(`La venta #${venta.numero} ya está anulada`);
    }
    const motivo = `Anulación de la venta #${venta.numero}: ${dto.motivo}`;
    for (const d of venta.detalles) {
      await this.motor.ingresar(tx, {
        ubicacionId: venta.ubicacionId,
        loteId: d.loteId,
        cantidad: d.cantidad,
        tipo: TipoMovimientoInventario.ANULACION_VENTA,
        referenciaTipo: REFERENCIA,
        referenciaId: venta.id,
        motivo,
        usuarioId: usuario.id,
      });
    }
    for (const p of venta.pagos) {
      await this.caja.registrarEn(tx, {
        turnoCajaId: turno.id,
        tipo: TipoMovimientoCaja.ANULACION,
        metodoPago: p.metodo,
        monto: p.monto,
        referenciaId: venta.id,
        descripcion: motivo,
        usuarioId: usuario.id,
      });
    }
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  /**
   * Búsqueda del punto de venta: productos activos con su precio y la existencia vigente en la
   * ubicación del usuario. Los que no tienen existencia aparecen al final.
   */
  async productos(filtro: BusquedaProductosVentaDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario);
    if (!ubicacionId) {
      throw new ReglaNegocioException('El punto de venta requiere una ubicación');
    }
    const patron = `%${filtro.q ?? ''}%`;
    const filas = await this.prisma.$queryRaw<
      {
        id: string;
        sku: string;
        nombre: string;
        principio_activo: string;
        presentacion: string;
        precio_venta: Prisma.Decimal;
        requiere_receta: boolean;
        vigente: number;
      }[]
    >`
      SELECT p.id, p.sku, p.nombre, p.principio_activo, p.presentacion, p.precio_venta,
             p.requiere_receta,
             COALESCE(SUM(e.cantidad) FILTER (WHERE l.fecha_vencimiento >= ${hoyGuatemala()}::date), 0)::int AS vigente
      FROM producto p
      LEFT JOIN lote l ON l.producto_id = p.id
      LEFT JOIN existencia e ON e.lote_id = l.id AND e.ubicacion_id = ${ubicacionId}::uuid
      WHERE p.activo
        AND (p.nombre ILIKE ${patron} OR p.sku ILIKE ${patron} OR p.principio_activo ILIKE ${patron})
      GROUP BY p.id
      ORDER BY (COALESCE(SUM(e.cantidad) FILTER (WHERE l.fecha_vencimiento >= ${hoyGuatemala()}::date), 0) > 0) DESC,
               p.nombre
      LIMIT 24`;
    return filas.map((f) => ({
      id: f.id,
      sku: f.sku,
      nombre: f.nombre,
      principioActivo: f.principio_activo,
      presentacion: f.presentacion,
      precioVenta: f.precio_venta,
      requiereReceta: f.requiere_receta,
      vigente: f.vigente,
    }));
  }

  async listar(filtro: FiltroVentasDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId);
    const q = filtro.q?.trim().replace(/^#/, '');
    const where: Prisma.VentaWhereInput = {
      ...(ubicacionId && { ubicacionId }),
      ...(filtro.estado && { estado: filtro.estado }),
      ...(filtro.canal && { canal: filtro.canal }),
      ...(filtro.turnoCajaId && { turnoCajaId: filtro.turnoCajaId }),
      ...(q &&
        (/^\d+$/.test(q)
          ? { OR: [{ numero: Number(q) }, { nit: q }] }
          : { nit: { contains: q.toUpperCase() } })),
      ...((filtro.desde || filtro.hasta) && {
        createdAt: {
          ...(filtro.desde && { gte: new Date(filtro.desde) }),
          ...(filtro.hasta && { lt: sumarDias(new Date(filtro.hasta), 1) }),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.venta.findMany({
        where,
        include: {
          ubicacion: ubicacionResumen,
          usuario: usuarioResumen,
          pagos: { select: { metodo: true, monto: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...saltar(filtro),
      }),
      this.prisma.venta.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findUnique({
      where: { id },
      include: {
        ubicacion: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            tipo: true,
            direccion: true,
            telefono: true,
          },
        },
        usuario: usuarioResumen,
        anuladaPor: usuarioResumen,
        turnoCaja: { select: { id: true, estado: true } },
        pagos: { orderBy: { createdAt: 'asc' } },
        detalles: {
          include: {
            producto: { select: { id: true, sku: true, nombre: true, presentacion: true } },
            lote: { select: { id: true, numeroLote: true, fechaVencimiento: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!venta) {
      throw new NotFoundException('La venta no existe');
    }
    if (!esRolGlobal(usuario.rol) && usuario.ubicacionId !== venta.ubicacionId) {
      throw new ForbiddenException('Solo puede acceder a los datos de su ubicación');
    }
    return {
      ...venta,
      puedeAnular:
        usuario.rol === Rol.GERENTE &&
        venta.estado === EstadoVenta.COMPLETADA &&
        venta.turnoCaja?.estado === EstadoTurnoCaja.ABIERTO,
    };
  }
}
