import { Rol, TipoUbicacion } from '../generated/prisma/enums';
import { validarRolUbicacion } from './reglas-usuario';

const farmacia = { tipo: TipoUbicacion.FARMACIA_CC, activa: true };
const stand = { tipo: TipoUbicacion.STAND_GASOLINERA, activa: true };
const bodega = { tipo: TipoUbicacion.BODEGA_CENTRAL, activa: true };

describe('validarRolUbicacion', () => {
  it.each([Rol.ADMIN, Rol.AUDITOR, Rol.OPERADOR_CALL_CENTER])('%s no lleva ubicación', (rol) => {
    expect(() => validarRolUbicacion(rol, null)).not.toThrow();
    expect(() => validarRolUbicacion(rol, farmacia)).toThrow(/no llevan ubicación/);
  });

  it.each([Rol.GERENTE, Rol.CAJERO])('%s requiere ubicación', (rol) => {
    expect(() => validarRolUbicacion(rol, null)).toThrow(/deben tener una ubicación/);
    expect(() => validarRolUbicacion(rol, farmacia)).not.toThrow();
    expect(() => validarRolUbicacion(rol, stand)).not.toThrow();
  });

  it('la bodega central la opera un gerente', () => {
    expect(() => validarRolUbicacion(Rol.GERENTE, bodega)).not.toThrow();
  });

  it('la bodega central no tiene cajeros porque no vende', () => {
    expect(() => validarRolUbicacion(Rol.CAJERO, bodega)).toThrow(/no vende al público/);
  });

  it('no permite asignar una ubicación desactivada', () => {
    expect(() => validarRolUbicacion(Rol.CAJERO, { ...farmacia, activa: false })).toThrow(
      /desactivada/,
    );
  });

  it('responde con 422', () => {
    try {
      validarRolUbicacion(Rol.CAJERO, bodega);
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(422);
    }
  });
});
