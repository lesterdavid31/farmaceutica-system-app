import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TipoMovimientoInventario } from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';
import { asignarFefo, estaVencido, hoyGuatemala } from './fefo';

/** Cliente de una transacción interactiva de Prisma. */
export type Tx = Prisma.TransactionClient;

interface Contexto {
  usuarioId: string;
  referenciaTipo?: string;
  referenciaId?: string;
  motivo?: string;
  /** Fecha del movimiento; por defecto ahora. Solo el seed usa fechas pasadas. */
  fecha?: Date;
}

export interface Ingreso extends Contexto {
  ubicacionId: string;
  loteId: string;
  cantidad: number;
  tipo: TipoMovimientoInventario;
  /** Costo del movimiento; por defecto el costo del lote. */
  costoUnitario?: Prisma.Decimal | number;
}

export interface SalidaLote extends Contexto {
  ubicacionId: string;
  loteId: string;
  cantidad: number;
  tipo: TipoMovimientoInventario;
  /** Las bajas por vencimiento y los ajustes sí pueden mover lotes vencidos. */
  permitirVencido?: boolean;
}

export interface SalidaFefo extends Contexto {
  ubicacionId: string;
  productoId: string;
  cantidad: number;
  tipo: TipoMovimientoInventario;
}

export interface LoteAsignado {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: Date;
  cantidad: number;
  costoUnitario: Prisma.Decimal;
}

interface FilaExistencia {
  lote_id: string;
  cantidad: number;
  numero_lote: string;
  fecha_vencimiento: Date;
  costo_unitario: Prisma.Decimal;
  lote_creado: Date;
}

/**
 * Operaciones atómicas sobre la existencia. Todas reciben la transacción del llamador para que
 * el cambio de existencia y su movimiento en el kardex se confirmen o reviertan juntos (RN-06).
 * Las reglas de negocio de cada flujo (ventas, traslados, compras) viven en sus servicios.
 */
@Injectable()
export class MotorInventarioService {
  /** Suma unidades de un lote en una ubicación y registra el movimiento. */
  async ingresar(tx: Tx, ingreso: Ingreso) {
    this.validarCantidad(ingreso.cantidad);
    const lote = await tx.lote.findUniqueOrThrow({ where: { id: ingreso.loteId } });
    await tx.existencia.upsert({
      where: { ubicacionId_loteId: { ubicacionId: ingreso.ubicacionId, loteId: ingreso.loteId } },
      update: { cantidad: { increment: ingreso.cantidad } },
      create: {
        ubicacionId: ingreso.ubicacionId,
        loteId: ingreso.loteId,
        cantidad: ingreso.cantidad,
      },
    });
    return this.movimiento(tx, {
      ...ingreso,
      cantidad: ingreso.cantidad,
      costoUnitario: ingreso.costoUnitario ?? lote.costoUnitario,
    });
  }

  /**
   * Resta unidades de un lote específico. La resta es condicional (`cantidad >= x`), así que dos
   * operaciones simultáneas nunca pueden dejar la existencia en negativo (RN-01).
   */
  async descontarLote(tx: Tx, salida: SalidaLote) {
    this.validarCantidad(salida.cantidad);
    const lote = await tx.lote.findUniqueOrThrow({
      where: { id: salida.loteId },
      include: { producto: { select: { nombre: true } } },
    });
    if (!salida.permitirVencido && estaVencido(lote.fechaVencimiento, hoyGuatemala())) {
      throw new ReglaNegocioException(
        `El lote ${lote.numeroLote} de ${lote.producto.nombre} está vencido y no se puede usar`,
      );
    }
    const { count } = await tx.existencia.updateMany({
      where: {
        ubicacionId: salida.ubicacionId,
        loteId: salida.loteId,
        cantidad: { gte: salida.cantidad },
      },
      data: { cantidad: { decrement: salida.cantidad } },
    });
    if (count === 0) {
      const actual = await tx.existencia.findUnique({
        where: { ubicacionId_loteId: { ubicacionId: salida.ubicacionId, loteId: salida.loteId } },
      });
      const hay = actual?.cantidad ?? 0;
      throw new ReglaNegocioException(
        `No hay existencia suficiente: el lote ${lote.numeroLote} de ${lote.producto.nombre} tiene ${hay} ${hay === 1 ? 'unidad' : 'unidades'} en esta ubicación`,
        { disponible: hay, requerida: salida.cantidad },
      );
    }
    return this.movimiento(tx, {
      ...salida,
      cantidad: -salida.cantidad,
      costoUnitario: lote.costoUnitario,
    });
  }

  /**
   * Descuenta por FEFO (RN-02): el sistema elige los lotes, empezando por el que vence primero y
   * sin tocar los vencidos (RN-03). Bloquea las filas de existencia del producto en la ubicación
   * (SELECT ... FOR UPDATE) hasta que termine la transacción, para evitar ventas simultáneas
   * del mismo stock.
   */
  async descontarFefo(tx: Tx, salida: SalidaFefo): Promise<LoteAsignado[]> {
    const producto = await tx.producto.findUniqueOrThrow({
      where: { id: salida.productoId },
      select: { nombre: true },
    });
    const filas = await tx.$queryRaw<FilaExistencia[]>`
      SELECT e.lote_id, e.cantidad, l.numero_lote, l.fecha_vencimiento, l.costo_unitario,
             l.created_at AS lote_creado
      FROM existencia e
      JOIN lote l ON l.id = e.lote_id
      WHERE e.ubicacion_id = ${salida.ubicacionId}::uuid
        AND l.producto_id = ${salida.productoId}::uuid
        AND e.cantidad > 0
      FOR UPDATE OF e`;

    const asignaciones = asignarFefo(
      filas.map((f) => ({
        loteId: f.lote_id,
        numeroLote: f.numero_lote,
        fechaVencimiento: f.fecha_vencimiento,
        cantidad: f.cantidad,
        creadoEn: f.lote_creado,
      })),
      salida.cantidad,
      hoyGuatemala(),
      producto.nombre,
    );

    const resultado: LoteAsignado[] = [];
    for (const a of asignaciones) {
      await this.descontarLote(tx, { ...salida, loteId: a.loteId, cantidad: a.cantidad });
      resultado.push({
        ...a,
        costoUnitario: filas.find((f) => f.lote_id === a.loteId)!.costo_unitario,
      });
    }
    return resultado;
  }

  /**
   * Unidades vigentes (no vencidas) por producto en una ubicación, sin bloquear filas. Sirve para
   * avisar de todos los faltantes juntos antes de descontar; el descuento vuelve a verificar.
   */
  async vigentePorProducto(
    db: Tx,
    ubicacionId: string,
    productoIds: string[],
  ): Promise<Map<string, number>> {
    if (productoIds.length === 0) {
      return new Map();
    }
    const filas = await db.$queryRaw<{ producto_id: string; cantidad: number }[]>`
      SELECT l.producto_id, SUM(e.cantidad)::int AS cantidad
      FROM existencia e
      JOIN lote l ON l.id = e.lote_id
      WHERE e.ubicacion_id = ${ubicacionId}::uuid
        AND l.producto_id IN (${Prisma.join(productoIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND l.fecha_vencimiento >= ${hoyGuatemala()}::date
      GROUP BY l.producto_id`;
    return new Map(filas.map((f) => [f.producto_id, f.cantidad]));
  }

  private movimiento(
    tx: Tx,
    datos: (Ingreso | SalidaLote) & { cantidad: number; costoUnitario: Prisma.Decimal | number },
  ) {
    return tx.movimientoInventario.create({
      data: {
        tipo: datos.tipo,
        ubicacionId: datos.ubicacionId,
        loteId: datos.loteId,
        cantidad: datos.cantidad,
        costoUnitario: datos.costoUnitario,
        referenciaTipo: datos.referenciaTipo,
        referenciaId: datos.referenciaId,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
        ...(datos.fecha && { createdAt: datos.fecha }),
      },
    });
  }

  private validarCantidad(cantidad: number) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new ReglaNegocioException('La cantidad debe ser un número entero mayor que cero');
    }
  }
}
