import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Categoria } from '@/hooks/use-categorias';

export function useCrearCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (nombre: string) => apiFetch<Categoria>('/categorias', { method: 'POST', body: JSON.stringify({ nombre }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
  });
}
