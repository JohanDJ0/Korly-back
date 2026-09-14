import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface DecidirSobranteInput {
  periodoId: string;
  decision: 'ahorrar' | 'arrastrar';
  /** Obligatorio si decision = 'ahorrar' (ver backend/README.md, "Metas de ahorro"). */
  metaId?: string;
}

interface DecisionResultado {
  periodoId: string;
  decision: 'ahorrado' | 'arrastrado';
  montoAplicado: MontoDto;
}

/**
 * 'ahorrar' reclama el sobrante de inmediato hacia la meta elegida, en
 * la misma operación de decidir — a diferencia de 'arrastrar', no hace
 * falta esperar a que exista un periodo siguiente. Por eso invalida
 * `['metas']` también, no solo el resumen de este periodo.
 */
export function useDecidirSobrante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ periodoId, decision, metaId }: DecidirSobranteInput) =>
      apiFetch<DecisionResultado>(`/periodos/${periodoId}/sobrante/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, metaId }),
      }),
    onSuccess: (_resultado, { periodoId }) => {
      void queryClient.invalidateQueries({ queryKey: ['resumen', periodoId] });
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['resumen-pendiente'] });
    },
  });
}
