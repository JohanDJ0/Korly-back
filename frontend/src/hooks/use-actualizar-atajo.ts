import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Atajo } from '@/hooks/use-atajos';
import type { MontoDto } from '@/lib/dinero';

interface ActualizarAtajoInput {
  atajoId: string;
  nombre?: string;
  monto?: MontoDto;
  /** `null` quita la categoría; sin mandarla, se conserva. */
  categoriaId?: string | null;
}

export function useActualizarAtajo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ atajoId, ...body }: ActualizarAtajoInput) => apiFetch<Atajo>(`/atajos-gasto/${atajoId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atajos-gasto'] });
    },
  });
}
