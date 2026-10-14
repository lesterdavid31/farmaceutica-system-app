/**
 * Colores de las gráficas (sección 8.1). Recharts pinta SVG con atributos, que no aceptan
 * `var(--token)`, así que se repiten aquí los valores de tokens.css: si cambia un token, cambia aquí.
 * Las series siguen siempre el mismo orden y cada entidad conserva su color.
 */
export const COLORES = {
  serie1: '#1e5b4f',
  serie2: '#6f9d8f',
  serie3: '#2e5a78',
  serie4: '#a9b7b2',
  superficie: '#ffffff',
  borde: '#d7dfdc',
  texto: '#1d2a26',
  textoSecundario: '#5a6a65',
  salvia: '#e6f0ec',
} as const;

/** Montos cortos para los ejes: Q 12.5k, Q 1.2M. */
export function montoCorto(valor: number) {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) {
    return `Q ${(valor / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `Q ${(valor / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }
  return `Q ${valor.toFixed(0)}`;
}

export const SERIES_METODO = [
  { clave: 'EFECTIVO', nombre: 'Efectivo', color: COLORES.serie1 },
  { clave: 'CONTRA_ENTREGA', nombre: 'Contra entrega', color: COLORES.serie2 },
  { clave: 'TARJETA', nombre: 'Tarjeta', color: COLORES.serie3 },
] as const;
