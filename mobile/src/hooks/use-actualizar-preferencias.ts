// Copia de frontend/src/hooks/use-actualizar-preferencias.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Preferencias } from '@/hooks/use-preferencias';

export function useActualizarPreferencias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recibirRecordatorios: boolean) =>
      apiFetch<Preferencias>('/preferencias', { method: 'PATCH', body: JSON.stringify({ recibirRecordatorios }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['preferencias'] });
    },
  });
}
