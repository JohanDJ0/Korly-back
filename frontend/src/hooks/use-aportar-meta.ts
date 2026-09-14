import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface AportarMetaInput {
  metaId: string;
  monto: MontoDto;
}

interface AporteResultado {
  id: string;
  metaId: string;
  monto: MontoDto;
  periodoOrigenId: string;
}

/** Reduce el disponible del periodo activo (backend/README.md, "Metas de ahorro") — invalida ambas queries. */
export function useAportarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, monto }: AportarMetaInput) =>
      apiFetch<AporteResultado>(`/metas/${metaId}/aportes`, { method: 'POST', body: JSON.stringify({ monto }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
