import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, guardarToken, obtenerToken, registrarAlExpirarSesion } from '@/lib/api';
import { ROLES_GLOBALES, type Perfil, type Rol } from '@/lib/dominio';

interface RespuestaLogin {
  accessToken: string;
  expiraEn: number;
  usuario: Perfil;
}

type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo'; motivo?: string }
  | { estado: 'autenticado'; usuario: Perfil };

interface ContextoSesion {
  sesion: EstadoSesion;
  iniciarSesion: (email: string, password: string) => Promise<Perfil>;
  cerrarSesion: (motivo?: string) => void;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sesion, setSesion] = useState<EstadoSesion>(() =>
    obtenerToken() ? { estado: 'cargando' } : { estado: 'anonimo' },
  );

  const cerrarSesion = useCallback(
    (motivo?: string) => {
      guardarToken(null);
      queryClient.clear();
      setSesion({ estado: 'anonimo', motivo });
    },
    [queryClient],
  );

  // Al recargar la página se recupera el perfil con el token guardado.
  useEffect(() => {
    registrarAlExpirarSesion(() =>
      cerrarSesion('Su sesión venció o fue cerrada. Inicie sesión de nuevo.'),
    );
    if (!obtenerToken()) {
      return;
    }
    let vigente = true;
    api
      .get<Perfil>('/auth/perfil')
      .then((usuario) => vigente && setSesion({ estado: 'autenticado', usuario }))
      .catch(() => vigente && setSesion({ estado: 'anonimo' }));
    return () => {
      vigente = false;
    };
  }, [cerrarSesion]);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const respuesta = await api.post<RespuestaLogin>('/auth/login', { email, password });
    guardarToken(respuesta.accessToken);
    setSesion({ estado: 'autenticado', usuario: respuesta.usuario });
    return respuesta.usuario;
  }, []);

  const valor = useMemo(
    () => ({ sesion, iniciarSesion, cerrarSesion }),
    [sesion, iniciarSesion, cerrarSesion],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  }
  return contexto;
}

/** Usuario autenticado. Solo para componentes dentro de rutas protegidas. */
export function useUsuario(): Perfil {
  const { sesion } = useSesion();
  if (sesion.estado !== 'autenticado') {
    throw new Error('useUsuario requiere una sesión iniciada');
  }
  return sesion.usuario;
}

export function tieneRol(usuario: Perfil, roles: readonly Rol[]) {
  return roles.includes(usuario.rol);
}

export function esGlobal(usuario: Perfil) {
  return ROLES_GLOBALES.includes(usuario.rol);
}
