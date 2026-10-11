import { ForbiddenException } from '@nestjs/common';
import { Rol } from '../generated/prisma/enums';
import { resolverUbicacion, verificarAccesoUbicacion } from './alcance';
import { UsuarioAutenticado } from './usuario-autenticado';

const XELA = '11111111-1111-1111-1111-111111111111';
const PETEN = '22222222-2222-2222-2222-222222222222';

function usuario(rol: Rol, ubicacionId: string | null = null): UsuarioAutenticado {
  return { id: 'u', nombre: 'U', email: 'u@farmacia.gt', rol, ubicacionId };
}

describe('resolverUbicacion', () => {
  it.each([Rol.ADMIN, Rol.AUDITOR, Rol.OPERADOR_CALL_CENTER])(
    '%s consulta todas las ubicaciones o la que elija',
    (rol) => {
      expect(resolverUbicacion(usuario(rol))).toBeUndefined();
      expect(resolverUbicacion(usuario(rol), PETEN)).toBe(PETEN);
    },
  );

  it.each([Rol.GERENTE, Rol.CAJERO])('%s queda limitado a su ubicación', (rol) => {
    expect(resolverUbicacion(usuario(rol, XELA))).toBe(XELA);
    expect(resolverUbicacion(usuario(rol, XELA), XELA)).toBe(XELA);
  });

  it.each([Rol.GERENTE, Rol.CAJERO])('%s no puede pedir otra ubicación', (rol) => {
    expect(() => resolverUbicacion(usuario(rol, XELA), PETEN)).toThrow(ForbiddenException);
  });

  it('rechaza un gerente sin ubicación asignada', () => {
    expect(() => resolverUbicacion(usuario(Rol.GERENTE))).toThrow(ForbiddenException);
  });
});

describe('verificarAccesoUbicacion', () => {
  it('el administrador accede a cualquier ubicación', () => {
    expect(() => verificarAccesoUbicacion(usuario(Rol.ADMIN), PETEN)).not.toThrow();
  });

  it('el cajero solo accede a la suya', () => {
    expect(() => verificarAccesoUbicacion(usuario(Rol.CAJERO, XELA), XELA)).not.toThrow();
    expect(() => verificarAccesoUbicacion(usuario(Rol.CAJERO, XELA), PETEN)).toThrow(
      'Solo puede acceder a los datos de su ubicación',
    );
  });
});
