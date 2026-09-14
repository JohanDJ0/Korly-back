import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Meta {
  id: string;
  nombre: string;
  montoObjetivo: MontoDto;
  montoAcumulado: MontoDto;
  /** Puede pasar de 100 si se aportó más del objetivo — no se recorta, es información real (ver backend/README.md). */
  porcentajeAvance: number;
}

/** Extensión sobre openapi.yaml en cuanto a cuándo se recalcula: `montoAcumulado`/`porcentajeAvance` nunca se cachean, se leen del ledger en cada consulta. */
export function useMetas() {
  return useQuery({
    queryKey: ['metas'],
    queryFn: () => apiFetch<Meta[]>('/metas'),
  });
}
