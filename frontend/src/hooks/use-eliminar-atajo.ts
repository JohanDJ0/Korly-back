import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarAtajo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (atajoId: string) => apiFetch<void>(`/atajos-gasto/${atajoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atajos-gasto'] });
    },
  });
}
