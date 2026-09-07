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
 * "Capa HTTP", simplificación consciente). Sin reintentos por el mismo
 * motivo que el resto de las queries de este proyecto: un 404 es un
 * estado del dominio, no una falla transitoria.
 */
export function useResumen(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['resumen', periodoId],
    queryFn: () => apiFetch<Resumen>(`/periodos/${periodoId}/resumen`),
    enabled: periodoId !== undefined,
    retry: false,
  });
}
