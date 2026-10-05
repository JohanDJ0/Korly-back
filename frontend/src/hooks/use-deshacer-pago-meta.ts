import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/** El dinero vuelve a la meta (no a la quincena: el pago nunca salió de ahí). */
export function useDeshacerPagoMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, movimientoId }: { metaId: string; movimientoId: string }) =>
      apiFetch<void>(`/metas/${metaId}/pagos/${movimientoId}`, { method: 'DELETE' }),
    onSuccess: (_resultado, { metaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['movimientos-meta', metaId] });
    },
  });
}
