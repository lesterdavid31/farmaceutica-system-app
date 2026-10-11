import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { pagina, saltar } from '../common/paginacion';
import { PrismaService } from '../prisma/prisma.service';
import { FiltroBitacoraDto } from './bitacora.dto';
import { sanitizar } from './sanitizar';

export interface RegistroBitacora {
  usuarioId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  datosAntes?: unknown;
  datosDespues?: unknown;
  ip?: string | null;
}

type ClienteTransaccion = Prisma.TransactionClient | PrismaService;

function aJson(valor: unknown) {
  const limpio = sanitizar(valor);
  return limpio === null ? Prisma.DbNull : (limpio as Prisma.InputJsonValue);
}

@Injectable()
export class BitacoraService {
  private readonly logger = new Logger(BitacoraService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda un registro en la bitácora. Puede recibir el cliente de una transacción para que
   * el registro se confirme o se revierta junto con la operación auditada.
   */
  async registrar(registro: RegistroBitacora, cliente: ClienteTransaccion = this.prisma) {
    await cliente.bitacora.create({
      data: {
        usuarioId: registro.usuarioId ?? null,
        accion: registro.accion,
        entidad: registro.entidad,
        entidadId: registro.entidadId ?? null,
        datosAntes: aJson(registro.datosAntes),
        datosDespues: aJson(registro.datosDespues),
        ip: registro.ip?.slice(0, 60) ?? null,
      },
    });
  }

  /** Igual que `registrar`, pero un fallo no interrumpe la operación principal (solo se registra en logs). */
  async registrarSinFallar(registro: RegistroBitacora) {
    try {
      await this.registrar(registro);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar en la bitácora ${registro.accion} ${registro.entidad}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async listar(filtro: FiltroBitacoraDto) {
    const where: Prisma.BitacoraWhereInput = {
      ...(filtro.usuarioId && { usuarioId: filtro.usuarioId }),
      ...(filtro.entidad && { entidad: filtro.entidad }),
      ...(filtro.accion && { accion: filtro.accion }),
      ...(filtro.entidadId && { entidadId: filtro.entidadId }),
      ...((filtro.desde || filtro.hasta) && {
        createdAt: {
          ...(filtro.desde && { gte: new Date(filtro.desde) }),
          ...(filtro.hasta && { lt: finDelDia(filtro.hasta) }),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bitacora.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } },
        ...saltar(filtro),
      }),
      this.prisma.bitacora.count({ where }),
    ]);
    return pagina(data, total, filtro);
  }

  /** Valores distintos de entidad y acción, para los filtros de la pantalla. */
  async catalogos() {
    const [entidades, acciones] = await Promise.all([
      this.prisma.bitacora.findMany({ distinct: ['entidad'], select: { entidad: true } }),
      this.prisma.bitacora.findMany({ distinct: ['accion'], select: { accion: true } }),
    ]);
    return {
      entidades: entidades.map((e) => e.entidad).sort(),
      acciones: acciones.map((a) => a.accion).sort(),
    };
  }
}

/** `hasta` es inclusivo: se consulta hasta el inicio del día siguiente. */
function finDelDia(fecha: string) {
  const fin = new Date(fecha);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return fin;
}
