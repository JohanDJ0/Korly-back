import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Meta } from '@/hooks/use-metas';
import type { MontoDto } from '@/lib/dinero';

interface CrearMetaInput {
  nombre: string;
  montoObjetivo: MontoDto;
}

export function useCrearMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CrearMetaInput) => apiFetch<Meta>('/metas', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] });
    },
  });
}
