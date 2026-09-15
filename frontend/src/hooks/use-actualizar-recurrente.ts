import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { GastoRecurrente } from '@/hooks/use-recurrentes';

interface ActualizarRecurrenteInput {
  recurrenteId: string;
  activo?: boolean;
}

/** Usado hoy solo para pausar/reanudar (ver FilaRecurrente.tsx) — el PATCH del backend admite más campos, sin cliente todavía que los use. */
export function useActualizarRecurrente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recurrenteId, ...body }: ActualizarRecurrenteInput) =>
      apiFetch<GastoRecurrente>(`/gastos-recurrentes/${recurrenteId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gastos-recurrentes'] });
    },
  });
}
