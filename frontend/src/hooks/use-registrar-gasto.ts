import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface RegistrarGastoInput {
  periodoId: string;
  monto: MontoDto;
  fechaEfectiva: string;
}

interface GastoRegistrado {
  id: string;
  movimientoId: string;
  periodoId: string;
}

/**
 * Mismo patrón que use-registrar-ingreso.ts. El backend permite
 * sobregiro sin bloquear el gasto (modelo-dominio.md §5) — aquí no hay
 * ninguna validación de "saldo suficiente" que replicar.
 */
export function useRegistrarGasto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ periodoId, ...body }: RegistrarGastoInput) =>
      apiFetch<GastoRegistrado>(`/periodos/${periodoId}/gastos`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
