import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { EstadoTraslado, Rol } from '../generated/prisma/enums';
import {
  accionesDisponibles,
  puedeOperar,
  validarRecepcion,
  verificarAccion,
} from './reglas-traslado';

const ORIGEN = 'origen';
const DESTINO = 'destino';
const traslado = (estado: EstadoTraslado) => ({
  numero: 7,
  estado,
  origenId: ORIGEN,
  destinoId: DESTINO,
});
const admin = { rol: Rol.ADMIN, ubicacionId: null };
const gerenteOrigen = { rol: Rol.GERENTE, ubicacionId: ORIGEN };
const gerenteDestino = { rol: Rol.GERENTE, ubicacionId: DESTINO };
const gerenteOtro = { rol: Rol.GERENTE, ubicacionId: 'otra' };

describe('puedeOperar', () => {
  it('el administrador puede todo', () => {
    for (const accion of ['aprobar', 'despachar', 'recibir', 'cancelar'] as const) {
      expect(puedeOperar(accion, admin, traslado(EstadoTraslado.SOLICITADO))).toBe(true);
    }
  });

  it('el gerente de origen aprueba y despacha, pero no recibe', () => {
    const t = traslado(EstadoTraslado.SOLICITADO);
    expect(puedeOperar('aprobar', gerenteOrigen, t)).toBe(true);
    expect(puedeOperar('despachar', gerenteOrigen, t)).toBe(true);
    expect(puedeOperar('recibir', gerenteOrigen, t)).toBe(false);
  });

  it('el gerente de destino recibe, pero no aprueba ni despacha', () => {
    const t = traslado(EstadoTraslado.SOLICITADO);
    expect(puedeOperar('recibir', gerenteDestino, t)).toBe(true);
    expect(puedeOperar('aprobar', gerenteDestino, t)).toBe(false);
    expect(puedeOperar('despachar', gerenteDestino, t)).toBe(false);
  });

  it('cualquiera de los dos gerentes cancela; un tercero no', () => {
    const t = traslado(EstadoTraslado.SOLICITADO);
    expect(puedeOperar('cancelar', gerenteOrigen, t)).toBe(true);
    expect(puedeOperar('cancelar', gerenteDestino, t)).toBe(true);
    expect(puedeOperar('cancelar', gerenteOtro, t)).toBe(false);
  });

  it('auditor, cajero y operador no operan traslados', () => {
    const t = traslado(EstadoTraslado.SOLICITADO);
    for (const rol of [Rol.AUDITOR, Rol.CAJERO, Rol.OPERADOR_CALL_CENTER]) {
      expect(puedeOperar('aprobar', { rol, ubicacionId: ORIGEN }, t)).toBe(false);
    }
  });
});

describe('accionesDisponibles: ciclo de vida (RN-08)', () => {
  it.each([
    [EstadoTraslado.SOLICITADO, ['aprobar', 'cancelar']],
    [EstadoTraslado.APROBADO, ['despachar', 'cancelar']],
    [EstadoTraslado.EN_TRANSITO, ['recibir']],
    [EstadoTraslado.RECIBIDO, []],
    [EstadoTraslado.CANCELADO, []],
  ])('para el administrador, %s permite %j', (estado, esperadas) => {
    expect(accionesDisponibles(traslado(estado), admin)).toEqual(esperadas);
  });

  it('filtra por la ubicación del gerente', () => {
    expect(accionesDisponibles(traslado(EstadoTraslado.APROBADO), gerenteDestino)).toEqual([
      'cancelar',
    ]);
    expect(accionesDisponibles(traslado(EstadoTraslado.EN_TRANSITO), gerenteOrigen)).toEqual([]);
  });
});

describe('verificarAccion', () => {
  it('rechaza con 403 si el usuario no puede y con 422 si el estado no lo permite', () => {
    expect(() =>
      verificarAccion('despachar', traslado(EstadoTraslado.APROBADO), gerenteDestino),
    ).toThrow(ForbiddenException);
    expect(() => verificarAccion('cancelar', traslado(EstadoTraslado.EN_TRANSITO), admin)).toThrow(
      'El traslado #7 está en tránsito: solo se cancela un traslado que aún no se ha despachado',
    );
    expect(() => verificarAccion('despachar', traslado(EstadoTraslado.SOLICITADO), admin)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('no permite despachar dos veces ni recibir dos veces', () => {
    expect(() => verificarAccion('despachar', traslado(EstadoTraslado.EN_TRANSITO), admin)).toThrow(
      UnprocessableEntityException,
    );
    expect(() => verificarAccion('recibir', traslado(EstadoTraslado.RECIBIDO), admin)).toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('validarRecepcion (RN-09)', () => {
  const enviadas = [
    { id: 'a', cantidadEnviada: 10, producto: 'Amoxicilina', numeroLote: 'L1' },
    { id: 'b', cantidadEnviada: 5, producto: 'Amoxicilina', numeroLote: 'L2' },
  ];

  it('sin diferencias no exige motivo', () => {
    expect(
      validarRecepcion(enviadas, [
        { detalleId: 'a', cantidadRecibida: 10 },
        { detalleId: 'b', cantidadRecibida: 5 },
      ]),
    ).toEqual([]);
  });

  it('devuelve los faltantes cuando hay motivo', () => {
    expect(
      validarRecepcion(
        enviadas,
        [
          { detalleId: 'a', cantidadRecibida: 8 },
          { detalleId: 'b', cantidadRecibida: 0 },
        ],
        'Caja dañada en el transporte',
      ),
    ).toEqual([
      { detalleId: 'a', faltante: 2 },
      { detalleId: 'b', faltante: 5 },
    ]);
  });

  it('exige motivo si hay diferencias', () => {
    expect(() =>
      validarRecepcion(enviadas, [
        { detalleId: 'a', cantidadRecibida: 9 },
        { detalleId: 'b', cantidadRecibida: 5 },
      ]),
    ).toThrow('explique el motivo');
  });

  it('no acepta recibir más de lo despachado', () => {
    expect(() =>
      validarRecepcion(enviadas, [
        { detalleId: 'a', cantidadRecibida: 11 },
        { detalleId: 'b', cantidadRecibida: 5 },
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  it('exige una cantidad para cada fila y rechaza filas ajenas o negativas', () => {
    const intentar = (recibidas: { detalleId: string; cantidadRecibida: number }[]) => {
      try {
        validarRecepcion(enviadas, recibidas);
        return [];
      } catch (error) {
        return (error as UnprocessableEntityException).getResponse() as { detalles: string[] };
      }
    };
    expect(intentar([{ detalleId: 'a', cantidadRecibida: 10 }])).toMatchObject({
      detalles: ['Amoxicilina, lote L2: indique la cantidad recibida'],
    });
    expect(
      intentar([
        { detalleId: 'a', cantidadRecibida: -1 },
        { detalleId: 'b', cantidadRecibida: 5 },
        { detalleId: 'z', cantidadRecibida: 1 },
      ]),
    ).toMatchObject({
      detalles: [
        'La recepción incluye filas que no pertenecen al traslado',
        'Amoxicilina, lote L1: la cantidad recibida debe ser un entero mayor o igual a cero',
      ],
    });
  });
});
