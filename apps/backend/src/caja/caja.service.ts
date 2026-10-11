import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  EstadoTurnoCaja,
  MetodoPago,
  Rol,
  TipoMovimientoCaja,
  TipoUbicacion,
} from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';
import { OPCIONES_TRANSACCION } from '../common/formato';
import { pagina, saltar } from '../common/paginacion';
import { esRolGlobal, UsuarioAutenticado } from '../common/usuario-autenticado';
import { sumarDias } from '../inventario/fefo';
import type { Tx } from '../inventario/motor-inventario.service';
import { PrismaService } from '../prisma/prisma.service';
import { diferenciaArqueo, montoConSigno, resumirCaja, SIGNO_MOVIMIENTO } from './arqueo';
import { AbrirTurnoDto, CerrarTurnoDto, FiltroTurnosDto, MovimientoManualDto } from './caja.dto';

export interface NuevoMovimientoCaja {
  turnoCajaId: string;
  tipo: TipoMovimientoCaja;
  metodoPago: MetodoPago;
  /** Positivo; el signo lo da el tipo. */
  monto: Prisma.Decimal | number;
  referenciaId?: string;
  descripcion?: string;
  usuarioId: string;
}

const usuarioResumen = { select: { id: true, nombre: true } } as const;
const ubicacionResumen = { select: { id: true, codigo: true, nombre: true, tipo: true } } as const;

/**
 * Turnos de caja y movimientos de efectivo (RF-14, RF-16, RF-17, RN-11 a RN-13).
 * Como en traslados, cada operación tiene su versión `...En(tx, ...)` para las pruebas.
 */
@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── API ──────────────────────────────────────────────────────────────────────

  async abrir(dto: AbrirTurnoDto, usuario: UsuarioAutenticado) {
    const id = await this.enTransaccion((tx) => this.abrirEn(tx, dto, usuario));
    return this.obtener(id, usuario);
  }

  async registrarMovimiento(id: string, dto: MovimientoManualDto, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.registrarMovimientoEn(tx, id, dto, usuario));
    return this.obtener(id, usuario);
  }

  async cerrar(id: string, dto: CerrarTurnoDto, usuario: UsuarioAutenticado) {
    await this.enTransaccion((tx) => this.cerrarEn(tx, id, dto, usuario));
    return this.obtener(id, usuario);
  }

  private enTransaccion<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn, OPCIONES_TRANSACCION);
  }

  // ─── Operaciones ──────────────────────────────────────────────────────────────

  /** Abre un turno con monto inicial (RF-14). Un cajero tiene a lo sumo un turno abierto. */
  async abrirEn(tx: Tx, dto: AbrirTurnoDto, usuario: UsuarioAutenticado): Promise<string> {
    if (usuario.rol !== Rol.CAJERO || !usuario.ubicacionId) {
      throw new ForbiddenException('Solo un cajero con ubicación asignada abre turnos de caja');
    }
    const ubicacion = await tx.ubicacion.findUniqueOrThrow({ where: { id: usuario.ubicacionId } });
    if (!ubicacion.activa) {
      throw new ReglaNegocioException(`${ubicacion.nombre} está desactivada`);
    }
    if (ubicacion.tipo === TipoUbicacion.BODEGA_CENTRAL) {
      throw new ReglaNegocioException('La bodega central no vende al público ni tiene caja');
    }
    const abierto = await tx.turnoCaja.findFirst({
      where: { cajeroId: usuario.id, estado: EstadoTurnoCaja.ABIERTO },
    });
    if (abierto) {
      throw new ReglaNegocioException(
        'Ya tiene un turno de caja abierto. Ciérrelo antes de abrir otro.',
      );
    }
    try {
      const turno = await tx.turnoCaja.create({
        data: {
          ubicacionId: ubicacion.id,
          cajeroId: usuario.id,
          montoInicial: dto.montoInicial,
          observaciones: dto.observaciones || null,
        },
      });
      return turno.id;
    } catch (error) {
      // El índice único parcial cubre dos aperturas simultáneas.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReglaNegocioException('Ya tiene un turno de caja abierto');
      }
      throw error;
    }
  }

  /** Gasto, retiro o depósito (RF-16). No se puede sacar más efectivo del que hay en la gaveta. */
  async registrarMovimientoEn(
    tx: Tx,
    id: string,
    dto: MovimientoManualDto,
    usuario: UsuarioAutenticado,
  ) {
    const turno = await this.bloquearTurno(tx, id);
    this.verificarDueno(turno, usuario);
    if (SIGNO_MOVIMIENTO[dto.tipo] < 0) {
      const { efectivoEsperado } = await this.resumen(tx, turno.id, turno.montoInicial);
      if (efectivoEsperado.lessThan(dto.monto)) {
        throw new ReglaNegocioException(
          `En la caja hay Q${efectivoEsperado.toFixed(2)} en efectivo; no puede sacar Q${dto.monto.toFixed(2)}`,
        );
      }
    }
    await this.registrarEn(tx, {
      turnoCajaId: turno.id,
      tipo: dto.tipo,
      metodoPago: MetodoPago.EFECTIVO,
      monto: dto.monto,
      descripcion: dto.descripcion,
      usuarioId: usuario.id,
    });
  }

  /**
   * Cierra con arqueo (RF-17, RN-12): calcula el efectivo esperado con los movimientos del turno
   * y guarda la diferencia con lo contado (positiva = sobrante, negativa = faltante).
   */
  async cerrarEn(tx: Tx, id: string, dto: CerrarTurnoDto, usuario: UsuarioAutenticado) {
    const turno = await this.bloquearTurno(tx, id);
    this.verificarDueno(turno, usuario);
    const { efectivoEsperado } = await this.resumen(tx, turno.id, turno.montoInicial);
    const diferencia = diferenciaArqueo(dto.efectivoContado, efectivoEsperado);
    await tx.turnoCaja.update({
      where: { id: turno.id },
      data: {
        estado: EstadoTurnoCaja.CERRADO,
        cierre: new Date(),
        efectivoEsperado,
        efectivoContado: dto.efectivoContado,
        diferencia,
        observaciones: [turno.observaciones, dto.observaciones].filter(Boolean).join('\n') || null,
      },
    });
  }

  /**
   * Bloquea el turno abierto (SELECT ... FOR UPDATE) hasta el fin de la transacción: así una venta,
   * un movimiento y el cierre del mismo turno no se cruzan, y el arqueo ve todos los movimientos.
   */
  async bloquearTurno(tx: Tx, id: string) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM turno_caja WHERE id = ${id}::uuid FOR UPDATE`;
    if (filas.length === 0) {
      throw new NotFoundException('El turno de caja no existe');
    }
    const turno = await tx.turnoCaja.findUniqueOrThrow({ where: { id } });
    if (turno.estado !== EstadoTurnoCaja.ABIERTO) {
      throw new ReglaNegocioException('El turno de caja ya está cerrado');
    }
    return turno;
  }

  /** Turno abierto del cajero, bloqueado. RN-11: sin turno abierto no se vende. */
  async turnoAbiertoDe(tx: Tx, usuario: UsuarioAutenticado) {
    const abierto = await tx.turnoCaja.findFirst({
      where: { cajeroId: usuario.id, estado: EstadoTurnoCaja.ABIERTO },
      select: { id: true },
    });
    if (!abierto) {
      throw new ReglaNegocioException('Abra un turno de caja antes de vender');
    }
    return this.bloquearTurno(tx, abierto.id);
  }

  /** Registra un movimiento inmutable (RN-13) con el signo que corresponde a su tipo. */
  registrarEn(tx: Tx, m: NuevoMovimientoCaja) {
    return tx.movimientoCaja.create({
      data: {
        turnoCajaId: m.turnoCajaId,
        tipo: m.tipo,
        metodoPago: m.metodoPago,
        monto: montoConSigno(m.tipo, m.monto),
        referenciaId: m.referenciaId,
        descripcion: m.descripcion,
        usuarioId: m.usuarioId,
      },
    });
  }

  async resumen(db: Tx, turnoId: string, montoInicial: Prisma.Decimal) {
    const movimientos = await db.movimientoCaja.findMany({
      where: { turnoCajaId: turnoId },
      select: { tipo: true, metodoPago: true, monto: true },
    });
    return resumirCaja(montoInicial, movimientos);
  }

  private verificarDueno(turno: { cajeroId: string }, usuario: UsuarioAutenticado) {
    if (turno.cajeroId !== usuario.id) {
      throw new ForbiddenException('Solo el cajero que abrió el turno puede operarlo');
    }
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  /** Turno abierto del cajero actual con su resumen, o `null`. */
  async actual(usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { cajeroId: usuario.id, estado: EstadoTurnoCaja.ABIERTO },
      select: { id: true },
    });
    return turno ? this.obtener(turno.id, usuario) : null;
  }

  async listar(filtro: FiltroTurnosDto, usuario: UsuarioAutenticado) {
    const alcance: Prisma.TurnoCajaWhereInput = esRolGlobal(usuario.rol)
      ? { ...(filtro.ubicacionId && { ubicacionId: filtro.ubicacionId }) }
      : usuario.rol === Rol.CAJERO
        ? { cajeroId: usuario.id }
        : { ubicacionId: usuario.ubicacionId! };
    const where: Prisma.TurnoCajaWhereInput = {
      ...alcance,
      ...(filtro.estado && { estado: filtro.estado }),
      ...(filtro.cajeroId && usuario.rol !== Rol.CAJERO && { cajeroId: filtro.cajeroId }),
      ...(filtro.conDiferencia && {
        estado: EstadoTurnoCaja.CERRADO,
        diferencia: { not: 0 },
      }),
      ...((filtro.desde || filtro.hasta) && {
        apertura: {
          ...(filtro.desde && { gte: new Date(filtro.desde) }),
          ...(filtro.hasta && { lt: sumarDias(new Date(filtro.hasta), 1) }),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.turnoCaja.findMany({
        where,
        include: {
          ubicacion: ubicacionResumen,
          cajero: usuarioResumen,
          _count: { select: { ventas: true } },
        },
        orderBy: { apertura: 'desc' },
        ...saltar(filtro),
      }),
      this.prisma.turnoCaja.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  /** Detalle con movimientos y resumen; si está abierto, el esperado se calcula al momento. */
  async obtener(id: string, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turnoCaja.findUnique({
      where: { id },
      include: {
        ubicacion: ubicacionResumen,
        cajero: usuarioResumen,
        movimientos: { include: { usuario: usuarioResumen }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!turno) {
      throw new NotFoundException('El turno de caja no existe');
    }
    const propio = turno.cajeroId === usuario.id;
    const deSuUbicacion = usuario.rol === Rol.GERENTE && turno.ubicacionId === usuario.ubicacionId;
    if (!esRolGlobal(usuario.rol) && !propio && !deSuUbicacion) {
      throw new ForbiddenException('Solo puede ver los turnos de caja de su ubicación');
    }
    const resumen = resumirCaja(turno.montoInicial, turno.movimientos);
    const ventas = await this.prisma.venta.groupBy({
      by: ['estado'],
      where: { turnoCajaId: id },
      _count: true,
      _sum: { total: true },
    });
    return {
      ...turno,
      resumen,
      ventas: ventas.map((v) => ({ estado: v.estado, cantidad: v._count, total: v._sum.total })),
      puedeOperar: propio && turno.estado === EstadoTurnoCaja.ABIERTO,
    };
  }
}
