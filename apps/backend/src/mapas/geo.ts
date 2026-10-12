export interface Punto {
  latitud: number;
  longitud: number;
}

export type FuenteTiempo = 'google' | 'estimado';

export interface TiempoRuta {
  distanciaKm: number;
  duracionMin: number;
  fuente: FuenteTiempo;
}

/** Factor que convierte la distancia en línea recta en una distancia aproximada por carretera. */
export const FACTOR_RUTA = 1.3;
const RADIO_TIERRA_KM = 6371;

/** Distancia en línea recta entre dos puntos (fórmula de haversine), en kilómetros. */
export function haversineKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Respaldo de la sección 7.3: distancia haversine × 1.3 recorrida a la velocidad promedio
 * configurable. Se redondea la distancia a 2 decimales y el tiempo al minuto superior.
 */
export function estimarRuta(origen: Punto, destino: Punto, velocidadKmh: number): TiempoRuta {
  const distanciaKm = Math.round(haversineKm(origen, destino) * FACTOR_RUTA * 100) / 100;
  return {
    distanciaKm,
    duracionMin: Math.ceil((distanciaKm / velocidadKmh) * 60),
    fuente: 'estimado',
  };
}

/** Los `n` puntos más cercanos a `destino` en línea recta (filtro previo para limitar el consumo). */
export function masCercanos<T extends Punto>(puntos: T[], destino: Punto, n: number): T[] {
  return [...puntos]
    .map((p) => ({ p, d: haversineKm(p, destino) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.p);
}
