import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface DepositarMetaInput {
  metaId: string;
  monto: MontoDto;
  /** Opcional: de dónde venía el dinero ("ahorro que ya tenía", "regalo"). */
  motivo?: string;
}

interface DepositoResultado {
  id: string;
  metaId: string;
  monto: MontoDto;
  motivo: string | null;
}

/**
 * Aporte externo: dinero que ya existía fuera de la app y entra directo a la meta. No toca la
 * quincena (ni el disponible, ni el resumen, ni el desglose), así que solo se invalidan la meta y su historial.
 */
export function useDepositarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, ...body }: DepositarMetaInput) =>
      apiFetch<DepositoResultado>(`/metas/${metaId}/depositos`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_resultado, { metaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['movimientos-meta', metaId] });
    },
  });
}
