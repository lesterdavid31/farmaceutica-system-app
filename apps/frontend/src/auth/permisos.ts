import type { Perfil } from '@/lib/dominio';
import { useUsuario } from './sesion';

/** El gerente de la bodega central: compra a proveedores y despacha a las sucursales. */
export function esGerenteBodega(usuario: Perfil) {
  return usuario.rol === 'GERENTE' && usuario.ubicacion?.tipo === 'BODEGA_CENTRAL';
}

/** Solo la bodega central (y el administrador) registra compras. */
export function usePuedeComprar() {
  const usuario = useUsuario();
  return usuario.rol === 'ADMIN' || esGerenteBodega(usuario);
}
