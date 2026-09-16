import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Tarjeta } from '@/hooks/use-tarjetas';
import type { MontoDto } from '@/lib/dinero';

interface CrearTarjetaInput {
  nombre: string;
  limiteCredito: MontoDto;
  diaCorte: number;
  diasParaPago: number;
}

export function useCrearTarjeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CrearTarjetaInput) => apiFetch<Tarjeta>('/tarjetas', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
    },
  });
}
