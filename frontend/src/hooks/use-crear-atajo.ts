import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Atajo } from '@/hooks/use-atajos';
import type { MontoDto } from '@/lib/dinero';

interface CrearAtajoInput {
  nombre: string;
  monto: MontoDto;
  categoriaId?: string;
}

export function useCrearAtajo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CrearAtajoInput) => apiFetch<Atajo>('/atajos-gasto', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atajos-gasto'] });
    },
  });
}
