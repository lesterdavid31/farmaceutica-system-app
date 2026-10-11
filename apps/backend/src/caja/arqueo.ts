import { Prisma } from '../generated/prisma/client';
import { MetodoPago, TipoMovimientoCaja } from '../generated/prisma/enums';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Monto = Prisma.Decimal | number | string;

/**
 * Signo de cada tipo de movimiento de caja. El monto se guarda con signo para que el saldo sea una
 * suma directa: entran ventas, cobros contra entrega y depósitos (efectivo que se agrega a la
 * gaveta); salen gastos, retiros y anulaciones.
 */
export const SIGNO_MOVIMIENTO: Record<TipoMovimientoCaja, 1 | -1> = {
  VENTA: 1,
  COBRO_CONTRA_ENTREGA: 1,
  DEPOSITO: 1,
  GASTO: -1,
  RETIRO: -1,
  ANULACION: -1,
};

/** Movimientos que el cajero registra a mano (RF-16); los demás los generan ventas y pedidos. */
export const TIPOS_MANUALES = [
  TipoMovimientoCaja.GASTO,
  TipoMovimientoCaja.RETIRO,
  TipoMovimientoCaja.DEPOSITO,
] as const;
export type TipoManual = (typeof TIPOS_MANUALES)[number];

export function montoConSigno(tipo: TipoMovimientoCaja, monto: Monto): Decimal {
  return new Decimal(monto).abs().mul(SIGNO_MOVIMIENTO[tipo]);
}

export interface MovimientoArqueo {
  tipo: TipoMovimientoCaja;
  metodoPago: MetodoPago;
  /** Con signo, como se guarda en la base. */
  monto: Monto;
}

export interface ResumenCaja {
  montoInicial: Decimal;
  /** Total por tipo de movimiento (con signo), solo en efectivo. */
  efectivoPorTipo: Record<TipoMovimientoCaja, Decimal>;
  /** Total neto por método de pago (ventas menos anulaciones, etc.). */
  porMetodo: Record<MetodoPago, Decimal>;
  ingresosEfectivo: Decimal;
  egresosEfectivo: Decimal;
  /** Monto inicial + entradas de efectivo − salidas de efectivo (RN-12). */
  efectivoEsperado: Decimal;
}

const ceros = <K extends string>(claves: readonly K[]) =>
  Object.fromEntries(claves.map((k) => [k, new Decimal(0)])) as Record<K, Decimal>;

/**
 * Resumen del turno. Solo el efectivo entra en el arqueo: los pagos con tarjeta no están en la
 * gaveta, así que se informan pero no cambian el efectivo esperado.
 */
export function resumirCaja(montoInicial: Monto, movimientos: MovimientoArqueo[]): ResumenCaja {
  const efectivoPorTipo = ceros(Object.values(TipoMovimientoCaja));
  const porMetodo = ceros(Object.values(MetodoPago));
  let ingresosEfectivo = new Decimal(0);
  let egresosEfectivo = new Decimal(0);
  for (const m of movimientos) {
    const monto = new Decimal(m.monto);
    porMetodo[m.metodoPago] = porMetodo[m.metodoPago].add(monto);
    if (m.metodoPago !== MetodoPago.EFECTIVO) {
      continue;
    }
    efectivoPorTipo[m.tipo] = efectivoPorTipo[m.tipo].add(monto);
    // isPositive() es verdadero también para 0; se compara explícitamente.
    if (monto.greaterThan(0)) {
      ingresosEfectivo = ingresosEfectivo.add(monto);
    } else {
      egresosEfectivo = egresosEfectivo.add(monto.abs());
    }
  }
  const inicial = new Decimal(montoInicial);
  return {
    montoInicial: inicial,
    efectivoPorTipo,
    porMetodo,
    ingresosEfectivo,
    egresosEfectivo,
    efectivoEsperado: inicial.add(ingresosEfectivo).sub(egresosEfectivo),
  };
}

/** Diferencia del arqueo (RN-12): positiva es sobrante, negativa es faltante. */
export function diferenciaArqueo(efectivoContado: Monto, efectivoEsperado: Monto): Decimal {
  return new Decimal(efectivoContado).sub(new Decimal(efectivoEsperado));
}

export function tieneMaximoDosDecimales(monto: number) {
  return Number.isFinite(monto) && new Decimal(monto).decimalPlaces() <= 2;
}
