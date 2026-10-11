import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../generated/prisma/enums';
import { CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores';
import { AuditorSoloLecturaGuard, RolesGuard } from './guards';
import { UsuarioAutenticado } from './usuario-autenticado';

function contexto(usuario: Partial<UsuarioAutenticado> | undefined, metodo = 'GET') {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controlador {},
    switchToHttp: () => ({ getRequest: () => ({ user: usuario, method: metodo }) }),
  } as unknown as ExecutionContext;
}

function reflectorCon(metadatos: Record<string, unknown>) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((clave: unknown) => metadatos[clave as string]);
  return reflector;
}

describe('RolesGuard', () => {
  it('permite cualquier usuario autenticado si el endpoint no declara roles', () => {
    const guard = new RolesGuard(reflectorCon({}));
    expect(guard.canActivate(contexto({ rol: Rol.CAJERO }))).toBe(true);
  });

  it('permite los roles declarados', () => {
    const guard = new RolesGuard(reflectorCon({ [CLAVE_ROLES]: [Rol.ADMIN, Rol.AUDITOR] }));
    expect(guard.canActivate(contexto({ rol: Rol.AUDITOR }))).toBe(true);
  });

  it('rechaza con 403 los roles no declarados', () => {
    const guard = new RolesGuard(reflectorCon({ [CLAVE_ROLES]: [Rol.ADMIN] }));
    expect(() => guard.canActivate(contexto({ rol: Rol.GERENTE }))).toThrow(ForbiddenException);
  });

  it('no exige rol en los endpoints públicos', () => {
    const guard = new RolesGuard(
      reflectorCon({ [CLAVE_PUBLICO]: true, [CLAVE_ROLES]: [Rol.ADMIN] }),
    );
    expect(guard.canActivate(contexto(undefined))).toBe(true);
  });
});

describe('AuditorSoloLecturaGuard', () => {
  const guard = new AuditorSoloLecturaGuard();

  it.each(['GET', 'HEAD', 'OPTIONS'])('permite %s al auditor', (metodo) => {
    expect(guard.canActivate(contexto({ rol: Rol.AUDITOR }, metodo))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rechaza %s del auditor', (metodo) => {
    expect(() => guard.canActivate(contexto({ rol: Rol.AUDITOR }, metodo))).toThrow(
      'El rol de auditor es de solo lectura',
    );
  });

  it('no afecta a los demás roles', () => {
    expect(guard.canActivate(contexto({ rol: Rol.ADMIN }, 'POST'))).toBe(true);
  });
});
