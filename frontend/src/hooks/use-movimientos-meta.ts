import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface MovimientoMeta {
  id: string;
  tipo: 'aporte' | 'retiro' | 'pago' | 'deposito';
  /** Con signo desde el punto de vista de la meta: positivo entra a la meta, negativo sale. */
  monto: MontoDto;
  fechaEfectiva: string;
  nota: string | null;
  /** true si ya se deshizo (solo los pagos y los aportes externos se pueden deshacer). */
  revertido: boolean;
}

/** Historial de la meta (aportes, retiros a la quincena y pagos), solo se pide cuando el usuario lo expande. */
export function useMovimientosMeta(metaId: string | undefined) {
  return useQuery({
    queryKey: ['movimientos-meta', metaId],
    queryFn: () => apiFetch<MovimientoMeta[]>(`/metas/${metaId}/movimientos`),
    enabled: metaId !== undefined,
  });
}
