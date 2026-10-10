import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { MontoDto } from '@/lib/dinero';

export interface Atajo {
  id: string;
  nombre: string;
  monto: MontoDto;
  categoriaId: string | null;
}

export interface ListaAtajos {
  atajos: Atajo[];
  /** Cuántos puede tener según su plan (Free 3, Pro 12) — para mostrar "2 de 3". */
  limite: number;
}

/** En el orden en que se crearon (ver backend/README.md, "Atajos de gasto"). */
export function useAtajos() {
  return useQuery({
    queryKey: ['atajos-gasto'],
    queryFn: () => apiFetch<ListaAtajos>('/atajos-gasto'),
  });
}
