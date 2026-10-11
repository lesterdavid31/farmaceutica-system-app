import { Rol } from '../generated/prisma/enums';

/** Usuario de la petición actual, tal como lo deja la estrategia JWT en `request.user`. */
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  /** Nulo para los roles de alcance global (ADMIN, AUDITOR, OPERADOR_CALL_CENTER). */
  ubicacionId: string | null;
}

/** Roles que ven todas las ubicaciones. GERENTE y CAJERO solo ven la suya. */
export const ROLES_GLOBALES: readonly Rol[] = [Rol.ADMIN, Rol.AUDITOR, Rol.OPERADOR_CALL_CENTER];

export function esRolGlobal(rol: Rol) {
  return ROLES_GLOBALES.includes(rol);
}
