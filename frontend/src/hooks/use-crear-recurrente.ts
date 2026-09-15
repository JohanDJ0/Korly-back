import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { FrecuenciaRecurrente, GastoRecurrente } from '@/hooks/use-recurrentes';
import type { MontoDto } from '@/lib/dinero';

interface CrearRecurrenteInput {
  descripcion: string;
  monto: MontoDto;
  categoriaId?: string;
  frecuencia: FrecuenciaRecurrente;
  diaMes?: number;
}

export function useCrearRecurrente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CrearRecurrenteInput) => apiFetch<GastoRecurrente>('/gastos-recurrentes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
    },
  });
}
