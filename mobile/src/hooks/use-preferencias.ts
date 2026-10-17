// Copia de frontend/src/hooks/use-preferencias.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export interface Preferencias {
  recibirRecordatorios: boolean;
}

export function usePreferencias() {
  return useQuery({
    queryKey: ['preferencias'],
    queryFn: () => apiFetch<Preferencias>('/preferencias'),
  });
}
