import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface DecidirSobranteInput {
  periodoId: string;
  decision: 'ahorrar' | 'arrastrar';
}

interface DecisionResultado {
  periodoId: string;
  decision: 'ahorrado' | 'arrastrado';
  montoAplicado: MontoDto;
}

/** 'ahorrar' responde 501 NO_SOPORTADO — no existe el módulo de metas todavía (ver backend/README.md). */
export function useDecidirSobrante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ periodoId, decision }: DecidirSobranteInput) =>
      apiFetch<DecisionResultado>(`/periodos/${periodoId}/sobrante/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    onSuccess: (_resultado, { periodoId }) => {
      void queryClient.invalidateQueries({ queryKey: ['resumen', periodoId] });
    },
  });
}
