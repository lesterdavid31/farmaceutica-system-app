import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usaSelectorUbicacion } from './permisos';
import { useUsuario } from './sesion';

/** Por usuario: si otro usuario entra en el mismo navegador, no hereda la ubicación elegida. */
const clave = (usuarioId: string) => `farmacia.filtroUbicacion.${usuarioId}`;

interface ContextoFiltro {
  /** Ubicación seleccionada para filtrar; `''` significa todas. */
  ubicacionId: string;
  setUbicacionId: (id: string) => void;
}

const Contexto = createContext<ContextoFiltro | null>(null);

function leer(usuarioId: string) {
  try {
    return localStorage.getItem(clave(usuarioId)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Filtro de ubicación de la barra superior (solo GERENTE_GENERAL y AUDITOR, sección 8).
 * Para GERENTE y CAJERO siempre es su propia ubicación; el backend lo hace cumplir igual.
 * El OPERADOR_CALL_CENTER no tiene selector: siempre ve todas las ubicaciones.
 */
export function ProveedorFiltroUbicacion({ children }: { children: ReactNode }) {
  const usuario = useUsuario();
  const [seleccion, setSeleccion] = useState(() => leer(usuario.id));

  const setUbicacionId = useCallback(
    (id: string) => {
      setSeleccion(id);
      try {
        localStorage.setItem(clave(usuario.id), id);
      } catch {
        // Preferencia solo de esta sesión.
      }
    },
    [usuario.id],
  );

  // El operador no tiene ubicación asignada, así que queda en '' (todas).
  const ubicacionId = usaSelectorUbicacion(usuario) ? seleccion : (usuario.ubicacion?.id ?? '');
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
