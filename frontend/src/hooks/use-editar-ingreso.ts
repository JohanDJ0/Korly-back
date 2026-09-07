import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface EditarIngresoInput {
  ingresoId: string;
  monto: MontoDto;
}

interface EditarIngresoResultado {
  ingreso: { id: string; periodoId: string; monto: MontoDto };
  ajusteGenerado: boolean;
  periodoDelAjuste: string | null;
}

/** Espejo exacto de use-editar-gasto.ts — mismo motivo para invalidar `['ingresos']` sin el `periodoId`. */
export function useEditarIngreso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ingresoId, monto }: EditarIngresoInput) =>
      apiFetch<EditarIngresoResultado>(`/ingresos/${ingresoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ monto }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['ingresos'] });
    },
  });
}
