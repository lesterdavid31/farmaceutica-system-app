import { api, query, type Pagina } from './api';

export interface ColumnaCsv<T> {
  titulo: string;
  valor: (fila: T) => string | number | boolean | null | undefined;
}

/** Escapa un valor según RFC 4180: comillas dobles si contiene separador, comillas o saltos. */
function celda(valor: string | number | boolean | null | undefined) {
  if (valor === null || valor === undefined) {
    return '';
  }
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * Descarga un CSV (RF-36). Lleva BOM UTF-8 para que Excel muestre bien las tildes, separador coma
 * y montos sin formato (punto decimal), para que se puedan sumar en la hoja de cálculo.
 */
export function descargarCsv<T>(nombre: string, columnas: ColumnaCsv<T>[], filas: T[]) {
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(','),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(',')),
  ];
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Máximo de filas que se exportan de un listado paginado. */
export const MAXIMO_EXPORTACION = 5_000;

/**
 * Trae todas las páginas de un listado (de 100 en 100) para exportarlo completo, no solo la
 * página que se ve. Se detiene en MAXIMO_EXPORTACION filas.
 */
export async function obtenerTodas<T>(
  ruta: string,
  parametros: Record<string, string | number | boolean | undefined | null>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let page = 1; filas.length < MAXIMO_EXPORTACION; page++) {
    const r = await api.get<Pagina<T>>(`${ruta}${query({ ...parametros, page, limit: 100 })}`);
    filas.push(...r.data);
    if (filas.length >= r.total || r.data.length === 0) {
      break;
    }
  }
  return filas.slice(0, MAXIMO_EXPORTACION);
}

/** Fecha y hora en formato aaaa-mm-dd hh:mm (hora local), legible y ordenable en una hoja. */
export function fechaCsv(valor: string | Date | null | undefined) {
  if (!valor) {
    return '';
  }
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Fecha DATE (medianoche UTC) como aaaa-mm-dd. */
export const diaCsv = (valor: string | null | undefined) => (valor ? valor.slice(0, 10) : '');
