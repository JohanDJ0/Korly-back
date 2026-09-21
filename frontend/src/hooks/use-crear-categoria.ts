import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Categoria } from '@/hooks/use-categorias';

interface CrearCategoriaInput {
  nombre: string;
  icono?: string | null;
}

export function useCrearCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrearCategoriaInput) => apiFetch<Categoria>('/categorias', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
  });
}
