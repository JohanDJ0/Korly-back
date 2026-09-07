import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

interface Periodo {
  id: string;
  cuentaId: string;
  estado: 'borrador' | 'activo' | 'cerrado' | 'archivado';
  fechaInicio: string;
  fechaFin: string;
}

/** 'quincenal' es el único tipo soportado (ADR-004, ver backend) — no hace falta pedirlo. */
export function useCrearPeriodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<Periodo>('/periodos', { method: 'POST', body: JSON.stringify({ tipo: 'quincenal' }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
