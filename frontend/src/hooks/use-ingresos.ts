import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Ingreso {
  id: string;
  periodoId: string;
  monto: MontoDto;
  fechaEfectiva: string;
  fechaRegistro: string;
  nota?: string;
  /** Extensión sobre openapi.yaml (ver backend/README.md, "Editar y eliminar un ingreso") — true si ya se editó o eliminó. */
  revertido: boolean;
}

/** Sin paginación — openapi.yaml no la pide para ingresos (casi siempre pocos por periodo, invariante 12). */
export function useIngresos(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['ingresos', periodoId],
    queryFn: () => apiFetch<Ingreso[]>(`/periodos/${periodoId}/ingresos`),
    enabled: periodoId !== undefined,
  });
}
