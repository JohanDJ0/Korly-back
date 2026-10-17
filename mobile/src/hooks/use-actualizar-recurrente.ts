// Copia de frontend/src/hooks/use-actualizar-recurrente.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';
import type { FrecuenciaRecurrente, GastoRecurrente } from '@/hooks/use-recurrentes';

interface ActualizarRecurrenteInput {
  recurrenteId: string;
  activo?: boolean;
  descripcion?: string;
  monto?: MontoDto;
  /** `null` le quita la categoría. */
  categoriaId?: string | null;
  frecuencia?: FrecuenciaRecurrente;
  /** Solo con frecuencia mensual; `null` al pasar a quincenal. */
  diaMes?: number | null;
}

/**
 * Pausar/reanudar y editar un recurrente (ver FilaRecurrente.tsx). Editar cambia la plantilla: aplica desde el próximo
 * cobro y no toca los gastos ya cobrados (backend, `actualizarGastoRecurrente`).
 */
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
