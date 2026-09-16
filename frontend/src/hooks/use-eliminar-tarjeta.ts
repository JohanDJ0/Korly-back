import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarTarjeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tarjetaId: string) => apiFetch<void>(`/tarjetas/${tarjetaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
    },
  });
}
