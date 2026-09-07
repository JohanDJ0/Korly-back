import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export interface Periodo {
  id: string;
  cuentaId: string;
  estado: 'borrador' | 'activo' | 'cerrado' | 'archivado';
  fechaInicio: string;
  fechaFin: string;
}

/** Sin reintentos por el mismo motivo que use-disponible.ts: un 404 aquí es un estado esperado. */
export function usePeriodoActivo() {
  return useQuery({
    queryKey: ['periodo-activo'],
    queryFn: () => apiFetch<Periodo>('/periodos/activo'),
    retry: false,
  });
}
