import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface EditarGastoInput {
  gastoId: string;
  monto: MontoDto;
}

interface EditarGastoResultado {
  gasto: { id: string; periodoId: string; monto: MontoDto };
  ajusteGenerado: boolean;
  periodoDelAjuste: string | null;
}

/**
 * `['gastos']` sin el `periodoId` como segundo elemento invalida TODAS
 * las páginas de gastos cacheadas, no solo las del periodo activo — a
 * propósito: si el ajuste cruzó a otro periodo (`ajusteGenerado`), ese
 * otro historial (si llegara a estar cacheado) también quedaría
 * desactualizado.
 */
export function useEditarGasto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gastoId, monto }: EditarGastoInput) =>
      apiFetch<EditarGastoResultado>(`/gastos/${gastoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ monto }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['gastos'] });
    },
  });
}
