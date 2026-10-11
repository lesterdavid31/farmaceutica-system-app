/** Parámetros configurables del sistema (RF-03), con su valor por defecto y su rango válido. */
export const PARAMETROS = {
  DIAS_ALERTA_VENCIMIENTO: {
    etiqueta: 'Días de alerta de vencimiento',
    descripcion:
      'Los lotes que vencen dentro de este número de días se marcan como próximos a vencer (RN-04).',
    porDefecto: 90,
    minimo: 1,
    maximo: 365,
    decimales: 0,
    unidad: 'días',
  },
  TIEMPO_PREPARACION_MIN: {
    etiqueta: 'Tiempo de preparación de pedidos',
    descripcion: 'Minutos que se suman al tiempo de ruta para estimar la entrega (RN-16).',
    porDefecto: 15,
    minimo: 0,
    maximo: 240,
    decimales: 0,
    unidad: 'minutos',
  },
  BONIFICACION_INCENTIVO: {
    etiqueta: 'Bonificación incentivo',
    descripcion: 'Monto mensual por empleado que se agrega a la planilla (RN-22).',
    porDefecto: 250,
    minimo: 0,
    maximo: 10000,
    decimales: 2,
    unidad: 'quetzales',
  },
  PORCENTAJE_IGSS_LABORAL: {
    etiqueta: 'Cuota laboral del IGSS',
    descripcion: 'Porcentaje del salario base que se descuenta por IGSS (RN-22).',
    porDefecto: 4.83,
    minimo: 0,
    maximo: 100,
    decimales: 2,
    unidad: '%',
  },
  VELOCIDAD_PROMEDIO_KMH: {
    etiqueta: 'Velocidad promedio del cálculo de respaldo',
    descripcion:
      'Velocidad para estimar el tiempo de ruta cuando Google Maps no está disponible (sección 7.3).',
    porDefecto: 30,
    minimo: 5,
    maximo: 120,
    decimales: 0,
    unidad: 'km/h',
  },
} as const;

export type ClaveParametro = keyof typeof PARAMETROS;

export const CLAVES_PARAMETROS = Object.keys(PARAMETROS) as ClaveParametro[];

/** Valida un valor contra el rango y los decimales del parámetro. Devuelve un mensaje de error o null. */
export function validarParametro(clave: ClaveParametro, valor: number): string | null {
  const p = PARAMETROS[clave];
  if (!Number.isFinite(valor)) {
    return `${p.etiqueta}: ingrese un número`;
  }
  if (valor < p.minimo || valor > p.maximo) {
    return `${p.etiqueta}: debe estar entre ${p.minimo} y ${p.maximo} ${p.unidad}`;
  }
  const factor = 10 ** p.decimales;
  if (Math.round(valor * factor) !== valor * factor) {
    return p.decimales === 0
      ? `${p.etiqueta}: debe ser un número entero`
      : `${p.etiqueta}: admite máximo ${p.decimales} decimales`;
  }
  return null;
}
