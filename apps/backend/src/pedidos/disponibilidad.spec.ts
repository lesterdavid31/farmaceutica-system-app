import type { TiempoRuta } from '../mapas/geo';
import { faltantesDe, planearTraslados, Stock, tieneTodo, tiempoEstimado } from './disponibilidad';

const stock = (datos: Record<string, Record<string, number>>): Stock =>
  new Map(Object.entries(datos).map(([u, p]) => [u, new Map(Object.entries(p))]));
const t = (duracionMin: number): TiempoRuta => ({
  distanciaKm: duracionMin / 2,
  duracionMin,
  fuente: 'estimado',
});

const S = stock({
  xela: { amox: 10, ibu: 2 },
  huehue: { amox: 1, ibu: 30 },
  bodega: { amox: 500, ibu: 500, lora: 100 },
  coban: { lora: 5 },
});

describe('tieneTodo y faltantesDe (RN-15)', () => {
  it('una sucursal tiene todo solo si cubre cada producto completo', () => {
    expect(tieneTodo(S, 'xela', [{ productoId: 'amox', cantidad: 10 }])).toBe(true);
    expect(
      tieneTodo(S, 'xela', [
        { productoId: 'amox', cantidad: 10 },
        { productoId: 'ibu', cantidad: 3 },
      ]),
    ).toBe(false);
    expect(tieneTodo(S, 'sin-stock', [{ productoId: 'amox', cantidad: 1 }])).toBe(false);
  });

  it('calcula solo lo que falta', () => {
    expect(
      faltantesDe(S, 'xela', [
        { productoId: 'amox', cantidad: 4 },
        { productoId: 'ibu', cantidad: 5 },
        { productoId: 'lora', cantidad: 1 },
      ]),
    ).toEqual([
      { productoId: 'ibu', cantidad: 3 },
      { productoId: 'lora', cantidad: 1 },
    ]);
  });
});

describe('planearTraslados (RN-17)', () => {
  it('prefiere un solo origen que cubra todo, el más rápido', () => {
    const plan = planearTraslados(
      [{ productoId: 'ibu', cantidad: 3 }],
      S,
      new Map([
        ['bodega', t(180)],
        ['huehue', t(95)],
      ]),
    );
    expect(plan.traslados.map((x) => x.origenId)).toEqual(['huehue']);
    expect(plan.duracionMin).toBe(95);
    expect(plan.sinCubrir).toEqual([]);
  });

  it('si ninguno cubre todo, reparte por producto desde el origen más rápido que lo tenga', () => {
    const stockSinBodega = stock({ huehue: { ibu: 30 }, coban: { lora: 5 } });
    const plan = planearTraslados(
      [
        { productoId: 'ibu', cantidad: 3 },
        { productoId: 'lora', cantidad: 2 },
      ],
      stockSinBodega,
      new Map([
        ['huehue', t(95)],
        ['coban', t(240)],
      ]),
    );
    expect(plan.traslados).toHaveLength(2);
    expect(plan.duracionMin).toBe(240);
  });

  it('informa lo que ninguna ubicación puede cubrir completo', () => {
    const plan = planearTraslados(
      [{ productoId: 'lora', cantidad: 200 }],
      S,
      new Map([['bodega', t(180)]]),
    );
    expect(plan.traslados).toEqual([]);
    expect(plan.sinCubrir).toEqual([{ productoId: 'lora', cantidad: 200 }]);
  });
});

describe('tiempoEstimado (RN-16)', () => {
  it('ruta + preparación', () => {
    expect(tiempoEstimado(12, 15)).toBe(27);
  });

  it('con traslado suma el viaje y la preparación en el origen', () => {
    expect(tiempoEstimado(12, 15, 95)).toBe(12 + 15 + 95 + 15);
  });
});
