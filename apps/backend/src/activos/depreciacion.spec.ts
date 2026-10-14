import { calcularDepreciacion, fechaFinVidaUtil, mesesCompletos } from './depreciacion';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('mesesCompletos', () => {
  it('cuenta un mes al llegar al mismo día del mes siguiente', () => {
    expect(mesesCompletos(d('2026-01-15'), d('2026-02-14'))).toBe(0);
    expect(mesesCompletos(d('2026-01-15'), d('2026-02-15'))).toBe(1);
    expect(mesesCompletos(d('2026-01-15'), d('2027-01-15'))).toBe(12);
  });

  it('a fin de mes usa el último día disponible', () => {
    expect(mesesCompletos(d('2026-01-31'), d('2026-02-28'))).toBe(1);
    expect(mesesCompletos(d('2026-01-31'), d('2026-02-27'))).toBe(0);
    expect(mesesCompletos(d('2024-01-31'), d('2024-02-29'))).toBe(1);
  });

  it('es cero antes de la adquisición y el mismo día', () => {
    expect(mesesCompletos(d('2026-05-10'), d('2026-05-01'))).toBe(0);
    expect(mesesCompletos(d('2026-05-10'), d('2026-05-10'))).toBe(0);
  });
});

describe('calcularDepreciacion (RN-24)', () => {
  // Computadora: Q9,000, residual Q900, vida útil 36 meses → Q225 mensuales.
  const computadora = {
    costo: '9000.00',
    valorResidual: '900.00',
    vidaUtilMeses: 36,
    fechaAdquisicion: d('2025-01-10'),
  };

  it('la cuota mensual es (costo − residual) / vida útil', () => {
    expect(calcularDepreciacion(computadora, d('2025-01-10')).depreciacionMensual.toFixed(2)).toBe(
      '225.00',
    );
  });

  it('acumula por meses completos y calcula el valor en libros a cualquier fecha', () => {
    const r = calcularDepreciacion(computadora, d('2026-04-09'));
    expect(r.mesesTranscurridos).toBe(14);
    expect(r.depreciacionAcumulada.toFixed(2)).toBe('3150.00');
    expect(r.valorEnLibros.toFixed(2)).toBe('5850.00');
    expect(calcularDepreciacion(computadora, d('2026-04-10')).valorEnLibros.toFixed(2)).toBe(
      '5625.00',
    );
  });

  it('antes de adquirirlo vale su costo y no se deprecia', () => {
    const r = calcularDepreciacion(computadora, d('2024-12-31'));
    expect(r.depreciacionAcumulada.toFixed(2)).toBe('0.00');
    expect(r.valorEnLibros.toFixed(2)).toBe('9000.00');
  });

  it('al terminar la vida útil queda exactamente en el valor residual y no baja más', () => {
    const fin = calcularDepreciacion(computadora, d('2028-01-10'));
    expect(fin.totalmenteDepreciado).toBe(true);
    expect(fin.valorEnLibros.toFixed(2)).toBe('900.00');
    expect(calcularDepreciacion(computadora, d('2035-06-01')).valorEnLibros.toFixed(2)).toBe(
      '900.00',
    );
  });

  it('redondea al centavo sin perder el residual cuando la cuota no es exacta', () => {
    // Q10,000 sin residual en 36 meses: Q277.777... mensuales.
    const activo = { ...computadora, costo: 10000, valorResidual: 0 };
    expect(calcularDepreciacion(activo, d('2025-01-10')).depreciacionMensual.toFixed(2)).toBe(
      '277.78',
    );
    expect(calcularDepreciacion(activo, d('2025-02-10')).depreciacionAcumulada.toFixed(2)).toBe(
      '277.78',
    );
    expect(calcularDepreciacion(activo, d('2025-04-10')).depreciacionAcumulada.toFixed(2)).toBe(
      '833.33',
    );
    expect(calcularDepreciacion(activo, d('2028-01-10')).valorEnLibros.toFixed(2)).toBe('0.00');
  });

  it('un edificio a 20 años se deprecia 1/240 por mes', () => {
    const edificio = {
      costo: 1_200_000,
      valorResidual: 240_000,
      vidaUtilMeses: 240,
      fechaAdquisicion: d('2020-03-01'),
    };
    const r = calcularDepreciacion(edificio, d('2026-03-01'));
    expect(r.depreciacionMensual.toFixed(2)).toBe('4000.00');
    expect(r.mesesDepreciados).toBe(72);
    expect(r.valorEnLibros.toFixed(2)).toBe('912000.00');
  });

  it('la fecha de fin de vida útil respeta el fin de mes', () => {
    expect(fechaFinVidaUtil(computadora).toISOString().slice(0, 10)).toBe('2028-01-10');
    expect(
      fechaFinVidaUtil({ fechaAdquisicion: d('2026-01-31'), vidaUtilMeses: 1 })
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-02-28');
  });
});
