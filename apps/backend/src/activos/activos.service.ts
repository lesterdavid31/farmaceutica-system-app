import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { resolverUbicacion, verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { hoyGuatemala, sumarDias } from '../inventario/fefo';
import type { Tx } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActualizarActivoDto,
  ActualizarCategoriaActivoDto,
  CrearActivoDto,
  FiltroActivosDto,
  ReporteActivosDto,
  TrasladarActivoDto,
} from './activos.dto';
import { calcularDepreciacion, fechaFinVidaUtil } from './depreciacion';

const Decimal = Prisma.Decimal;
const fechaDe = (texto: string) => new Date(`${texto.slice(0, 10)}T00:00:00.000Z`);
/** Fin del día en Guatemala (UTC−6) de una fecha DATE, para comparar con marcas de tiempo. */
const finDelDiaGuatemala = (fecha: Date) => new Date(sumarDias(fecha, 1).getTime() + 6 * 3_600_000);

const ubicacionResumen = { select: { id: true, codigo: true, nombre: true, tipo: true } } as const;
const incluir = {
  categoria: { select: { id: true, nombre: true, vidaUtilMeses: true } },
  ubicacion: ubicacionResumen,
} as const;

interface Acumulado {
  cantidad: number;
  costo: Prisma.Decimal;
  depreciacionAcumulada: Prisma.Decimal;
  valorEnLibros: Prisma.Decimal;
}
const vacio = (): Acumulado => ({
  cantidad: 0,
  costo: new Decimal(0),
  depreciacionAcumulada: new Decimal(0),
  valorEnLibros: new Decimal(0),
});

/**
 * Activos fijos (RF-29 a RF-31, RN-24 a RN-26): alta con depreciación lineal, traslados con
 * historial inmutable y reporte de valor en libros a cualquier fecha.
 */
@Injectable()
export class ActivosService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Activos ──────────────────────────────────────────────────────────────────

  async listar(filtro: FiltroActivosDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId);
    const q = filtro.q?.trim();
    const where: Prisma.ActivoFijoWhereInput = {
      ...(ubicacionId && { ubicacionId }),
      ...(filtro.categoriaId && { categoriaId: filtro.categoriaId }),
      ...(filtro.activo !== undefined && { activo: filtro.activo }),
      ...(q && {
        OR: [
          { codigo: { contains: q, mode: 'insensitive' } },
          { descripcion: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.activoFijo.findMany({
        where,
        include: incluir,
        orderBy: [{ activo: 'desc' }, { codigo: 'asc' }],
        ...saltar(filtro),
      }),
      this.prisma.activoFijo.count({ where }),
    ]);
    const hoy = hoyGuatemala();
    const data = filas.map((a) => ({ ...a, depreciacion: calcularDepreciacion(a, hoy) }));
    return pagina(data, total, filtro);
  }

  /** Detalle con historial de ubicaciones y la depreciación por año (RF-29, RF-30). */
  async obtener(id: string, usuario: UsuarioAutenticado) {
    const activo = await this.prisma.activoFijo.findUnique({
      where: { id },
      include: {
        ...incluir,
        historialUbicaciones: {
          include: {
            ubicacionOrigen: ubicacionResumen,
            ubicacionDestino: ubicacionResumen,
            usuario: { select: { id: true, nombre: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!activo) {
      throw new NotFoundException('El activo no existe');
    }
    verificarAccesoUbicacion(usuario, activo.ubicacionId);
    const hoy = hoyGuatemala();
    return {
      ...activo,
      depreciacion: calcularDepreciacion(activo, hoy),
      fechaFinVidaUtil: fechaFinVidaUtil(activo),
      calendario: this.calendario(activo),
    };
  }

  /** Depreciación de cada año calendario hasta terminar la vida útil (valores al 31 de diciembre). */
  private calendario(activo: Parameters<typeof calcularDepreciacion>[0]) {
    const fin = fechaFinVidaUtil(activo);
    const filas = [];
    let anterior = new Decimal(0);
    for (
      let anio = activo.fechaAdquisicion.getUTCFullYear();
      anio <= fin.getUTCFullYear();
      anio++
    ) {
      const corte = new Date(Date.UTC(anio, 11, 31));
      const d = calcularDepreciacion(activo, corte < fin ? corte : fin);
      filas.push({
        anio,
        depreciacionAnio: d.depreciacionAcumulada.sub(anterior),
        depreciacionAcumulada: d.depreciacionAcumulada,
        valorEnLibros: d.valorEnLibros,
      });
      anterior = d.depreciacionAcumulada;
    }
    return filas;
  }

  async crear(dto: CrearActivoDto, usuario: UsuarioAutenticado) {
    const id = await this.prisma.$transaction(
      (tx) => this.crearEn(tx, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  async crearEn(tx: Tx, dto: CrearActivoDto, usuario: UsuarioAutenticado): Promise<string> {
    const categoria = await tx.categoriaActivo.findUnique({ where: { id: dto.categoriaId } });
    if (!categoria) {
      throw new ReglaNegocioException('La categoría de activo no existe');
    }
    await this.ubicacionActiva(tx, dto.ubicacionId);
    if (await tx.activoFijo.findUnique({ where: { codigo: dto.codigo } })) {
      throw new ConflictException('Ya existe un activo con ese código');
    }
    const datos = {
      codigo: dto.codigo,
      descripcion: dto.descripcion,
      categoriaId: dto.categoriaId,
      ubicacionId: dto.ubicacionId,
      fechaAdquisicion: fechaDe(dto.fechaAdquisicion),
      costo: new Decimal(dto.costo),
      valorResidual: new Decimal(dto.valorResidual ?? 0),
      // RN-25: si no se indica, se usa la vida útil por defecto de la categoría.
      vidaUtilMeses: dto.vidaUtilMeses ?? categoria.vidaUtilMeses,
    };
    this.validarMontos(datos);
    const activo = await this.guardar(() => tx.activoFijo.create({ data: datos }));
    await tx.historialUbicacionActivo.create({
      data: {
        activoId: activo.id,
        ubicacionDestinoId: dto.ubicacionId,
        motivo: 'Alta del activo',
        usuarioId: usuario.id,
      },
    });
    return activo.id;
  }

  async actualizar(id: string, dto: ActualizarActivoDto, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.activoFijo.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException('El activo no existe');
    }
    if (
      dto.categoriaId &&
      !(await this.prisma.categoriaActivo.findUnique({ where: { id: dto.categoriaId } }))
    ) {
      throw new ReglaNegocioException('La categoría de activo no existe');
    }
    const fechaAdquisicion = dto.fechaAdquisicion ? fechaDe(dto.fechaAdquisicion) : undefined;
    const datos = { ...dto, fechaAdquisicion };
    this.validarMontos({
      costo: new Decimal(dto.costo ?? actual.costo),
      valorResidual: new Decimal(dto.valorResidual ?? actual.valorResidual),
      fechaAdquisicion: fechaAdquisicion ?? actual.fechaAdquisicion,
    });
    await this.guardar(() => this.prisma.activoFijo.update({ where: { id }, data: datos }));
    return this.obtener(id, usuario);
  }

  /** Baja del activo: deja de aparecer en los reportes, pero conserva su historial. */
  async darDeBaja(id: string, usuario: UsuarioAutenticado) {
    const actual = await this.prisma.activoFijo.findUnique({ where: { id } });
    if (!actual) {
      throw new NotFoundException('El activo no existe');
    }
    await this.prisma.activoFijo.update({ where: { id }, data: { activo: false } });
    return this.obtener(id, usuario);
  }

  async trasladar(id: string, dto: TrasladarActivoDto, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction(
      (tx) => this.trasladarEn(tx, id, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  /** RN-26: cambia la ubicación y deja el cambio en el historial inmutable. */
  async trasladarEn(tx: Tx, id: string, dto: TrasladarActivoDto, usuario: UsuarioAutenticado) {
    const activo = await tx.activoFijo.findUnique({ where: { id } });
    if (!activo) {
      throw new NotFoundException('El activo no existe');
    }
    if (!activo.activo) {
      throw new ReglaNegocioException('El activo está dado de baja y no se puede trasladar');
    }
    if (activo.ubicacionId === dto.ubicacionDestinoId) {
      throw new ReglaNegocioException('El activo ya está en esa ubicación');
    }
    await this.ubicacionActiva(tx, dto.ubicacionDestinoId);
    await tx.activoFijo.update({
      where: { id },
      data: { ubicacionId: dto.ubicacionDestinoId },
    });
    await tx.historialUbicacionActivo.create({
      data: {
        activoId: id,
        ubicacionOrigenId: activo.ubicacionId,
        ubicacionDestinoId: dto.ubicacionDestinoId,
        motivo: dto.motivo,
        usuarioId: usuario.id,
      },
    });
  }

  private validarMontos(d: {
    costo: Prisma.Decimal;
    valorResidual: Prisma.Decimal;
    fechaAdquisicion: Date;
  }) {
    if (d.valorResidual.greaterThan(d.costo)) {
      throw new ReglaNegocioException('El valor residual no puede ser mayor que el costo');
    }
    if (d.fechaAdquisicion > hoyGuatemala()) {
      throw new ReglaNegocioException('La fecha de adquisición no puede ser futura');
    }
  }

  private async ubicacionActiva(db: Tx, id: string) {
    const u = await db.ubicacion.findUnique({ where: { id } });
    if (!u?.activa) {
      throw new ReglaNegocioException('La ubicación no existe o está desactivada');
    }
    return u;
  }

  private async guardar<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un activo con ese código');
      }
      throw error;
    }
  }

  // ─── Reporte (RF-31) ──────────────────────────────────────────────────────────

  /**
   * Valor en libros a una fecha, por ubicación y por categoría, con la depreciación acumulada.
   * La ubicación de cada activo es la que tenía en esa fecha según su historial de traslados.
   * Se excluyen los activos adquiridos después de la fecha y los dados de baja.
   */
  async reporte(dto: ReporteActivosDto, usuario: UsuarioAutenticado, db: Tx = this.prisma) {
    const fecha = dto.fecha ? fechaDe(dto.fecha) : hoyGuatemala();
    const ubicacionFiltro = resolverUbicacion(usuario, dto.ubicacionId);
    const limite = finDelDiaGuatemala(fecha);
    const activos = await db.activoFijo.findMany({
      where: {
        activo: true,
        fechaAdquisicion: { lte: fecha },
        ...(dto.categoriaId && { categoriaId: dto.categoriaId }),
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
        historialUbicaciones: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { codigo: 'asc' },
    });
    const ubicaciones = await db.ubicacion.findMany({ select: ubicacionResumen.select });

    const filas = activos
      .map((a) => {
        const previos = a.historialUbicaciones.filter((h) => h.createdAt <= limite);
        // Si el activo se registró en el sistema después de la fecha, vale su primera ubicación.
        const ubicacionId =
          (previos.at(-1) ?? a.historialUbicaciones[0])?.ubicacionDestinoId ?? a.ubicacionId;
        const d = calcularDepreciacion(a, fecha);
        return {
          id: a.id,
          codigo: a.codigo,
          descripcion: a.descripcion,
          categoria: a.categoria,
          ubicacion: ubicaciones.find((u) => u.id === ubicacionId)!,
          fechaAdquisicion: a.fechaAdquisicion,
          costo: new Decimal(a.costo),
          valorResidual: a.valorResidual,
          vidaUtilMeses: a.vidaUtilMeses,
          mesesDepreciados: d.mesesDepreciados,
          depreciacionMensual: d.depreciacionMensual,
          depreciacionAcumulada: d.depreciacionAcumulada,
          valorEnLibros: d.valorEnLibros,
        };
      })
      .filter((f) => !ubicacionFiltro || f.ubicacion.id === ubicacionFiltro);

    const sumar = (acc: Acumulado, f: (typeof filas)[number]) => {
      acc.cantidad += 1;
      acc.costo = acc.costo.add(f.costo);
      acc.depreciacionAcumulada = acc.depreciacionAcumulada.add(f.depreciacionAcumulada);
      acc.valorEnLibros = acc.valorEnLibros.add(f.valorEnLibros);
      return acc;
    };
    const agrupar = <K extends { id: string; nombre: string }>(
      clave: (f: (typeof filas)[number]) => K,
    ) => {
      const grupos = new Map<string, { grupo: K } & Acumulado>();
      for (const f of filas) {
        const k = clave(f);
        const g = grupos.get(k.id) ?? { grupo: k, ...vacio() };
        grupos.set(k.id, { grupo: k, ...sumar(g, f) });
      }
      return [...grupos.values()].sort((a, b) =>
        a.grupo.nombre.localeCompare(b.grupo.nombre, 'es'),
      );
    };

    return {
      fecha,
      porUbicacion: agrupar((f) => f.ubicacion).map(({ grupo, ...r }) => ({
        ubicacion: grupo,
        ...r,
      })),
      porCategoria: agrupar((f) => f.categoria).map(({ grupo, ...r }) => ({
        categoria: grupo,
        ...r,
      })),
      totales: filas.reduce(sumar, vacio()),
      activos: filas,
    };
  }

  // ─── Categorías (RN-25) ───────────────────────────────────────────────────────

  listarCategorias() {
    return this.prisma.categoriaActivo.findMany({
      include: { _count: { select: { activos: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Cambiar la vida útil por defecto no altera los activos ya registrados. */
  async actualizarCategoria(id: string, dto: ActualizarCategoriaActivoDto) {
    const categoria = await this.prisma.categoriaActivo.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException('La categoría no existe');
    }
    return this.prisma.categoriaActivo.update({ where: { id }, data: dto });
  }
}
