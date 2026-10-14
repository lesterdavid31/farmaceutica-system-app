import { Prisma } from '../generated/prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Monto = Prisma.Decimal | number | string;

export interface DatosActivo {
  costo: Monto;
  valorResidual: Monto;
  vidaUtilMeses: number;
  /** Fecha DATE (medianoche UTC). */
  fechaAdquisicion: Date;
}

export interface Depreciacion {
  /** Meses completos desde la adquisición hasta la fecha de corte (0 si aún no se adquiría). */
  mesesTranscurridos: number;
  /** Meses que efectivamente se deprecian: no pasan de la vida útil. */
  mesesDepreciados: number;
  depreciacionMensual: Decimal;
  depreciacionAcumulada: Decimal;
  valorEnLibros: Decimal;
  totalmenteDepreciado: boolean;
}

/**
 * Meses completos entre dos fechas (en UTC). Un mes se completa el mismo día del mes siguiente;
 * si ese día no existe (por ejemplo, 31), se completa el último día del mes.
 */
export function mesesCompletos(desde: Date, hasta: Date): number {
  if (hasta < desde) {
    return 0;
  }
  let meses =
    (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 +
    (hasta.getUTCMonth() - desde.getUTCMonth());
  const ultimoDiaHasta = new Date(
    Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const diaRequerido = Math.min(desde.getUTCDate(), ultimoDiaHasta);
  if (hasta.getUTCDate() < diaRequerido) {
    meses -= 1;
  }
  return Math.max(0, meses);
}

/**
 * RN-24: depreciación lineal mensual = (costo − valor residual) / vida útil en meses. La
 * acumulada se calcula como (costo − residual) × meses / vida útil y se redondea al centavo, así
 * que al terminar la vida útil el valor en libros es exactamente el valor residual.
 */
export function calcularDepreciacion(activo: DatosActivo, fechaCorte: Date): Depreciacion {
  const costo = new Decimal(activo.costo);
  const residual = new Decimal(activo.valorResidual);
  const depreciable = costo.sub(residual);
  const vida = activo.vidaUtilMeses;
  const mesesTranscurridos = mesesCompletos(activo.fechaAdquisicion, fechaCorte);
  const mesesDepreciados = Math.min(mesesTranscurridos, vida);
  const depreciacionAcumulada = depreciable
    .mul(mesesDepreciados)
    .div(vida)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    mesesTranscurridos,
    mesesDepreciados,
    depreciacionMensual: depreciable.div(vida).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    depreciacionAcumulada,
    valorEnLibros: costo.sub(depreciacionAcumulada),
    totalmenteDepreciado: mesesDepreciados >= vida,
  };
}

/** Fecha en la que el activo queda totalmente depreciado. */
export function fechaFinVidaUtil(activo: Pick<DatosActivo, 'fechaAdquisicion' | 'vidaUtilMeses'>) {
  const f = activo.fechaAdquisicion;
  const anio = f.getUTCFullYear();
  const mes = f.getUTCMonth() + activo.vidaUtilMeses;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(f.getUTCDate(), ultimoDia)));
}
