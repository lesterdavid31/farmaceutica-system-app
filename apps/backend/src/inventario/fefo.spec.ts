import {
  asignarFefo,
  diasHasta,
  estaVencido,
  hoyGuatemala,
  LoteDisponible,
  vigenciaDe,
} from './fefo';

const HOY = new Date('2026-10-11T00:00:00.000Z');
const fecha = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

function lote(
  numeroLote: string,
  vence: string,
  cantidad: number,
  creado?: string,
): LoteDisponible {
  return {
    loteId: `id-${numeroLote}`,
    numeroLote,
    fechaVencimiento: fecha(vence),
    cantidad,
    creadoEn: creado ? fecha(creado) : undefined,
  };
}

describe('asignarFefo (RN-02)', () => {
  it('descuenta primero el lote que vence antes, sin importar el orden de entrada', () => {
    const lotes = [
      lote('C', '2027-06-01', 50),
      lote('A', '2026-12-01', 10),
      lote('B', '2027-01-15', 20),
    ];
    expect(asignarFefo(lotes, 5, HOY, 'Ibuprofeno').map((a) => [a.numeroLote, a.cantidad])).toEqual(
      [['A', 5]],
    );
  });

  it('reparte la cantidad entre varios lotes en orden de vencimiento', () => {
    const lotes = [
      lote('C', '2027-06-01', 50),
      lote('A', '2026-12-01', 10),
      lote('B', '2027-01-15', 20),
    ];
    expect(
      asignarFefo(lotes, 35, HOY, 'Ibuprofeno').map((a) => [a.numeroLote, a.cantidad]),
    ).toEqual([
      ['A', 10],
      ['B', 20],
      ['C', 5],
    ]);
  });

  it('usa todo el stock vigente cuando se pide exactamente lo disponible', () => {
    const lotes = [lote('A', '2026-12-01', 10), lote('B', '2027-01-15', 20)];
    const total = asignarFefo(lotes, 30, HOY, 'X').reduce((s, a) => s + a.cantidad, 0);
    expect(total).toBe(30);
  });

  it('desempata por fecha de ingreso cuando dos lotes vencen el mismo día', () => {
    const lotes = [
      lote('NUEVO', '2027-01-01', 10, '2026-09-01'),
      lote('VIEJO', '2027-01-01', 10, '2026-05-01'),
    ];
    expect(asignarFefo(lotes, 5, HOY, 'X')[0].numeroLote).toBe('VIEJO');
  });

  it('ignora lotes sin existencia', () => {
    const lotes = [lote('A', '2026-11-01', 0), lote('B', '2027-01-01', 5)];
    expect(asignarFefo(lotes, 3, HOY, 'X').map((a) => a.numeroLote)).toEqual(['B']);
  });
});

describe('vencidos (RN-03)', () => {
  it('nunca asigna un lote vencido aunque venza antes', () => {
    const lotes = [lote('VENCIDO', '2026-10-10', 100), lote('VIGENTE', '2027-03-01', 10)];
    expect(asignarFefo(lotes, 10, HOY, 'X').map((a) => a.numeroLote)).toEqual(['VIGENTE']);
  });

  it('un lote que vence hoy todavía se puede usar', () => {
    expect(asignarFefo([lote('HOY', '2026-10-11', 5)], 5, HOY, 'X')[0].numeroLote).toBe('HOY');
  });

  it('rechaza la operación si solo hay lotes vencidos', () => {
    expect(() =>
      asignarFefo([lote('VENCIDO', '2026-09-01', 100)], 1, HOY, 'Amoxicilina 500 mg'),
    ).toThrow('No hay existencia vigente de Amoxicilina 500 mg');
  });
});

describe('no negativos (RN-01)', () => {
  it('rechaza pedir más de lo vigente y dice cuánto queda', () => {
    const lotes = [
      lote('A', '2026-12-01', 3),
      lote('B', '2027-01-15', 1),
      lote('V', '2026-01-01', 50),
    ];
    expect(() => asignarFefo(lotes, 5, HOY, 'Amoxicilina 500 mg')).toThrow(
      'No hay existencia suficiente: quedan 4 unidades vigentes de Amoxicilina 500 mg',
    );
  });

  it('responde 422 con la cantidad disponible en los detalles', () => {
    try {
      asignarFefo([lote('A', '2026-12-01', 1)], 2, HOY, 'X');
      fail('debió lanzar');
    } catch (error) {
      const e = error as { getStatus(): number; getResponse(): { detalles: unknown } };
      expect(e.getStatus()).toBe(422);
      expect(e.getResponse().detalles).toEqual({ disponible: 1, requerida: 2 });
    }
  });

  it.each([0, -3, 2.5])('rechaza la cantidad %p', (cantidad) => {
    expect(() => asignarFefo([lote('A', '2027-01-01', 10)], cantidad, HOY, 'X')).toThrow(
      'mayor que cero',
    );
  });

  it('nunca asigna más de lo que tiene cada lote', () => {
    const lotes = [
      lote('A', '2026-12-01', 7),
      lote('B', '2027-01-15', 9),
      lote('C', '2027-02-01', 4),
    ];
    for (const requerida of [1, 7, 8, 16, 20]) {
      for (const a of asignarFefo(lotes, requerida, HOY, 'X')) {
        expect(a.cantidad).toBeGreaterThan(0);
        expect(a.cantidad).toBeLessThanOrEqual(lotes.find((l) => l.loteId === a.loteId)!.cantidad);
      }
    }
  });
});

describe('vigencia y fechas', () => {
  it('clasifica vigente, por vencer y vencido (RN-04)', () => {
    expect(vigenciaDe(fecha('2027-06-01'), HOY, 90)).toBe('VIGENTE');
    expect(vigenciaDe(fecha('2027-01-09'), HOY, 90)).toBe('POR_VENCER');
    expect(vigenciaDe(fecha('2026-10-11'), HOY, 90)).toBe('POR_VENCER');
    expect(vigenciaDe(fecha('2026-10-10'), HOY, 90)).toBe('VENCIDO');
  });

  it('respeta los días de alerta configurados', () => {
    expect(vigenciaDe(fecha('2026-12-01'), HOY, 30)).toBe('VIGENTE');
    expect(vigenciaDe(fecha('2026-12-01'), HOY, 60)).toBe('POR_VENCER');
  });

  it('calcula los días restantes', () => {
    expect(diasHasta(fecha('2026-10-21'), HOY)).toBe(10);
    expect(diasHasta(fecha('2026-10-01'), HOY)).toBe(-10);
    expect(estaVencido(fecha('2026-10-11'), HOY)).toBe(false);
  });

  it('usa la fecha de Guatemala (UTC-6), no la de UTC', () => {
    // 11 de octubre a las 02:00 UTC todavía es 10 de octubre en Guatemala.
    expect(hoyGuatemala(new Date('2026-10-11T02:00:00Z')).toISOString()).toBe(
      '2026-10-10T00:00:00.000Z',
    );
    expect(hoyGuatemala(new Date('2026-10-11T08:00:00Z')).toISOString()).toBe(
      '2026-10-11T00:00:00.000Z',
    );
  });
});
