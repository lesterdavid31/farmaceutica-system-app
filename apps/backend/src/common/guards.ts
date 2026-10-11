import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Rol } from '../generated/prisma/enums';
import { CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores';
import { UsuarioAutenticado } from './usuario-autenticado';

const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

function esPublico(reflector: Reflector, ctx: ExecutionContext) {
  return reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
}

function usuarioDe(ctx: ExecutionContext) {
  return ctx.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>().user;
}

/** Exige un JWT válido en todos los endpoints salvo los marcados con @Publico(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(ctx: ExecutionContext) {
    return esPublico(this.reflector, ctx) ? true : super.canActivate(ctx);
  }
}

/** Aplica @Roles(...): el método tiene prioridad sobre el controlador. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    if (esPublico(this.reflector, ctx)) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const usuario = usuarioDe(ctx);
    if (!usuario || !roles.includes(usuario.rol)) {
      throw new ForbiddenException('Su rol no tiene permiso para esta acción');
    }
    return true;
  }
}

/** El AUDITOR tiene acceso de solo lectura a todo el sistema. */
@Injectable()
export class AuditorSoloLecturaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const usuario = usuarioDe(ctx);
    const metodo = ctx.switchToHttp().getRequest<Request>().method;
    if (usuario?.rol === Rol.AUDITOR && !METODOS_LECTURA.has(metodo)) {
      throw new ForbiddenException('El rol de auditor es de solo lectura');
    }
    return true;
  }
}
