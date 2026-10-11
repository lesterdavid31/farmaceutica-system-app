import { ReglaNegocioException } from '../common/errores';

/** Zona horaria de operación: la fecha de "hoy" para vencimientos es la de Guatemala. */
export const ZONA_HORARIA = 'America/Guatemala';

/** Fecha de hoy en Guatemala como medianoche UTC, comparable con las columnas DATE. */
export function hoyGuatemala(ahora: Date = new Date()): Date {
  const texto = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  return new Date(`${texto}T00:00:00.000Z`);
}

export function sumarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

/** Días enteros entre `hoy` y `fecha` (negativo si ya pasó). */
export function diasHasta(fecha: Date, hoy: Date): number {
  return Math.round((fecha.getTime() - hoy.getTime()) / 86_400_000);
}

export type Vigencia = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

/**
 * Un lote se puede usar hasta su fecha de vencimiento inclusive; desde el día siguiente está
 * vencido (RN-03). Está "por vencer" si vence dentro de `diasAlerta` días (RN-04).
 */
export function vigenciaDe(fechaVencimiento: Date, hoy: Date, diasAlerta: number): Vigencia {
  const dias = diasHasta(fechaVencimiento, hoy);
  if (dias < 0) {
    return 'VENCIDO';
  }
  return dias <= diasAlerta ? 'POR_VENCER' : 'VIGENTE';
}

export function estaVencido(fechaVencimiento: Date, hoy: Date) {
  return fechaVencimiento.getTime() < hoy.getTime();
}

export interface LoteDisponible {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: Date;
  cantidad: number;
  /** Desempate estable cuando dos lotes vencen el mismo día. */
  creadoEn?: Date;
}

export interface Asignacion {
  loteId: string;
  numeroLote: string;
  fechaVencimiento: Date;
  cantidad: number;
}

/**
 * FEFO (RN-02): asigna la cantidad requerida empezando por el lote que vence primero.
 * Ignora los lotes vencidos (RN-03) y los que no tienen existencia. Si no alcanza, lanza una
 * regla de negocio con las unidades vigentes disponibles; nunca deja cantidades negativas (RN-01).
 */
export function asignarFefo(
  lotes: readonly LoteDisponible[],
  requerida: number,
  hoy: Date,
  nombreProducto: string,
): Asignacion[] {
  if (!Number.isInteger(requerida) || requerida <= 0) {
    throw new ReglaNegocioException('La cantidad debe ser un número entero mayor que cero');
  }
  const vigentes = lotes
    .filter((l) => l.cantidad > 0 && !estaVencido(l.fechaVencimiento, hoy))
    .sort(
      (a, b) =>
        a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime() ||
        (a.creadoEn?.getTime() ?? 0) - (b.creadoEn?.getTime() ?? 0) ||
        a.numeroLote.localeCompare(b.numeroLote),
    );

  const disponible = vigentes.reduce((total, l) => total + l.cantidad, 0);
  if (disponible < requerida) {
    throw new ReglaNegocioException(
      disponible === 0
        ? `No hay existencia vigente de ${nombreProducto}`
        : `No hay existencia suficiente: ${disponible === 1 ? 'queda 1 unidad vigente' : `quedan ${disponible} unidades vigentes`} de ${nombreProducto}`,
      { disponible, requerida },
    );
  }

  const asignaciones: Asignacion[] = [];
  let pendiente = requerida;
  for (const lote of vigentes) {
    if (pendiente === 0) {
      break;
    }
    const tomar = Math.min(lote.cantidad, pendiente);
    asignaciones.push({
      loteId: lote.loteId,
      numeroLote: lote.numeroLote,
      fechaVencimiento: lote.fechaVencimiento,
      cantidad: tomar,
    });
    pendiente -= tomar;
  }
  return asignaciones;
}
