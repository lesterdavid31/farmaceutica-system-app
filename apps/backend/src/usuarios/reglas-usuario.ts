import { ReglaNegocioException } from '../common/errores';
import { esRolGlobal } from '../common/usuario-autenticado';
import { Rol, TipoUbicacion } from '../generated/prisma/enums';

/**
 * Valida la combinación de rol y ubicación de un usuario (sección 4):
 * - ADMIN, AUDITOR y OPERADOR_CALL_CENTER tienen alcance global: sin ubicación.
 * - GERENTE y CAJERO pertenecen a una ubicación.
 * - La bodega central no vende, así que no tiene cajeros; la opera un GERENTE.
 */
export function validarRolUbicacion(
  rol: Rol,
  ubicacion: { tipo: TipoUbicacion; activa: boolean } | null,
) {
  if (esRolGlobal(rol)) {
    if (ubicacion) {
      throw new ReglaNegocioException(
        'Los roles de administrador, auditor y operador de call center no llevan ubicación: tienen acceso a todas',
      );
    }
    return;
  }
  if (!ubicacion) {
    throw new ReglaNegocioException('Los gerentes y cajeros deben tener una ubicación asignada');
  }
  if (!ubicacion.activa) {
    throw new ReglaNegocioException('La ubicación seleccionada está desactivada');
  }
  if (rol === Rol.CAJERO && ubicacion.tipo === TipoUbicacion.BODEGA_CENTRAL) {
    throw new ReglaNegocioException(
      'La bodega central no vende al público: asigne el cajero a una farmacia o stand',
    );
  }
}
