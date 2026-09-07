import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarGasto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gastoId: string) => apiFetch<void>(`/gastos/${gastoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['gastos'] });
    },
  });
}
