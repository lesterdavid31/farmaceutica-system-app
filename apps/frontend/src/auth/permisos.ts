import type { Perfil } from '@/lib/dominio';
import { useUsuario } from './sesion';

/** El gerente de la bodega central: compra a proveedores y despacha a las sucursales. */
export function esGerenteBodega(usuario: Perfil) {
  return usuario.rol === 'GERENTE' && usuario.ubicacion?.tipo === 'BODEGA_CENTRAL';
}

/** Solo ADMIN y AUDITOR filtran por ubicación con el selector de la barra superior (sección 8). */
export function usaSelectorUbicacion(usuario: Perfil) {
  return usuario.rol === 'ADMIN' || usuario.rol === 'AUDITOR';
}

/** Solo la bodega central (y el administrador) registra compras. */
export function usePuedeComprar() {
  const usuario = useUsuario();
  return usuario.rol === 'ADMIN' || esGerenteBodega(usuario);
}

/** Solicitan traslados el administrador y los gerentes (hacia o desde su ubicación). */
export function usePuedeSolicitarTraslado() {
  const usuario = useUsuario();
  return usuario.rol === 'ADMIN' || usuario.rol === 'GERENTE';
}
