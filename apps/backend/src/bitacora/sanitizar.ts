const CLAVES_SENSIBLES = new Set(['password', 'passwordHash', 'accessToken', 'token']);

/**
 * Prepara un valor para guardarlo como JSONB en la bitácora: lo serializa (Decimal y Date
 * pasan a texto) y elimina contraseñas y tokens a cualquier profundidad.
 */
export function sanitizar(valor: unknown): unknown {
  if (valor === undefined || valor === null) {
    return null;
  }
  const plano: unknown = JSON.parse(JSON.stringify(valor));
  return quitarSensibles(plano);
}

function quitarSensibles(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(quitarSensibles);
  }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([clave]) => !CLAVES_SENSIBLES.has(clave))
        .map(([clave, v]) => [clave, quitarSensibles(v)]),
    );
  }
  return valor;
}
