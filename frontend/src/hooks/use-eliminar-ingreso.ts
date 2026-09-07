import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarIngreso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ingresoId: string) => apiFetch<void>(`/ingresos/${ingresoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['ingresos'] });
    },
  });
}
