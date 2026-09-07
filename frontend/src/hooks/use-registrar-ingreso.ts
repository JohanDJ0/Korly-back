import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface RegistrarIngresoInput {
  periodoId: string;
  monto: MontoDto;
  fechaEfectiva: string;
  nota?: string;
}

interface IngresoRegistrado {
  id: string;
  movimientoId: string;
  periodoId: string;
}

export function useRegistrarIngreso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ periodoId, ...body }: RegistrarIngresoInput) =>
      apiFetch<IngresoRegistrado>(`/periodos/${periodoId}/ingresos`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
