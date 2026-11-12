import type { Perfil } from '@/lib/dominio';
import { useUsuario } from './sesion';

/** El gerente de la bodega central: compra a proveedores y despacha a las sucursales. */
export function esGerenteBodega(usuario: Perfil) {
  return usuario.rol === 'GERENTE' && usuario.ubicacion?.tipo === 'BODEGA_CENTRAL';
}

/**
 * Filtran por ubicación con el selector de la barra superior quienes ven datos de toda la cadena:
 * el gerente general y el auditor (sección 8).
 */
export function usaSelectorUbicacion(usuario: Perfil) {
  return usuario.rol === 'GERENTE_GENERAL' || usuario.rol === 'AUDITOR';
}

/** Solo la bodega central (y el gerente general) registra compras. */
export function usePuedeComprar() {
  const usuario = useUsuario();
  return usuario.rol === 'GERENTE_GENERAL' || esGerenteBodega(usuario);
}

/** Solicitan traslados el gerente general y los gerentes (hacia o desde su ubicación). */
export function usePuedeSolicitarTraslado() {
  const usuario = useUsuario();
  return usuario.rol === 'GERENTE_GENERAL' || usuario.rol === 'GERENTE';
}
