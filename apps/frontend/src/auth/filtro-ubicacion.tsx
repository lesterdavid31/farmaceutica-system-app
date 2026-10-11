import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { esGlobal, useUsuario } from './sesion';

const CLAVE = 'farmacia.filtroUbicacion';

interface ContextoFiltro {
  /** Ubicación seleccionada para filtrar; `''` significa todas. */
  ubicacionId: string;
  setUbicacionId: (id: string) => void;
}

const Contexto = createContext<ContextoFiltro | null>(null);

function leer() {
  try {
    return localStorage.getItem(CLAVE) ?? '';
  } catch {
    return '';
  }
}

/**
 * Filtro de ubicación de la barra superior (solo ADMIN y AUDITOR, sección 8).
 * Para GERENTE y CAJERO siempre es su propia ubicación; el backend lo hace cumplir igual.
 */
export function ProveedorFiltroUbicacion({ children }: { children: ReactNode }) {
  const usuario = useUsuario();
  const [seleccion, setSeleccion] = useState(leer);

  const setUbicacionId = useCallback((id: string) => {
    setSeleccion(id);
    try {
      localStorage.setItem(CLAVE, id);
    } catch {
      // Preferencia solo de esta sesión.
    }
  }, []);

  const ubicacionId = esGlobal(usuario) ? seleccion : (usuario.ubicacion?.id ?? '');
  const valor = useMemo(() => ({ ubicacionId, setUbicacionId }), [ubicacionId, setUbicacionId]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFiltroUbicacion() {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useFiltroUbicacion debe usarse dentro de ProveedorFiltroUbicacion');
  }
  return contexto;
}
