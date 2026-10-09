// Vacío por defecto: frontend y backend se sirven desde el mismo dominio (Vercel Services),
// y en desarrollo Vite redirige /api a la API local. Solo se define para apuntar a otro backend.
const URL_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const URL_API = `${URL_BASE}/api/v1`;

export class ErrorApi extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function obtenerJson<T>(ruta: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ErrorApi(
      0,
      `No se pudo conectar con la API en ${URL_API}. Revise que esté en línea.`,
    );
  }
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorApi(respuesta.status, cuerpo?.message ?? `La API respondió ${respuesta.status}`);
  }
  return (await respuesta.json()) as T;
}

export type EstadoBaseDatos = 'ok' | 'error' | 'sin_configurar';

export interface EstadoSalud {
  estado: 'ok';
  servicio: string;
  version: string;
  entorno: string;
  fecha: string;
  baseDatos: EstadoBaseDatos;
}

export const obtenerEstadoSalud = () => obtenerJson<EstadoSalud>('/health');
