import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { EstadoPlanilla } from '../generated/prisma/enums';
import { resolverUbicacion, verificarAccesoUbicacion } from '../common/alcance';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { UsuarioAutenticado } from '../common/usuario-autenticado';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { hoyGuatemala } from '../inventario/fefo';
import type { Tx } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import { calcularLinea, erroresLinea, finDeMes, totalPlanilla } from './calculo-planilla';
import {
  EditarLineaDto,
  FiltroPlanillasDto,
  GenerarPlanillaDto,
  ReportePlanillaDto,
} from './planilla.dto';

const Decimal = Prisma.Decimal;
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const nombreMes = (mes: number, anio: number) => `${MESES[mes - 1]} de ${anio}`;

/**
 * Planilla mensual por ubicación (RF-27, RF-28, RN-22, RN-23). Se genera a partir de los
 * empleados activos, se editan bonificaciones y descuentos en borrador y se cierra. Una planilla
 * cerrada no se modifica: lo impide el servicio y también un trigger en la base de datos.
 */
@Injectable()
export class PlanillasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async generar(dto: GenerarPlanillaDto, usuario: UsuarioAutenticado) {
    const id = await this.prisma.$transaction(
      (tx) => this.generarEn(tx, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(id, usuario);
  }

  /**
   * Una línea por empleado activo de la ubicación que ya había ingresado al terminar el mes. La
   * bonificación y el porcentaje de IGSS salen de la configuración vigente (RF-03).
   */
  async generarEn(tx: Tx, dto: GenerarPlanillaDto, usuario: UsuarioAutenticado): Promise<string> {
    verificarAccesoUbicacion(usuario, dto.ubicacionId);
    const hoy = hoyGuatemala();
    if (dto.anio * 12 + dto.mes > hoy.getUTCFullYear() * 12 + hoy.getUTCMonth() + 1) {
      throw new ReglaNegocioException('No se puede generar la planilla de un mes futuro');
    }
    const ubicacion = await tx.ubicacion.findUnique({ where: { id: dto.ubicacionId } });
    if (!ubicacion?.activa) {
      throw new ReglaNegocioException('La ubicación no existe o está desactivada');
    }
    const existente = await tx.planilla.findUnique({
      where: {
        ubicacionId_anio_mes: { ubicacionId: dto.ubicacionId, anio: dto.anio, mes: dto.mes },
      },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe la planilla de ${nombreMes(dto.mes, dto.anio)} de ${ubicacion.nombre}`,
      );
    }
    const empleados = await tx.empleado.findMany({
      where: {
        ubicacionId: dto.ubicacionId,
        activo: true,
        fechaIngreso: { lte: finDeMes(dto.anio, dto.mes) },
      },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    });
    if (empleados.length === 0) {
      throw new ReglaNegocioException(
        `${ubicacion.nombre} no tiene empleados activos para ${nombreMes(dto.mes, dto.anio)}`,
      );
    }
    const bonificacion = await this.configuracion.obtener('BONIFICACION_INCENTIVO');
    const porcentajeIgss = await this.configuracion.obtener('PORCENTAJE_IGSS_LABORAL');
    const lineas = empleados.map((e) => ({
      empleadoId: e.id,
      ...calcularLinea({
        salarioBase: e.salarioBase,
        bonificacion,
        porcentajeIgss,
        otrosDescuentos: 0,
      }),
    }));
    const planilla = await tx.planilla.create({
      data: {
        ubicacionId: dto.ubicacionId,
        anio: dto.anio,
        mes: dto.mes,
        total: totalPlanilla(lineas),
        detalles: { create: lineas },
      },
    });
    return planilla.id;
  }

  async editarLinea(
    planillaId: string,
    detalleId: string,
    dto: EditarLineaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(
      (tx) => this.editarLineaEn(tx, planillaId, detalleId, dto, usuario),
      OPCIONES_TRANSACCION,
    );
    return this.obtener(planillaId, usuario);
  }

  /** Edita bonificación y otros descuentos de una línea en borrador y recalcula el total. */
  async editarLineaEn(
    tx: Tx,
    planillaId: string,
    detalleId: string,
    dto: EditarLineaDto,
    usuario: UsuarioAutenticado,
  ) {
    const planilla = await this.borrador(tx, planillaId, usuario);
    const linea = await tx.detallePlanilla.findFirst({
      where: { id: detalleId, planillaId },
      include: { empleado: { select: { nombres: true, apellidos: true } } },
    });
    if (!linea) {
      throw new NotFoundException('La línea no pertenece a la planilla');
    }
    // El IGSS depende solo del salario base, así que se conserva el calculado al generar.
    const bonificacion = new Decimal(dto.bonificacion ?? linea.bonificacion);
    const otrosDescuentos = new Decimal(dto.otrosDescuentos ?? linea.otrosDescuentos);
    const nueva = {
      salarioBase: linea.salarioBase,
      bonificacion,
      igss: linea.igss,
      otrosDescuentos,
      liquido: linea.salarioBase.add(bonificacion).sub(linea.igss).sub(otrosDescuentos),
    };
    const errores = erroresLinea(nueva, `${linea.empleado.nombres} ${linea.empleado.apellidos}`);
    if (errores.length > 0) {
      throw new ReglaNegocioException(errores[0], errores);
    }
    await tx.detallePlanilla.update({
      where: { id: detalleId },
      data: {
        bonificacion: nueva.bonificacion,
        otrosDescuentos: nueva.otrosDescuentos,
        liquido: nueva.liquido,
      },
    });
    await this.actualizarTotal(tx, planilla.id);
  }

  async cerrar(id: string, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction((tx) => this.cerrarEn(tx, id, usuario), OPCIONES_TRANSACCION);
    return this.obtener(id, usuario);
  }

  /** RN-23: al cerrar, el total queda fijo y la planilla ya no se modifica. */
  async cerrarEn(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    await this.borrador(tx, id, usuario);
    const total = await this.actualizarTotal(tx, id);
    const { count } = await tx.planilla.updateMany({
      where: { id, estado: EstadoPlanilla.BORRADOR },
      data: {
        estado: EstadoPlanilla.CERRADA,
        total,
        fechaCierre: new Date(),
        cerradaPorId: usuario.id,
      },
    });
    if (count === 0) {
      throw new ReglaNegocioException('La planilla ya está cerrada');
    }
  }

  /** Elimina un borrador para volver a generarlo (por ejemplo, si cambió un salario). */
  async eliminar(id: string, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction(async (tx) => {
      await this.borrador(tx, id, usuario);
      await tx.detallePlanilla.deleteMany({ where: { planillaId: id } });
      await tx.planilla.delete({ where: { id } });
    }, OPCIONES_TRANSACCION);
    return { id };
  }

  private async borrador(tx: Tx, id: string, usuario: UsuarioAutenticado) {
    // Se bloquea la fila para que una edición y el cierre no se crucen.
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM planilla WHERE id = ${id}::uuid FOR UPDATE`;
    if (filas.length === 0) {
      throw new NotFoundException('La planilla no existe');
    }
    const planilla = await tx.planilla.findUniqueOrThrow({ where: { id } });
    verificarAccesoUbicacion(usuario, planilla.ubicacionId);
    if (planilla.estado === EstadoPlanilla.CERRADA) {
      throw new ReglaNegocioException(
        `La planilla de ${nombreMes(planilla.mes, planilla.anio)} está cerrada y no se puede modificar`,
      );
    }
    return planilla;
  }

  private async actualizarTotal(tx: Tx, id: string) {
    const lineas = await tx.detallePlanilla.findMany({
      where: { planillaId: id },
      select: { liquido: true },
    });
    const total = totalPlanilla(lineas);
    await tx.planilla.update({ where: { id }, data: { total } });
    return total;
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  async listar(filtro: FiltroPlanillasDto, usuario: UsuarioAutenticado) {
    const ubicacionId = resolverUbicacion(usuario, filtro.ubicacionId);
    const where: Prisma.PlanillaWhereInput = {
      ...(ubicacionId && { ubicacionId }),
      ...(filtro.anio && { anio: filtro.anio }),
      ...(filtro.estado && { estado: filtro.estado }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.planilla.findMany({
        where,
        include: {
          ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
          cerradaPor: { select: { id: true, nombre: true } },
          _count: { select: { detalles: true } },
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { ubicacion: { nombre: 'asc' } }],
        ...saltar(filtro),
      }),
      this.prisma.planilla.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const planilla = await this.prisma.planilla.findUnique({
      where: { id },
      include: {
        ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
        cerradaPor: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            empleado: {
              select: { id: true, nombres: true, apellidos: true, dpi: true, puesto: true },
            },
          },
          orderBy: [{ empleado: { apellidos: 'asc' } }, { empleado: { nombres: 'asc' } }],
        },
      },
    });
    if (!planilla) {
      throw new NotFoundException('La planilla no existe');
    }
    verificarAccesoUbicacion(usuario, planilla.ubicacionId);
    const suma = (campo: 'salarioBase' | 'bonificacion' | 'igss' | 'otrosDescuentos' | 'liquido') =>
      planilla.detalles.reduce((s, d) => s.add(d[campo]), new Decimal(0));
    return {
      ...planilla,
      totales: {
        salarioBase: suma('salarioBase'),
        bonificacion: suma('bonificacion'),
        igss: suma('igss'),
        otrosDescuentos: suma('otrosDescuentos'),
        liquido: suma('liquido'),
      },
    };
  }

  /**
   * RF-28: gasto en planilla por mes y por ubicación, con el consolidado. Solo cuentan las
   * planillas cerradas; los borradores se informan aparte porque todavía pueden cambiar.
   */
  async reporte(dto: ReportePlanillaDto, usuario: UsuarioAutenticado, db: Tx = this.prisma) {
    const ubicacionId = resolverUbicacion(usuario, dto.ubicacionId);
    const planillas = await db.planilla.findMany({
      where: { anio: dto.anio, ...(ubicacionId && { ubicacionId }) },
      include: {
        ubicacion: { select: { id: true, codigo: true, nombre: true, tipo: true } },
        _count: { select: { detalles: true } },
      },
    });
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const porUbicacion = new Map<
      string,
      {
        ubicacion: (typeof planillas)[number]['ubicacion'];
        meses: Record<
          number,
          { id: string; total: string; estado: EstadoPlanilla; empleados: number }
        >;
        total: Prisma.Decimal;
      }
    >();
    const consolidado = Object.fromEntries(meses.map((m) => [m, new Decimal(0)])) as Record<
      number,
      Prisma.Decimal
    >;
    for (const p of planillas) {
      const fila = porUbicacion.get(p.ubicacionId) ?? {
        ubicacion: p.ubicacion,
        meses: {},
        total: new Decimal(0),
      };
      fila.meses[p.mes] = {
        id: p.id,
        total: p.total.toFixed(2),
        estado: p.estado,
        empleados: p._count.detalles,
      };
      if (p.estado === EstadoPlanilla.CERRADA) {
        fila.total = fila.total.add(p.total);
        consolidado[p.mes] = consolidado[p.mes].add(p.total);
      }
      porUbicacion.set(p.ubicacionId, fila);
    }
    const ubicaciones = [...porUbicacion.values()].sort((a, b) =>
      a.ubicacion.nombre.localeCompare(b.ubicacion.nombre, 'es'),
    );
    return {
      anio: dto.anio,
      ubicaciones,
      consolidado,
      total: Object.values(consolidado).reduce((s, x) => s.add(x), new Decimal(0)),
      borradores: planillas.filter((p) => p.estado === EstadoPlanilla.BORRADOR).length,
    };
  }
}
