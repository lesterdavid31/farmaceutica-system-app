import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { EstadoPedido, Rol } from '../generated/prisma/enums';
import {
  accionesDisponibles,
  estaAtrasado,
  minutosDeAtraso,
  verificarAccion,
} from './reglas-pedido';

const pedido = (estado: EstadoPedido) => ({ numero: 4, estado, ubicacionDespachoId: 'xela' });
const cajero = { rol: Rol.CAJERO, ubicacionId: 'xela' };
const gerente = { rol: Rol.GERENTE, ubicacionId: 'xela' };
const gerenteOtro = { rol: Rol.GERENTE, ubicacionId: 'coban' };
const operador = { rol: Rol.OPERADOR_CALL_CENTER, ubicacionId: null };

describe('ciclo de vida (RN-19)', () => {
  it.each([
    [EstadoPedido.PENDIENTE, ['preparar', 'cancelar']],
    [EstadoPedido.EN_PREPARACION, ['asignar', 'cancelar']],
    [EstadoPedido.ASIGNADO, ['asignar', 'salir', 'cancelar']],
    [EstadoPedido.EN_CAMINO, ['entregar', 'cancelar']],
    [EstadoPedido.ENTREGADO, []],
    [EstadoPedido.CANCELADO, []],
  ])('el gerente de la sucursal en %s puede %j', (estado, esperadas) => {
    expect(accionesDisponibles(pedido(estado), gerente)).toEqual(esperadas);
  });

  it('el cajero mueve el pedido pero no lo cancela (RN-20)', () => {
    expect(accionesDisponibles(pedido(EstadoPedido.EN_CAMINO), cajero)).toEqual(['entregar']);
  });

  it('el operador solo cancela; un gerente de otra sucursal no hace nada', () => {
    expect(accionesDisponibles(pedido(EstadoPedido.PENDIENTE), operador)).toEqual(['cancelar']);
    expect(accionesDisponibles(pedido(EstadoPedido.PENDIENTE), gerenteOtro)).toEqual([]);
  });

  it('rechaza con 403 al usuario sin permiso y con 422 el estado incorrecto', () => {
    expect(() => verificarAccion('preparar', pedido(EstadoPedido.PENDIENTE), operador)).toThrow(
      ForbiddenException,
    );
    expect(() => verificarAccion('entregar', pedido(EstadoPedido.ASIGNADO), cajero)).toThrow(
      'solo se entrega un pedido en camino',
    );
    expect(() => verificarAccion('cancelar', pedido(EstadoPedido.ENTREGADO), gerente)).toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('atraso (RN-18)', () => {
  const ahora = new Date('2026-10-12T18:00:00Z');
  const conCompromiso = (estado: EstadoPedido, iso: string) => ({
    estado,
    fechaCompromiso: new Date(iso),
  });

  it('está atrasado si pasó el compromiso y no se ha entregado', () => {
    const p = conCompromiso(EstadoPedido.EN_CAMINO, '2026-10-12T17:15:00Z');
    expect(estaAtrasado(p, ahora)).toBe(true);
    expect(minutosDeAtraso(p, ahora)).toBe(45);
  });

  it('no está atrasado antes del compromiso, ni si ya se entregó o canceló', () => {
    expect(estaAtrasado(conCompromiso(EstadoPedido.PENDIENTE, '2026-10-12T18:30:00Z'), ahora)).toBe(
      false,
    );
    expect(estaAtrasado(conCompromiso(EstadoPedido.ENTREGADO, '2026-10-12T10:00:00Z'), ahora)).toBe(
      false,
    );
    expect(estaAtrasado(conCompromiso(EstadoPedido.CANCELADO, '2026-10-12T10:00:00Z'), ahora)).toBe(
      false,
    );
  });
});
