// Copia de frontend/src/hooks/use-eliminar-ingreso.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export function useEliminarIngreso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ingresoId: string) => apiFetch<void>(`/ingresos/${ingresoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['desglose'] });
      void queryClient.invalidateQueries({ queryKey: ['ingresos'] });
    },
  });
}
