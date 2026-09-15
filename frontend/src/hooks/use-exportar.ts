import { useMutation } from '@tanstack/react-query';

import { descargarArchivo } from '@/lib/api';

type TipoExportacion = 'gastos' | 'ingresos';

/** Descarga directa (ver lib/api.ts, descargarArchivo) — sin invalidar ninguna query, no cambia estado del servidor. */
export function useExportar() {
  return useMutation({
    mutationFn: (tipo: TipoExportacion) => descargarArchivo(`/exportar/${tipo}.csv`, `${tipo}.csv`),
  });
}
