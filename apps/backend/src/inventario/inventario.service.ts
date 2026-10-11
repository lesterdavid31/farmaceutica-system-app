import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TipoMovimientoInventario } from '../generated/prisma/enums';
import { resolverUbicacion, verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { fechaCorta, OPCIONES_TRANSACCION } from '../common/formato';
import { pagina } from '../common/paginacion';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { diasHasta, estaVencido, hoyGuatemala, sumarDias, vigenciaDe } from './fefo';
import {
  AjusteDto,
  BajaDto,
  FiltroExistenciasDto,
  FiltroKardexDto,
  StockMinimoDto,
} from './inventario.dto';
import { MotorInventarioService } from './motor-inventario.service';

interface FilaResumen {
  id: string;
  sku: string;
  nombre: string;
  principio_activo: string;
  presentacion: string;
  requiere_receta: boolean;
  categoria: string;
  vigente: number;
  por_vencer: number;
  vencido: number;
  valor_costo: Prisma.Decimal;
  cantidad_minima: number | null;
  total: bigint;
}

interface FilaLote {
  ubicacion_id: string;
  ubicacion: string;
  lote_id: string;
  producto_id: string;
  numero_lote: string;
  fecha_vencimiento: Date;
  costo_unitario: Prisma.Decimal;
  cantidad: number;
}

interface FilaKardex {
  id: string;
  created_at: Date;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  saldo: bigint;
  costo_unitario: Prisma.Decimal;
  motivo: string | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  ubicacion_id: string;
  ubicacion: string;
  lote_id: string;
  numero_lote: string;
  fecha_vencimiento: Date;
  usuario: string;
  total: bigint;
}

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: MotorInventarioService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  private async diasAlerta() {
    return this.configuracion.obtener('DIAS_ALERTA_VENCIMIENTO');
  }

  private async ubicacionActiva(ubicacionId: string) {
    const ubicacion = await this.prisma.ubicacion.findUnique({ where: { id: ubicacionId } });
    if (!ubicacion) {
      throw new NotFoundException('La ubicación no existe');
    }
    if (!ubicacion.activa) {
      throw new ReglaNegocioException('La ubicación está desactivada');
    }
    return ubicacion;
  }

  // ─── Consultas ───────────────────────────────────────────────────────────────

  /**
   * Existencias por producto en una ubicación (o en todas), con totales vigente, por vencer y
   * vencido, y el desglose por lote (RF-05). Las sumas se hacen en SQL, no en memoria.
   */
  async existencias(filtro: FiltroExistenciasDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId) ?? null;
    const hoy = hoyGuatemala();
    const diasAlerta = await this.diasAlerta();
    const limite = sumarDias(hoy, diasAlerta);

    const condiciones = [Prisma.sql`p.activo`];
    if (filtro.q) {
      const patron = `%${filtro.q}%`;
      condiciones.push(
        Prisma.sql`(p.nombre ILIKE ${patron} OR p.sku ILIKE ${patron} OR p.principio_activo ILIKE ${patron})`,
      );
    }
    if (filtro.categoriaId) {
      condiciones.push(Prisma.sql`p.categoria_id = ${filtro.categoriaId}::uuid`);
    }
    const filtrosResumen = [Prisma.sql`TRUE`];
    if (filtro.conExistencia) {
      filtrosResumen.push(Prisma.sql`(vigente + vencido) > 0`);
    }
    if (filtro.bajoMinimo) {
      filtrosResumen.push(Prisma.sql`cantidad_minima IS NOT NULL AND vigente < cantidad_minima`);
    }

    const filas = await this.prisma.$queryRaw<FilaResumen[]>`
      WITH resumen AS (
        SELECT p.id, p.sku, p.nombre, p.principio_activo, p.presentacion, p.requiere_receta,
               c.nombre AS categoria,
               COALESCE(SUM(e.cantidad) FILTER (WHERE l.fecha_vencimiento >= ${hoy}::date), 0)::int AS vigente,
               COALESCE(SUM(e.cantidad) FILTER (
                 WHERE l.fecha_vencimiento >= ${hoy}::date AND l.fecha_vencimiento <= ${limite}::date
               ), 0)::int AS por_vencer,
               COALESCE(SUM(e.cantidad) FILTER (WHERE l.fecha_vencimiento < ${hoy}::date), 0)::int AS vencido,
               COALESCE(SUM(e.cantidad * l.costo_unitario) FILTER (
                 WHERE l.fecha_vencimiento >= ${hoy}::date
               ), 0)::numeric(14, 2) AS valor_costo,
               sm.cantidad_minima
        FROM producto p
        JOIN categoria c ON c.id = p.categoria_id
        LEFT JOIN lote l ON l.producto_id = p.id
        LEFT JOIN existencia e ON e.lote_id = l.id AND e.cantidad > 0
             AND (${ubicacionId}::uuid IS NULL OR e.ubicacion_id = ${ubicacionId}::uuid)
        LEFT JOIN stock_minimo sm ON sm.producto_id = p.id AND sm.ubicacion_id = ${ubicacionId}::uuid
        WHERE ${Prisma.join(condiciones, ' AND ')}
        GROUP BY p.id, c.nombre, sm.cantidad_minima
      )
      SELECT *, COUNT(*) OVER () AS total
      FROM resumen
      WHERE ${Prisma.join(filtrosResumen, ' AND ')}
      ORDER BY nombre
      LIMIT ${filtro.limit} OFFSET ${(filtro.page - 1) * filtro.limit}`;

    const lotes = await this.lotesDe(
      filas.map((f) => f.id),
      ubicacionId,
    );
    const data = filas.map((f) => ({
      producto: {
        id: f.id,
        sku: f.sku,
        nombre: f.nombre,
        principioActivo: f.principio_activo,
        presentacion: f.presentacion,
        requiereReceta: f.requiere_receta,
        categoria: f.categoria,
      },
      vigente: f.vigente,
      porVencer: f.por_vencer,
      vencido: f.vencido,
      valorCosto: f.valor_costo,
      cantidadMinima: f.cantidad_minima,
      bajoMinimo: f.cantidad_minima !== null && f.vigente < f.cantidad_minima,
      lotes: lotes
        .filter((l) => l.producto_id === f.id)
        .map((l) => ({
          loteId: l.lote_id,
          numeroLote: l.numero_lote,
          fechaVencimiento: l.fecha_vencimiento,
          costoUnitario: l.costo_unitario,
          cantidad: l.cantidad,
          ubicacionId: l.ubicacion_id,
          ubicacion: l.ubicacion,
          vigencia: vigenciaDe(l.fecha_vencimiento, hoy, diasAlerta),
          diasParaVencer: diasHasta(l.fecha_vencimiento, hoy),
        })),
    }));
    return { ...pagina(data, Number(filas[0]?.total ?? 0), filtro), ubicacionId, diasAlerta };
  }

  private async lotesDe(productoIds: string[], ubicacionId: string | null) {
    if (productoIds.length === 0) {
      return [];
    }
    return this.prisma.$queryRaw<FilaLote[]>`
      SELECT e.ubicacion_id, u.nombre AS ubicacion, l.id AS lote_id, l.producto_id, l.numero_lote,
             l.fecha_vencimiento, l.costo_unitario, e.cantidad
      FROM existencia e
      JOIN lote l ON l.id = e.lote_id
      JOIN ubicacion u ON u.id = e.ubicacion_id
      WHERE l.producto_id IN (${Prisma.join(productoIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND e.cantidad > 0
        AND (${ubicacionId}::uuid IS NULL OR e.ubicacion_id = ${ubicacionId}::uuid)
      ORDER BY l.fecha_vencimiento, u.nombre`;
  }

  /** Stock de un producto en todas las ubicaciones activas (RF-06). */
  async stockGlobal(productoId: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true, sku: true, nombre: true, presentacion: true },
    });
    if (!producto) {
      throw new NotFoundException('El producto no existe');
    }
    const hoy = hoyGuatemala();
    const limite = sumarDias(hoy, await this.diasAlerta());
    const ubicaciones = await this.prisma.$queryRaw<
      {
        id: string;
        codigo: string;
        nombre: string;
        tipo: string;
        vigente: number;
        por_vencer: number;
        vencido: number;
        proximo_vencimiento: Date | null;
      }[]
    >`
      SELECT u.id, u.codigo, u.nombre, u.tipo::text AS tipo,
             COALESCE(SUM(x.cantidad) FILTER (WHERE x.fecha_vencimiento >= ${hoy}::date), 0)::int AS vigente,
             COALESCE(SUM(x.cantidad) FILTER (
               WHERE x.fecha_vencimiento >= ${hoy}::date AND x.fecha_vencimiento <= ${limite}::date
             ), 0)::int AS por_vencer,
             COALESCE(SUM(x.cantidad) FILTER (WHERE x.fecha_vencimiento < ${hoy}::date), 0)::int AS vencido,
             MIN(x.fecha_vencimiento) FILTER (WHERE x.fecha_vencimiento >= ${hoy}::date) AS proximo_vencimiento
      FROM ubicacion u
      LEFT JOIN (
        SELECT e.ubicacion_id, e.cantidad, l.fecha_vencimiento
        FROM existencia e JOIN lote l ON l.id = e.lote_id
        WHERE l.producto_id = ${productoId}::uuid AND e.cantidad > 0
      ) x ON x.ubicacion_id = u.id
      WHERE u.activa
      GROUP BY u.id
      ORDER BY vigente DESC, u.nombre`;
    return {
      producto,
      totalVigente: ubicaciones.reduce((s, u) => s + u.vigente, 0),
      ubicaciones: ubicaciones.map((u) => ({
        ubicacion: { id: u.id, codigo: u.codigo, nombre: u.nombre, tipo: u.tipo },
        vigente: u.vigente,
        porVencer: u.por_vencer,
        vencido: u.vencido,
        proximoVencimiento: u.proximo_vencimiento,
      })),
    };
  }

  /**
   * Kardex de un producto por ubicación (RF-07), del más reciente al más antiguo, con el saldo
   * acumulado de la ubicación después de cada movimiento (calculado con una función de ventana).
   */
  async kardex(filtro: FiltroKardexDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId) ?? null;
    const condiciones = [Prisma.sql`TRUE`];
    if (filtro.tipo) {
      condiciones.push(Prisma.sql`k.tipo = ${filtro.tipo}::tipo_movimiento_inventario`);
    }
    if (filtro.desde) {
      condiciones.push(Prisma.sql`k.created_at >= ${new Date(filtro.desde)}`);
    }
    if (filtro.hasta) {
      condiciones.push(Prisma.sql`k.created_at < ${sumarDias(new Date(filtro.hasta), 1)}`);
    }
    const filas = await this.prisma.$queryRaw<FilaKardex[]>`
      WITH k AS (
        SELECT m.*, SUM(m.cantidad) OVER (
                 PARTITION BY m.ubicacion_id ORDER BY m.created_at, m.id
               ) AS saldo
        FROM movimiento_inventario m
        JOIN lote l ON l.id = m.lote_id
        WHERE l.producto_id = ${filtro.productoId}::uuid
          AND (${ubicacionId}::uuid IS NULL OR m.ubicacion_id = ${ubicacionId}::uuid)
      )
      SELECT k.id, k.created_at, k.tipo, k.cantidad, k.saldo, k.costo_unitario, k.motivo,
             k.referencia_tipo, k.referencia_id, k.ubicacion_id, u.nombre AS ubicacion,
             k.lote_id, l.numero_lote, l.fecha_vencimiento, us.nombre AS usuario,
             COUNT(*) OVER () AS total
      FROM k
      JOIN ubicacion u ON u.id = k.ubicacion_id
      JOIN lote l ON l.id = k.lote_id
      JOIN usuario us ON us.id = k.usuario_id
      WHERE ${Prisma.join(condiciones, ' AND ')}
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT ${filtro.limit} OFFSET ${(filtro.page - 1) * filtro.limit}`;

    const data = filas.map((f) => ({
      id: f.id,
      fecha: f.created_at,
      tipo: f.tipo,
      cantidad: f.cantidad,
      saldo: Number(f.saldo),
      costoUnitario: f.costo_unitario,
      motivo: f.motivo,
      referenciaTipo: f.referencia_tipo,
      referenciaId: f.referencia_id,
      ubicacion: { id: f.ubicacion_id, nombre: f.ubicacion },
      lote: { id: f.lote_id, numeroLote: f.numero_lote, fechaVencimiento: f.fecha_vencimiento },
      usuario: f.usuario,
    }));
    return pagina(data, Number(filas[0]?.total ?? 0), filtro);
  }

  /** Lotes vencidos pendientes de baja, próximos a vencer y productos bajo el mínimo (RF-09). */
  async alertas(ubicacionSolicitada: string | undefined, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, ubicacionSolicitada);
    const hoy = hoyGuatemala();
    const diasAlerta = await this.diasAlerta();
    const limite = sumarDias(hoy, diasAlerta);
    const incluir = {
      lote: {
        select: {
          id: true,
          numeroLote: true,
          fechaVencimiento: true,
          costoUnitario: true,
          producto: { select: { id: true, sku: true, nombre: true } },
        },
      },
      ubicacion: { select: { id: true, nombre: true } },
    } as const;
    const base = { cantidad: { gt: 0 }, ...(ubicacionId && { ubicacionId }) };

    const [vencidos, porVencer, bajoMinimo] = await Promise.all([
      this.prisma.existencia.findMany({
        where: { ...base, lote: { fechaVencimiento: { lt: hoy } } },
        include: incluir,
        orderBy: { lote: { fechaVencimiento: 'asc' } },
        take: 500,
      }),
      this.prisma.existencia.findMany({
        where: { ...base, lote: { fechaVencimiento: { gte: hoy, lte: limite } } },
        include: incluir,
        orderBy: { lote: { fechaVencimiento: 'asc' } },
        take: 500,
      }),
      this.bajoMinimo(ubicacionId ?? null, hoy),
    ]);

    const conDias = <T extends { lote: { fechaVencimiento: Date } }>(lista: T[]) =>
      lista.map((e) => ({ ...e, diasParaVencer: diasHasta(e.lote.fechaVencimiento, hoy) }));
    return {
      diasAlerta,
      vencidos: conDias(vencidos),
      porVencer: conDias(porVencer),
      bajoMinimo,
    };
  }

  /** RN-05: productos con existencia vigente por debajo del mínimo, con una cantidad sugerida. */
  private async bajoMinimo(ubicacionId: string | null, hoy: Date) {
    const filas = await this.prisma.$queryRaw<
      {
        ubicacion_id: string;
        ubicacion: string;
        producto_id: string;
        sku: string;
        nombre: string;
        cantidad_minima: number;
        vigente: number;
      }[]
    >`
      SELECT sm.ubicacion_id, u.nombre AS ubicacion, p.id AS producto_id, p.sku, p.nombre,
             sm.cantidad_minima,
             COALESCE((
               SELECT SUM(e.cantidad) FROM existencia e JOIN lote l ON l.id = e.lote_id
               WHERE e.ubicacion_id = sm.ubicacion_id AND l.producto_id = sm.producto_id
                 AND l.fecha_vencimiento >= ${hoy}::date
             ), 0)::int AS vigente
      FROM stock_minimo sm
      JOIN producto p ON p.id = sm.producto_id AND p.activo
      JOIN ubicacion u ON u.id = sm.ubicacion_id AND u.activa
      WHERE (${ubicacionId}::uuid IS NULL OR sm.ubicacion_id = ${ubicacionId}::uuid)
        AND sm.cantidad_minima > 0`;
    return filas
      .filter((f) => f.vigente < f.cantidad_minima)
      .map((f) => ({
        ubicacion: { id: f.ubicacion_id, nombre: f.ubicacion },
        producto: { id: f.producto_id, sku: f.sku, nombre: f.nombre },
        cantidadMinima: f.cantidad_minima,
        vigente: f.vigente,
        // Se sugiere reabastecer hasta el doble del mínimo.
        sugerido: f.cantidad_minima * 2 - f.vigente,
      }))
      .sort((a, b) => a.vigente / a.cantidadMinima - b.vigente / b.cantidadMinima);
  }

  async stockMinimos(ubicacionSolicitada: string | undefined, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, ubicacionSolicitada);
    return this.prisma.stockMinimo.findMany({
      where: { ...(ubicacionId && { ubicacionId }) },
      include: {
        producto: { select: { id: true, sku: true, nombre: true } },
        ubicacion: { select: { id: true, nombre: true } },
      },
      orderBy: [{ ubicacion: { nombre: 'asc' } }, { producto: { nombre: 'asc' } }],
    });
  }

  // ─── Operaciones ─────────────────────────────────────────────────────────────

  /** Define el stock mínimo de un producto en una ubicación; 0 lo elimina (RN-05). */
  async guardarStockMinimo(dto: StockMinimoDto, usuario: UsuarioAutenticado) {
    verificarAccesoUbicacion(usuario, dto.ubicacionId);
    await this.ubicacionActiva(dto.ubicacionId);
    const clave = {
      ubicacionId_productoId: { ubicacionId: dto.ubicacionId, productoId: dto.productoId },
    };
    if (dto.cantidadMinima === 0) {
      await this.prisma.stockMinimo.deleteMany({
        where: { ubicacionId: dto.ubicacionId, productoId: dto.productoId },
      });
      return { ...dto, eliminado: true };
    }
    return this.prisma.stockMinimo.upsert({
      where: clave,
      update: { cantidadMinima: dto.cantidadMinima },
      create: dto,
    });
  }

  /** Ajuste de inventario con motivo obligatorio (RN-06, RF-08). */
  async ajustar(dto: AjusteDto, usuario: UsuarioAutenticado) {
    verificarAccesoUbicacion(usuario, dto.ubicacionId);
    await this.ubicacionActiva(dto.ubicacionId);
    const comun = {
      ubicacionId: dto.ubicacionId,
      loteId: dto.loteId,
      tipo: TipoMovimientoInventario.AJUSTE,
      motivo: dto.motivo,
      usuarioId: usuario.id,
      referenciaTipo: 'AJUSTE',
    };
    const movimiento = await this.prisma.$transaction(
      (tx) =>
        dto.cantidad > 0
          ? this.motor.ingresar(tx, { ...comun, cantidad: dto.cantidad })
          : this.motor.descontarLote(tx, {
              ...comun,
              cantidad: -dto.cantidad,
              permitirVencido: true,
            }),
      OPCIONES_TRANSACCION,
    );
    return this.prisma.movimientoInventario.findUniqueOrThrow({
      where: { id: movimiento.id },
      include: { lote: { include: { producto: { select: { nombre: true, sku: true } } } } },
    });
  }

  /**
   * Da de baja lotes vencidos con un movimiento BAJA_VENCIMIENTO por lote (RN-07, RF-10).
   * Sin `loteId`, da de baja todos los lotes vencidos de la ubicación.
   */
  async darDeBaja(dto: BajaDto, usuario: UsuarioAutenticado) {
    verificarAccesoUbicacion(usuario, dto.ubicacionId);
    await this.ubicacionActiva(dto.ubicacionId);
    const hoy = hoyGuatemala();
    const existencias = await this.prisma.existencia.findMany({
      where: {
        ubicacionId: dto.ubicacionId,
        cantidad: { gt: 0 },
        ...(dto.loteId && { loteId: dto.loteId }),
      },
      include: { lote: { include: { producto: { select: { nombre: true } } } } },
    });

    if (dto.loteId) {
      const existencia = existencias[0];
      if (!existencia) {
        throw new ReglaNegocioException('El lote no tiene existencia en esta ubicación');
      }
      if (!estaVencido(existencia.lote.fechaVencimiento, hoy)) {
        throw new ReglaNegocioException(
          `El lote ${existencia.lote.numeroLote} todavía no vence (vence el ${fechaCorta(existencia.lote.fechaVencimiento)}). Para corregir su cantidad registre un ajuste.`,
        );
      }
    }
    const vencidas = existencias.filter((e) => estaVencido(e.lote.fechaVencimiento, hoy));
    if (vencidas.length === 0) {
      throw new ReglaNegocioException('No hay lotes vencidos pendientes de baja en esta ubicación');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const e of vencidas) {
        await this.motor.descontarLote(tx, {
          ubicacionId: dto.ubicacionId,
          loteId: e.loteId,
          cantidad: e.cantidad,
          tipo: TipoMovimientoInventario.BAJA_VENCIMIENTO,
          permitirVencido: true,
          motivo: `Lote vencido el ${fechaCorta(e.lote.fechaVencimiento)}`,
          referenciaTipo: 'BAJA',
          usuarioId: usuario.id,
        });
      }
    }, OPCIONES_TRANSACCION);

    return {
      lotes: vencidas.length,
      unidades: vencidas.reduce((s, e) => s + e.cantidad, 0),
      detalle: vencidas.map((e) => ({
        loteId: e.loteId,
        numeroLote: e.lote.numeroLote,
        producto: e.lote.producto.nombre,
        cantidad: e.cantidad,
      })),
    };
  }
}
