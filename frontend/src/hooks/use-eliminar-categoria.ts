import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoriaId: string) => apiFetch<void>(`/categorias/${categoriaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
  });
}
