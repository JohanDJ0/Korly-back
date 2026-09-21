import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Categoria } from '@/hooks/use-categorias';

interface ActualizarCategoriaInput {
  categoriaId: string;
  nombre?: string;
  icono?: string | null;
}

/**
 * PATCH real — solo se manda el campo que cambió. Aplica igual a
 * predeterminadas y personalizadas: nombre/ícono son cosméticos, lo
 * único protegido de verdad es "no se puede eliminar una predeterminada"
 * (ver useEliminarCategoria).
 */
export function useActualizarCategoria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoriaId, ...body }: ActualizarCategoriaInput) =>
      apiFetch<Categoria>(`/categorias/${categoriaId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
  });
}
