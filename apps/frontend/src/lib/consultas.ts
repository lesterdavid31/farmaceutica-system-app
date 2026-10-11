import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ErrorApi, query, type Pagina } from './api';

type ValorFiltro = string | number | boolean | undefined;

/** Devuelve el valor después de que deja de cambiar durante `ms` milisegundos. */
export function useDebounce<T>(valor: T, ms = 300) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/**
 * Listado paginado con filtros: `?page=&limit=&...` → `{ data, total, page, limit }`.
 * `extra` agrega filtros que vienen de fuera de la pantalla (por ejemplo, la ubicación elegida en
 * la barra superior). La clave de caché separa el recurso por "/", así que invalidar
 * `['inventario']` refresca también `inventario/existencias`.
 */
export function useListado<
  T,
  F extends Record<string, ValorFiltro>,
  R extends Pagina<T> = Pagina<T>,
>(
  recurso: string,
  filtrosIniciales: F,
  { limit = 20, extra = {} }: { limit?: number; extra?: Record<string, ValorFiltro> } = {},
) {
  const [filtros, setFiltrosEstado] = useState<F>(filtrosIniciales);
  const [page, setPage] = useState(1);
  // Si cambia un filtro externo (por ejemplo, la ubicación), se vuelve a la primera página.
  const claveExtra = JSON.stringify(extra);
  const [extraPrevio, setExtraPrevio] = useState(claveExtra);
  if (claveExtra !== extraPrevio) {
    setExtraPrevio(claveExtra);
    setPage(1);
  }
  // La búsqueda de texto espera a que el usuario deje de escribir.
  const filtrosConsulta = useDebounce(filtros);
  const parametros = { ...filtrosConsulta, ...extra, page, limit };
  const consulta = useQuery({
    queryKey: [...recurso.split('/'), 'listado', parametros],
    queryFn: () => api.get<R>(`/${recurso}${query(parametros)}`),
    placeholderData: keepPreviousData,
  });

  /** Cambiar un filtro vuelve a la primera página. */
  const setFiltro = <K extends keyof F>(clave: K, valor: F[K]) => {
    setFiltrosEstado((f) => ({ ...f, [clave]: valor }));
    setPage(1);
  };

  return { ...consulta, filtros, setFiltro, page, setPage, limit };
}

/**
 * Mutación que, al terminar, invalida las consultas del recurso y confirma con un toast
 * que usa el mismo verbo del botón ("Crear usuario" → "Usuario creado").
 * Los formularios muestran el error junto a los campos; las acciones confirmadas en un
 * diálogo usan `errorEnToast`.
 */
export function useMutacion<V, R = unknown>(
  fn: (variables: V) => Promise<R>,
  {
    invalidar,
    exito,
    errorEnToast = false,
  }: { invalidar: QueryKey[]; exito: string | ((r: R) => string); errorEnToast?: boolean },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (resultado) => {
      await Promise.all(invalidar.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(typeof exito === 'function' ? exito(resultado) : exito);
    },
    onError: (error) => {
      if (errorEnToast) {
        toast.error(
          error instanceof ErrorApi
            ? error.message
            : 'Ocurrió un error inesperado. Intente de nuevo.',
        );
      }
    },
  });
}

/** Catálogos pequeños para los selects (ubicaciones, categorías, departamentos). */
export function useCatalogo<T>(recurso: string, ruta: string) {
  return useQuery({
    queryKey: [recurso, 'catalogo', ruta],
    queryFn: () => api.get<T>(ruta),
    staleTime: 5 * 60_000,
  });
}
