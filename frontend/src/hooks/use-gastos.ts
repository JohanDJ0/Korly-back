import { useInfiniteQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Gasto {
  id: string;
  periodoId: string;
  monto: MontoDto;
  fechaEfectiva: string;
  fechaRegistro: string;
  nota?: string;
  /** Extensión sobre openapi.yaml (ver backend/README.md, "Listar gastos") — true si ya se editó o eliminó. */
  revertido: boolean;
}

interface GastosPagina {
  datos: Gasto[];
  siguienteCursor: string | null;
}

/**
 * Paginado por keyset (ver backend/README.md, "Listar gastos") — el
 * cursor es opaco, solo se reenvía tal cual lo dio el servidor. Un
 * gasto editado o eliminado sigue apareciendo aquí con su monto
 * original (nunca hard delete) — `revertido` distingue esas filas para
 * que la pantalla las muestre atenuadas y sin acciones (ver FilaGasto.tsx).
 */
export function useGastos(periodoId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['gastos', periodoId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
      const query = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : '';
      return apiFetch<GastosPagina>(`/periodos/${periodoId}/gastos${query}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.siguienteCursor ?? undefined,
    enabled: periodoId !== undefined,
  });
}
