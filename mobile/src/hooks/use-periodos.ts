// Copia de frontend/src/hooks/use-periodos.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Periodo } from '@/hooks/use-periodo-activo';

/** Extensión sobre openapi.yaml (ver backend/README.md) — lista todos los periodos del tenant, más reciente primero. */
export function usePeriodos() {
  return useQuery({
    queryKey: ['periodos'],
    queryFn: () => apiFetch<Periodo[]>('/periodos'),
  });
}
