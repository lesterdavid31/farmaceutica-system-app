import { ForbiddenException } from '@nestjs/common';
import { esRolGlobal, UsuarioAutenticado } from './usuario-autenticado';

/**
 * Determina qué ubicación puede consultar el usuario.
 * - Roles globales: la ubicación solicitada, o `undefined` para todas.
 * - GERENTE y CAJERO: siempre la suya; pedir otra es un 403.
 */
export function resolverUbicacion(
  usuario: UsuarioAutenticado,
  ubicacionSolicitada?: string,
): string | undefined {
  if (esRolGlobal(usuario.rol)) {
    return ubicacionSolicitada || undefined;
  }
  if (!usuario.ubicacionId) {
    throw new ForbiddenException('Su usuario no tiene una ubicación asignada');
  }
  if (ubicacionSolicitada && ubicacionSolicitada !== usuario.ubicacionId) {
    throw new ForbiddenException('Solo puede acceder a los datos de su ubicación');
  }
  return usuario.ubicacionId;
}

/** Verifica que el usuario pueda operar sobre un recurso de la ubicación indicada. */
export function verificarAccesoUbicacion(usuario: UsuarioAutenticado, ubicacionId: string) {
  if (esRolGlobal(usuario.rol)) {
    return;
  }
  if (usuario.ubicacionId !== ubicacionId) {
    throw new ForbiddenException('Solo puede acceder a los datos de su ubicación');
  }
}
