// Copia de frontend/src/hooks/use-eliminar-atajo.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarAtajo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (atajoId: string) => apiFetch<void>(`/atajos-gasto/${atajoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atajos-gasto'] });
    },
  });
}
