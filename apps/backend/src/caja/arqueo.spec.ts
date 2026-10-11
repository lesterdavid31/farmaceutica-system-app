import { MetodoPago, TipoMovimientoCaja } from '../generated/prisma/enums';
import { diferenciaArqueo, montoConSigno, resumirCaja } from './arqueo';

const { EFECTIVO, TARJETA } = MetodoPago;
const { VENTA, GASTO, RETIRO, DEPOSITO, ANULACION, COBRO_CONTRA_ENTREGA } = TipoMovimientoCaja;
const mov = (tipo: TipoMovimientoCaja, metodoPago: MetodoPago, monto: number) => ({
  tipo,
  metodoPago,
  monto: montoConSigno(tipo, monto),
});

describe('montoConSigno', () => {
  it('entran ventas, cobros y depósitos; salen gastos, retiros y anulaciones', () => {
    expect(montoConSigno(VENTA, 10).toNumber()).toBe(10);
    expect(montoConSigno(COBRO_CONTRA_ENTREGA, 10).toNumber()).toBe(10);
    expect(montoConSigno(DEPOSITO, 10).toNumber()).toBe(10);
    expect(montoConSigno(GASTO, 10).toNumber()).toBe(-10);
    expect(montoConSigno(RETIRO, 10).toNumber()).toBe(-10);
    expect(montoConSigno(ANULACION, 10).toNumber()).toBe(-10);
  });

  it('ignora el signo de entrada: el tipo manda', () => {
    expect(montoConSigno(GASTO, -10).toNumber()).toBe(-10);
  });
});

describe('resumirCaja (RN-12)', () => {
  it('sin movimientos, el esperado es el monto inicial', () => {
    expect(resumirCaja(500, []).efectivoEsperado.toFixed(2)).toBe('500.00');
  });

  it('esperado = inicial + ventas en efectivo + depósitos − gastos − retiros − anulaciones', () => {
    const r = resumirCaja('500.00', [
      mov(VENTA, EFECTIVO, 120.5),
      mov(VENTA, EFECTIVO, 79.5),
      mov(DEPOSITO, EFECTIVO, 100),
      mov(GASTO, EFECTIVO, 35.25),
      mov(RETIRO, EFECTIVO, 400),
      mov(ANULACION, EFECTIVO, 79.5),
    ]);
    expect(r.efectivoEsperado.toFixed(2)).toBe('285.25');
    expect(r.ingresosEfectivo.toFixed(2)).toBe('300.00');
    expect(r.egresosEfectivo.toFixed(2)).toBe('514.75');
    expect(r.efectivoPorTipo.VENTA.toFixed(2)).toBe('200.00');
    expect(r.efectivoPorTipo.ANULACION.toFixed(2)).toBe('-79.50');
  });

  it('los pagos con tarjeta se informan pero no cambian el efectivo esperado', () => {
    const r = resumirCaja(200, [
      mov(VENTA, TARJETA, 350),
      mov(VENTA, EFECTIVO, 50),
      mov(ANULACION, TARJETA, 350),
    ]);
    expect(r.efectivoEsperado.toFixed(2)).toBe('250.00');
    expect(r.porMetodo.TARJETA.toFixed(2)).toBe('0.00');
    expect(r.porMetodo.EFECTIVO.toFixed(2)).toBe('50.00');
  });

  it('suma decimales sin errores de punto flotante', () => {
    const r = resumirCaja(0, [mov(VENTA, EFECTIVO, 0.1), mov(VENTA, EFECTIVO, 0.2)]);
    expect(r.efectivoEsperado.toFixed(2)).toBe('0.30');
    expect(r.efectivoEsperado.equals(0.3)).toBe(true);
  });
});

describe('diferenciaArqueo', () => {
  it('positiva es sobrante, negativa es faltante, cero cuadra', () => {
    expect(diferenciaArqueo(310, '300.00').toFixed(2)).toBe('10.00');
    expect(diferenciaArqueo(287.75, '300.00').toFixed(2)).toBe('-12.25');
    expect(diferenciaArqueo('300', 300).isZero()).toBe(true);
  });
});
