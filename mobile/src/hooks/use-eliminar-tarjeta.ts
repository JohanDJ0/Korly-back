// Copia de frontend/src/hooks/use-eliminar-tarjeta.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarTarjeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tarjetaId: string) => apiFetch<void>(`/tarjetas/${tarjetaId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tarjetas'] });
    },
  });
}
