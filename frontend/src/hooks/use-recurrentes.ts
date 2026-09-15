import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export type FrecuenciaRecurrente = 'quincenal' | 'mensual';

export interface GastoRecurrente {
  id: string;
  descripcion: string;
  monto: MontoDto;
  categoriaId?: string | null;
  frecuencia: FrecuenciaRecurrente;
  diaMes: number | null;
  activo: boolean;
}

/** Activos primero (ver backend/README.md, "Gastos recurrentes") — los pausados quedan al final, no ocultos. */
export function useRecurrentes() {
  return useQuery({
    queryKey: ['gastos-recurrentes'],
    queryFn: () => apiFetch<GastoRecurrente[]>('/gastos-recurrentes'),
  });
}
