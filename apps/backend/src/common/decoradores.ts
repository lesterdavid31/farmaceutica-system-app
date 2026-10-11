import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { Rol } from '../generated/prisma/enums';
import { UsuarioAutenticado } from './usuario-autenticado';

export const CLAVE_PUBLICO = 'publico';
export const CLAVE_ROLES = 'roles';

/** Marca un endpoint como accesible sin token (por ejemplo, login y health). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Restringe un endpoint (o un controlador completo) a los roles indicados. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Inyecta el usuario autenticado de la petición. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioAutenticado =>
    ctx.switchToHttp().getRequest<Request & { user: UsuarioAutenticado }>().user,
);
