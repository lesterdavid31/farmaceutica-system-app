import { EstadoSolicitudUsuario, Rol } from '../generated/prisma/enums';
import {
  accionesDisponibles,
  estadoInicial,
  motivoNoPuedeSolicitar,
  puedeHacer,
} from './reglas-solicitud';

const XELA = 'xela';
const gerenteXela = { rol: Rol.GERENTE, ubicacionId: XELA };
const gerenteGeneral = { rol: Rol.GERENTE_GENERAL, ubicacionId: null };
const ti = { rol: Rol.ADMIN, ubicacionId: null };

describe('solicitudes de cuenta', () => {
  it('el gerente solicita solo para su ubicación; el gerente general, para cualquiera', () => {
    expect(motivoNoPuedeSolicitar(gerenteXela, XELA)).toBeNull();
    expect(motivoNoPuedeSolicitar(gerenteXela, 'peten')).toMatch(/su propia ubicación/);
    expect(motivoNoPuedeSolicitar(gerenteGeneral, 'peten')).toBeNull();
    expect(motivoNoPuedeSolicitar(ti, XELA)).not.toBeNull();
    expect(motivoNoPuedeSolicitar({ rol: Rol.CAJERO, ubicacionId: XELA }, XELA)).not.toBeNull();
  });

  it('la solicitud del gerente general nace aprobada', () => {
    expect(estadoInicial(gerenteXela)).toBe(EstadoSolicitudUsuario.PENDIENTE);
    expect(estadoInicial(gerenteGeneral)).toBe(EstadoSolicitudUsuario.APROBADA);
  });

  it('el gerente general aprueba o rechaza las pendientes', () => {
    const pendiente = { estado: EstadoSolicitudUsuario.PENDIENTE };
    expect(accionesDisponibles(pendiente, gerenteGeneral)).toEqual(['aprobar', 'rechazar']);
    expect(accionesDisponibles(pendiente, ti)).toEqual([]);
    expect(accionesDisponibles(pendiente, gerenteXela)).toEqual([]);
  });

  it('TI crea la cuenta solo de las aprobadas', () => {
    const aprobada = { estado: EstadoSolicitudUsuario.APROBADA };
    expect(accionesDisponibles(aprobada, ti)).toEqual(['crearCuenta']);
    expect(accionesDisponibles(aprobada, gerenteGeneral)).toEqual([]);
    expect(puedeHacer('crearCuenta', ti, { estado: EstadoSolicitudUsuario.PENDIENTE })).toBe(false);
  });

  it('las rechazadas y atendidas ya no tienen acciones', () => {
    for (const estado of [EstadoSolicitudUsuario.RECHAZADA, EstadoSolicitudUsuario.ATENDIDA]) {
      expect(accionesDisponibles({ estado }, gerenteGeneral)).toEqual([]);
      expect(accionesDisponibles({ estado }, ti)).toEqual([]);
    }
  });
});
