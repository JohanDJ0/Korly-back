import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

interface RetirarMetaInput {
  metaId: string;
  monto: MontoDto;
  motivo: string;
}

interface RetiroResultado {
  id: string;
  metaId: string;
  monto: MontoDto;
  motivo: string;
}

/** Aumenta el disponible del periodo activo, tratado como un ingreso más (backend/README.md, "Metas de ahorro"). */
export function useRetirarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, ...body }: RetirarMetaInput) =>
      apiFetch<RetiroResultado>(`/metas/${metaId}/retiros`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
