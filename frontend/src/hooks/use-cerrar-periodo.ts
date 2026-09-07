import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { Resumen } from '@/hooks/use-resumen';

/**
 * Cierre manual — modelo-dominio.md §3 lo describe como automático al
 * pasar `fechaFin` (perezoso), pero también lo prueba así el propio
 * backend ("no hay que esperar 15 días reales", ver backend/README.md,
 * "Cierre"). Exponerlo como botón real, no solo de prueba: cerrar antes
 * de tiempo no rompe ninguna invariante (`cerrarPeriodoManualmente`
 * solo exige que el periodo siga Activo).
 */
export function useCerrarPeriodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (periodoId: string) => apiFetch<Resumen>(`/periodos/${periodoId}/cerrar`, { method: 'POST' }),
    onSuccess: (resumen) => {
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
      void queryClient.invalidateQueries({ queryKey: ['periodo-activo'] });
      queryClient.setQueryData(['resumen', resumen.periodoId], resumen);
    },
  });
}
