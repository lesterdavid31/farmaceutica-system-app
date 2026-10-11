import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Pagina } from '@/components/pagina';
import type { Rol } from '@/lib/dominio';
import { ProveedorFiltroUbicacion } from './filtro-ubicacion';
import { useSesion } from './sesion';

/** Exige sesión iniciada. El frontend solo oculta opciones; la seguridad real está en la API. */
export function RutaAutenticada({ children }: { children: ReactNode }) {
  const { sesion } = useSesion();
  const ubicacion = useLocation();

  if (sesion.estado === 'cargando') {
    return (
      <p role="status" className="p-8 text-center text-denso text-texto-secundario">
        Cargando su sesión...
      </p>
    );
  }
  if (sesion.estado === 'anonimo') {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }
  return <ProveedorFiltroUbicacion>{children}</ProveedorFiltroUbicacion>;
}

/** Restringe una pantalla a ciertos roles. */
export function SoloRoles({ roles, children }: { roles: readonly Rol[]; children: ReactNode }) {
  const { sesion } = useSesion();
  if (sesion.estado !== 'autenticado' || !roles.includes(sesion.usuario.rol)) {
    return (
      <Pagina>
        <h1 className="m-0 text-pagina font-semibold">Sin acceso</h1>
        <p className="mt-2 text-cuerpo text-texto-secundario">
          Su rol no tiene permiso para ver esta pantalla.{' '}
          <Link to="/" className="text-verde-botica">
            Volver al inicio
          </Link>
        </p>
      </Pagina>
    );
  }
  return children;
}
