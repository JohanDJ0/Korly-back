import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export interface Categoria {
  id: string;
  nombre: string;
  esPredeterminada: boolean;
}

/** Predeterminadas primero, alfabético dentro de cada grupo (ver backend/README.md, "Categorías"). */
export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: () => apiFetch<Categoria[]>('/categorias'),
  });
}
