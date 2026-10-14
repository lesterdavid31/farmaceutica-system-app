import { hoyGuatemala, sumarDias } from '../inventario/fefo';

/** Guatemala está en UTC−6 todo el año (no tiene horario de verano). */
const DESFASE_MS = 6 * 3_600_000;

/** Instante (UTC) en que empieza en Guatemala el día de una fecha DATE (medianoche UTC). */
export function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getTime() + DESFASE_MS);
}

const fechaDe = (texto: string) => new Date(`${texto.slice(0, 10)}T00:00:00.000Z`);

/**
 * Rango de un reporte en instantes UTC: desde el inicio del día `desde` hasta el inicio del día
 * siguiente a `hasta` (exclusivo), según la hora de Guatemala. Por defecto, el mes en curso.
 */
export function rangoDeFechas(desde?: string, hasta?: string) {
  const hoy = hoyGuatemala();
  const d = desde ? fechaDe(desde) : new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const h = hasta ? fechaDe(hasta) : hoy;
  return { desde: d, hasta: h, inicio: inicioDelDia(d), fin: inicioDelDia(sumarDias(h, 1)) };
}

/** Inicios de hoy, del mes y del año en curso (Guatemala). */
export function periodosActuales(ahora = new Date()) {
  const hoy = hoyGuatemala(ahora);
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth();
  return {
    hoy,
    anio,
    mes: mes + 1,
    inicioHoy: inicioDelDia(hoy),
    inicioMes: inicioDelDia(new Date(Date.UTC(anio, mes, 1))),
    inicioAnio: inicioDelDia(new Date(Date.UTC(anio, 0, 1))),
  };
}

/** Fechas aaaa-mm-dd de los últimos `n` días, terminando hoy. */
export function ultimosDias(hoy: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    sumarDias(hoy, i - n + 1)
      .toISOString()
      .slice(0, 10),
  );
}
