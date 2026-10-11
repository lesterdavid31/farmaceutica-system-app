// Vacío por defecto: frontend y backend se sirven desde el mismo dominio (Vercel Services),
// y en desarrollo Vite redirige /api a la API local. Solo se define para apuntar a otro backend.
const URL_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const URL_API = `${URL_BASE}/api/v1`;

const CLAVE_TOKEN = 'farmacia.token';

/** El token vive en localStorage; si el navegador lo bloquea, la sesión dura lo que la pestaña. */
let tokenEnMemoria: string | null = null;

export function obtenerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN) ?? tokenEnMemoria;
  } catch {
    return tokenEnMemoria;
  }
}

export function guardarToken(token: string | null) {
  tokenEnMemoria = token;
  try {
    if (token) {
      localStorage.setItem(CLAVE_TOKEN, token);
    } else {
      localStorage.removeItem(CLAVE_TOKEN);
    }
  } catch {
    // Sin almacenamiento disponible: se usa solo la memoria.
  }
}

/** Se invoca cuando la API responde 401 con una sesión iniciada (token vencido o usuario desactivado). */
let alExpirarSesion: (() => void) | null = null;
export function registrarAlExpirarSesion(fn: () => void) {
  alExpirarSesion = fn;
}

/** Error con el formato uniforme de la API: { statusCode, message, error, detalles? }. */
export class ErrorApi extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly detalles?: unknown,
  ) {
    super(message);
  }

  /** Mensajes de validación como lista, si la API los envió. */
  get listaDetalles(): string[] {
    return Array.isArray(this.detalles) ? this.detalles.map(String) : [];
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function solicitar<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  const token = obtenerToken();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(
      0,
      'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.',
    );
  }

  if (!respuesta.ok) {
    const error = (await respuesta.json().catch(() => null)) as {
      message?: string;
      detalles?: unknown;
    } | null;
    if (respuesta.status === 401 && token) {
      alExpirarSesion?.();
    }
    throw new ErrorApi(
      respuesta.status,
      error?.message ?? `El servidor respondió con el código ${respuesta.status}`,
      error?.detalles,
    );
  }
  return (await respuesta.json()) as T;
}

/** Arma una query string omitiendo valores vacíos. */
export function query(parametros: Record<string, string | number | boolean | undefined | null>) {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      busqueda.set(clave, String(valor));
    }
  }
  const texto = busqueda.toString();
  return texto ? `?${texto}` : '';
}

export const api = {
  get: <T>(ruta: string) => solicitar<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => solicitar<T>('POST', ruta, cuerpo ?? {}),
  put: <T>(ruta: string, cuerpo: unknown) => solicitar<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => solicitar<T>('PATCH', ruta, cuerpo),
  delete: <T>(ruta: string) => solicitar<T>('DELETE', ruta),
};

// ─── Tipos compartidos de la API ──────────────────────────────────────────────

export interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
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

export const obtenerEstadoSalud = () => api.get<EstadoSalud>('/health');
