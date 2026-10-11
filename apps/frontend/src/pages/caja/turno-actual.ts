import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TurnoCajaDetalle } from '@/lib/dominio';

/** Turno abierto del cajero (o `null`), compartido por la caja y el punto de venta. */
export function useTurnoActual() {
  return useQuery({
    queryKey: ['caja', 'turno-actual'],
    queryFn: () => api.get<TurnoCajaDetalle | null>('/caja/turno-actual'),
  });
}
