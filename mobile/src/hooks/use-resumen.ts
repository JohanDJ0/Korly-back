// Copia de frontend/src/hooks/use-resumen.ts (sin cambios; regenerar con mobile/herramientas/copiar-de-la-web.mjs). Fase 3: paquete compartido.
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Resumen {
  periodoId: string;
  totalIngresos: MontoDto;
  totalGastado: MontoDto;
  sobrante: MontoDto;
  decisionSobrante: 'pendiente' | 'ahorrado' | 'arrastrado';
  generadoEn: string;
}

/**
 * 404 aquí significa "el periodo no existe O todavía no está cerrado"
 * — el backend no distingue los dos casos (ver backend/README.md,
 * "Capa HTTP", simplificación consciente). Un 404 es un estado del
 * dominio, no una falla transitoria: no se reintenta; un 5xx o un fallo de
 * red sí, lo decide el QueryClient de la app (lib/query-client.ts).
 */
export function useResumen(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['resumen', periodoId],
    queryFn: () => apiFetch<Resumen>(`/periodos/${periodoId}/resumen`),
    enabled: periodoId !== undefined,
  });
}
