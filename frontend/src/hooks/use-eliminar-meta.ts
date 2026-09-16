import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (metaId: string) => apiFetch<void>(`/metas/${metaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
    },
  });
}
