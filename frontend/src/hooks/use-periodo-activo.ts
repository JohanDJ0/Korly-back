import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export interface Periodo {
  id: string;
  cuentaId: string;
  estado: 'borrador' | 'activo' | 'cerrado' | 'archivado' | 'descartado';
  fechaInicio: string;
  fechaFin: string;
  /** Extensión sobre openapi.yaml — distingue dos periodos con el mismo rango de fechas (ver Historial.tsx). */
  creadoEn: string;
}

/** Un 404 aquí es un estado esperado y no se reintenta; un fallo del servidor sí (ver use-disponible.ts y lib/query-client.ts). */
export function usePeriodoActivo() {
  return useQuery({
    queryKey: ['periodo-activo'],
    queryFn: () => apiFetch<Periodo>('/periodos/activo'),
  });
}
