import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/**
 * Deshace un cierre hecho por error (backend ADR-009). El backend decide si
 * todavía se puede (el sobrante no debe haberse destinado, no debe haber
 * actividad posterior, la quincena no debe haber terminado) y responde 409
 * con la razón en el mensaje — la pantalla la muestra tal cual.
 */
export function useReabrirPeriodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (periodoId: string) => apiFetch<{ periodoId: string; estado: 'activo' }>(`/periodos/${periodoId}/reabrir`, { method: 'POST' }),
    onSuccess: (_resultado, periodoId) => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['desglose'] });
      void queryClient.invalidateQueries({ queryKey: ['periodo-activo'] });
      void queryClient.invalidateQueries({ queryKey: ['periodos'] });
      void queryClient.invalidateQueries({ queryKey: ['resumen-pendiente'] });
      void queryClient.invalidateQueries({ queryKey: ['gastos'] });
      void queryClient.invalidateQueries({ queryKey: ['ingresos'] });
      queryClient.removeQueries({ queryKey: ['resumen', periodoId] });
    },
  });
}
