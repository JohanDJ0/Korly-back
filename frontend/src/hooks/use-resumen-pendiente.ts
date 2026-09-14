import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Resumen } from '@/hooks/use-resumen';

/**
 * Extensión sobre openapi.yaml (ver backend/README.md, "Aviso de
 * sobrante pendiente") — avisa proactivamente si hay un sobrante sin
 * decidir de un periodo cerrado, sin que el usuario tenga que
 * recordarlo ni ir a buscarlo en "Periodos anteriores". `null` es la
 * respuesta normal (nada pendiente), no un error.
 */
export function useResumenPendiente() {
  return useQuery({
    queryKey: ['resumen-pendiente'],
    queryFn: () => apiFetch<Resumen | null>('/resumenes/pendiente'),
  });
}
