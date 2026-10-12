import type { TiempoRuta } from '../mapas/geo';

export interface ItemPedido {
  productoId: string;
  cantidad: number;
}

/** Existencia vigente: ubicación → producto → unidades. */
export type Stock = Map<string, Map<string, number>>;

export const vigenteEn = (stock: Stock, ubicacionId: string, productoId: string) =>
  stock.get(ubicacionId)?.get(productoId) ?? 0;

/** RN-15: la sucursal tiene todo el pedido con lotes no vencidos. */
export function tieneTodo(stock: Stock, ubicacionId: string, items: ItemPedido[]) {
  return items.every((i) => vigenteEn(stock, ubicacionId, i.productoId) >= i.cantidad);
}

/** Lo que le falta a una sucursal para completar el pedido. */
export function faltantesDe(stock: Stock, ubicacionId: string, items: ItemPedido[]): ItemPedido[] {
  return items
    .map((i) => ({
      productoId: i.productoId,
      cantidad: i.cantidad - vigenteEn(stock, ubicacionId, i.productoId),
    }))
    .filter((f) => f.cantidad > 0);
}

export interface TrasladoPlaneado {
  origenId: string;
  items: ItemPedido[];
  tiempo: TiempoRuta;
}

export interface PlanTraslados {
  traslados: TrasladoPlaneado[];
  /** Productos que ninguna ubicación puede cubrir completos. */
  sinCubrir: ItemPedido[];
  /** Los traslados viajan en paralelo: el que más tarda define el tiempo. */
  duracionMin: number;
}

/**
 * RN-17: cubre los faltantes de la sucursal con traslados desde otras ubicaciones con existencia
 * vigente. Primero busca un solo origen que cubra todo (el más rápido); si no hay, cubre cada
 * producto desde el origen más rápido que lo tenga completo, agrupando por origen.
 * `tiempos` es el tiempo de ruta de cada origen posible hacia la sucursal.
 */
export function planearTraslados(
  faltantes: ItemPedido[],
  stock: Stock,
  tiempos: Map<string, TiempoRuta>,
): PlanTraslados {
  const porRapidez = [...tiempos.entries()].sort((a, b) => a[1].duracionMin - b[1].duracionMin);
  const cubre = (origenId: string, f: ItemPedido) =>
    vigenteEn(stock, origenId, f.productoId) >= f.cantidad;

  const unico = porRapidez.find(([origenId]) => faltantes.every((f) => cubre(origenId, f)));
  if (unico) {
    return {
      traslados: [{ origenId: unico[0], items: faltantes, tiempo: unico[1] }],
      sinCubrir: [],
      duracionMin: unico[1].duracionMin,
    };
  }

  const grupos = new Map<string, TrasladoPlaneado>();
  const sinCubrir: ItemPedido[] = [];
  for (const f of faltantes) {
    const origen = porRapidez.find(([origenId]) => cubre(origenId, f));
    if (!origen) {
      sinCubrir.push(f);
      continue;
    }
    const grupo = grupos.get(origen[0]) ?? { origenId: origen[0], items: [], tiempo: origen[1] };
    grupo.items.push(f);
    grupos.set(origen[0], grupo);
  }
  const traslados = [...grupos.values()];
  return {
    traslados,
    sinCubrir,
    duracionMin: Math.max(0, ...traslados.map((t) => t.tiempo.duracionMin)),
  };
}

/**
 * RN-16 y RN-17: ruta de la sucursal al cliente + preparación; con traslado, se suma el viaje
 * del traslado más la preparación en el origen.
 */
export function tiempoEstimado(rutaMin: number, preparacionMin: number, trasladoMin?: number) {
  return rutaMin + preparacionMin + (trasladoMin !== undefined ? trasladoMin + preparacionMin : 0);
}
