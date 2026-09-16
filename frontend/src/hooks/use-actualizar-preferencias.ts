import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Preferencias } from '@/hooks/use-preferencias';

export function useActualizarPreferencias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recibirRecordatorios: boolean) =>
      apiFetch<Preferencias>('/preferencias', { method: 'PATCH', body: JSON.stringify({ recibirRecordatorios }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['preferencias'] });
    },
  });
}
