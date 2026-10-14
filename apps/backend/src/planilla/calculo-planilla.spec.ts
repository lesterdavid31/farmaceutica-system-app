import { calcularLinea, erroresLinea, finDeMes, totalPlanilla } from './calculo-planilla';

describe('calcularLinea (RN-22)', () => {
  it('líquido = salario + bonificación − IGSS (4.83 %) − otros descuentos', () => {
    const l = calcularLinea({
      salarioBase: 4000,
      bonificacion: 250,
      porcentajeIgss: 4.83,
      otrosDescuentos: 100,
    });
    expect(l.igss.toFixed(2)).toBe('193.20');
    expect(l.liquido.toFixed(2)).toBe('3956.80');
  });

  it('redondea el IGSS al centavo (mitad hacia arriba)', () => {
    // 3,250.50 × 4.83 % = 157.0001...; 3,105 × 4.83 % = 149.9715
    expect(
      calcularLinea({
        salarioBase: '3250.50',
        bonificacion: 0,
        porcentajeIgss: 4.83,
        otrosDescuentos: 0,
      }).igss.toFixed(2),
    ).toBe('157.00');
    expect(
      calcularLinea({
        salarioBase: 3105,
        bonificacion: 0,
        porcentajeIgss: 4.83,
        otrosDescuentos: 0,
      }).igss.toFixed(2),
    ).toBe('149.97');
    // 3,450 × 4.83 % = 166.635 → 166.64
    expect(
      calcularLinea({
        salarioBase: 3450,
        bonificacion: 0,
        porcentajeIgss: 4.83,
        otrosDescuentos: 0,
      }).igss.toFixed(2),
    ).toBe('166.64');
  });

  it('la bonificación no cotiza al IGSS y los porcentajes son configurables', () => {
    const con = calcularLinea({
      salarioBase: 5000,
      bonificacion: 250,
      porcentajeIgss: 4.83,
      otrosDescuentos: 0,
    });
    const sin = calcularLinea({
      salarioBase: 5000,
      bonificacion: 0,
      porcentajeIgss: 4.83,
      otrosDescuentos: 0,
    });
    expect(con.igss.equals(sin.igss)).toBe(true);
    expect(
      calcularLinea({
        salarioBase: 5000,
        bonificacion: 500,
        porcentajeIgss: 5,
        otrosDescuentos: 0,
      }).liquido.toFixed(2),
    ).toBe('5250.00');
  });

  it('valida que el líquido no quede en negativo ni haya montos negativos', () => {
    const l = calcularLinea({
      salarioBase: 1000,
      bonificacion: 0,
      porcentajeIgss: 4.83,
      otrosDescuentos: 1000,
    });
    expect(erroresLinea(l, 'Ana')).toEqual([
      'Ana: los descuentos (Q1048.30) superan lo devengado (Q1000.00)',
    ]);
    expect(
      erroresLinea(
        calcularLinea({
          salarioBase: 1000,
          bonificacion: -1,
          porcentajeIgss: 4.83,
          otrosDescuentos: 0,
        }),
        'Ana',
      ),
    ).toContain('Ana: la bonificación no puede ser negativa');
  });

  it('el total suma los líquidos con precisión decimal', () => {
    expect(
      totalPlanilla([{ liquido: '0.10' }, { liquido: '0.20' }, { liquido: 3956.8 }]).toFixed(2),
    ).toBe('3957.10');
  });

  it('fin de mes considera años bisiestos', () => {
    expect(finDeMes(2024, 2).toISOString().slice(0, 10)).toBe('2024-02-29');
    expect(finDeMes(2026, 12).toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});
