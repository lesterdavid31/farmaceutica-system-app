import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MetodoPago } from '../generated/prisma/enums';
import { normalizarNit, validarPagos } from './reglas-venta';

describe('normalizarNit', () => {
  it('usa CF para consumidor final o vacío', () => {
    expect(normalizarNit()).toBe('CF');
    expect(normalizarNit('')).toBe('CF');
    expect(normalizarNit(' cf ')).toBe('CF');
    expect(normalizarNit('C/F')).toBe('CF');
  });

  it('quita guiones y espacios y acepta verificador K', () => {
    expect(normalizarNit('1234567-8')).toBe('12345678');
    expect(normalizarNit('987654-k')).toBe('987654K');
  });

  it('rechaza NIT con letras o demasiado cortos', () => {
    expect(() => normalizarNit('ABC123')).toThrow(UnprocessableEntityException);
    expect(() => normalizarNit('K')).toThrow(UnprocessableEntityException);
  });
});

describe('validarPagos', () => {
  const total = new Prisma.Decimal('150.75');

  it('acepta un pago exacto o una combinación de efectivo y tarjeta', () => {
    expect(() =>
      validarPagos(total, [{ metodo: MetodoPago.EFECTIVO, monto: 150.75 }]),
    ).not.toThrow();
    expect(() =>
      validarPagos(total, [
        { metodo: MetodoPago.TARJETA, monto: 100 },
        { metodo: MetodoPago.EFECTIVO, monto: 50.75 },
      ]),
    ).not.toThrow();
  });

  it('rechaza pagos que no suman el total', () => {
    expect(() => validarPagos(total, [{ metodo: MetodoPago.EFECTIVO, monto: 200 }])).toThrow(
      'Revise los pagos',
    );
    expect(() => validarPagos(total, [{ metodo: MetodoPago.TARJETA, monto: 150 }])).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rechaza pagos de cero aunque el total cuadre', () => {
    expect(() =>
      validarPagos(total, [
        { metodo: MetodoPago.EFECTIVO, monto: 150.75 },
        { metodo: MetodoPago.TARJETA, monto: 0 },
      ]),
    ).toThrow('Revise los pagos');
  });

  it('rechaza contra entrega en mostrador y métodos repetidos', () => {
    const detalles = (pagos: { metodo: MetodoPago; monto: number }[]) => {
      try {
        validarPagos(total, pagos);
        return [];
      } catch (error) {
        return ((error as UnprocessableEntityException).getResponse() as { detalles: string[] })
          .detalles;
      }
    };
    expect(detalles([{ metodo: MetodoPago.CONTRA_ENTREGA, monto: 150.75 }])).toContain(
      'En mostrador solo se cobra en efectivo o con tarjeta',
    );
    expect(
      detalles([
        { metodo: MetodoPago.EFECTIVO, monto: 100 },
        { metodo: MetodoPago.EFECTIVO, monto: 50.75 },
      ]),
    ).toContain('Cada método de pago se indica una sola vez');
  });
});
