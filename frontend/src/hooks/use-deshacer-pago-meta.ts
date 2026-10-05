import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/**
 * Deshace un pago hecho con la meta (el dinero vuelve a la meta, no a la quincena: nunca salió de ahí) o un
 * aporte externo (el dinero sale de la meta; el backend lo rechaza si la meta ya no lo tiene).
 */
export function useDeshacerPagoMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, movimientoId, tipo }: { metaId: string; movimientoId: string; tipo: 'pago' | 'deposito' }) =>
      apiFetch<void>(`/metas/${metaId}/${tipo === 'pago' ? 'pagos' : 'depositos'}/${movimientoId}`, { method: 'DELETE' }),
    onSuccess: (_resultado, { metaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['movimientos-meta', metaId] });
    },
  });
}
