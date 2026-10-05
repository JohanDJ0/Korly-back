import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';
import type { Meta } from '@/hooks/use-metas';

interface EditarMetaInput {
  metaId: string;
  nombre?: string;
  montoObjetivo?: MontoDto;
}

/** Cambia el nombre y/o el objetivo. El avance se recalcula solo en el backend: nunca se guarda. */
export function useEditarMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ metaId, ...body }: EditarMetaInput) =>
      apiFetch<Meta>(`/metas/${metaId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
    },
  });
}
