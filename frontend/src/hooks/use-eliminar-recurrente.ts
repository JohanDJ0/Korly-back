import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

/**
 * Eliminar un recurrente: deja de cobrarse y de listarse; lo que ya se cobró se queda en el historial (el backend lo marca
 * como eliminado, no borra la fila, ver `eliminarGastoRecurrente`).
 */
export function useEliminarRecurrente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurrenteId: string) => apiFetch<void>(`/gastos-recurrentes/${recurrenteId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
    },
  });
}
