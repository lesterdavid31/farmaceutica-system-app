import { Prisma } from '../generated/prisma/client';
import { MetodoPago } from '../generated/prisma/enums';
import { ReglaNegocioException } from '../common/errores';

const Decimal = Prisma.Decimal;

/** Métodos de pago del mostrador; CONTRA_ENTREGA es solo para pedidos de call center (3.3). */
export const METODOS_MOSTRADOR = [MetodoPago.EFECTIVO, MetodoPago.TARJETA] as const;

export interface PagoSolicitado {
  metodo: MetodoPago;
  monto: number;
  referencia?: string;
}

/**
 * Normaliza el NIT del cliente: "CF" (consumidor final) si viene vacío; si no, sin espacios ni
 * guiones y en mayúsculas. Acepta dígitos con un verificador final que puede ser K.
 */
export function normalizarNit(nit?: string | null): string {
  const limpio = (nit ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (limpio === '' || limpio === 'CF' || limpio === 'C/F') {
    return 'CF';
  }
  if (!/^\d{1,12}[\dK]$/.test(limpio)) {
    throw new ReglaNegocioException(
      'El NIT debe tener solo dígitos y un verificador (puede ser K), o "CF" para consumidor final',
    );
  }
  return limpio;
}

/**
 * Valida los pagos de una venta de mostrador (RF-15): uno o varios métodos cuya suma es
 * exactamente el total. El cambio del efectivo lo calcula la pantalla; aquí se registra solo lo
 * que se aplica a la venta. Un método no se repite.
 */
export function validarPagos(total: Prisma.Decimal, pagos: PagoSolicitado[]) {
  const errores: string[] = [];
  const metodos = new Set<MetodoPago>();
  for (const p of pagos) {
    if (!(METODOS_MOSTRADOR as readonly MetodoPago[]).includes(p.metodo)) {
      errores.push('En mostrador solo se cobra en efectivo o con tarjeta');
    }
    if (metodos.has(p.metodo)) {
      errores.push('Cada método de pago se indica una sola vez');
    }
    metodos.add(p.metodo);
    // Defensa además del DTO: un pago de Q0 o negativo no tiene sentido (y la base lo rechaza).
    const monto = new Decimal(p.monto);
    if (!monto.greaterThan(0) || monto.decimalPlaces() > 2) {
      errores.push('Cada pago debe ser mayor que cero y tener máximo 2 decimales');
    }
  }
  const suma = pagos.reduce((s, p) => s.add(new Decimal(p.monto)), new Decimal(0));
  if (!suma.equals(total)) {
    errores.push(
      `Los pagos suman Q${suma.toFixed(2)} y el total de la venta es Q${total.toFixed(2)}`,
    );
  }
  if (errores.length > 0) {
    throw new ReglaNegocioException('Revise los pagos', [...new Set(errores)]);
  }
}
