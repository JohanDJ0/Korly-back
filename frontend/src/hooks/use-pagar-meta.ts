import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface PagarMetaInput {
  metaId: string;
  monto: MontoDto;
  motivo: string;
}

interface PagoMetaResultado {
  id: string;
  metaId: string;
  monto: MontoDto;
  motivo: string;
}

/**
 * Paga algo directo con el dinero de la meta. No toca la quincena: no cambia
 * el disponible, ni el resumen, ni el desglose — por eso solo se invalidan la
 * meta y su historial.
 */
export function usePagarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, ...body }: PagarMetaInput) =>
      apiFetch<PagoMetaResultado>(`/metas/${metaId}/pagos`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_resultado, { metaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['movimientos-meta', metaId] });
    },
  });
}
