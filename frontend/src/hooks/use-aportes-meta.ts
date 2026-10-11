import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface AporteDelPeriodo {
  id: string;
  metaId: string;
  metaNombre: string;
  monto: MontoDto;
  fechaEfectiva: string;
  fechaRegistro: string;
}

/**
 * Lo aportado a metas desde la quincena de un periodo (extensión, ver backend/README.md, "Aportes a metas y la cifra del
 * día"). Para "Actividad reciente": un aporte no es un gasto, así que no viene en `useGastos`. Mismas claves que invalidan
 * los gastos y el disponible al aportar (ver use-aportar-meta.ts).
 */
export function useAportesMeta(periodoId: string | undefined) {
  return useQuery({
    queryKey: ['aportes-meta', periodoId],
    queryFn: () => apiFetch<AporteDelPeriodo[]>(`/periodos/${periodoId}/aportes-meta`),
    enabled: periodoId !== undefined,
  });
}
