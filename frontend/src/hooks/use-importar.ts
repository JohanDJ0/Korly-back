import { useMutation, useQueryClient } from '@tanstack/react-query';

import { importarCsv } from '@/lib/api';

type TipoImportacion = 'gastos' | 'ingresos';

export interface ErrorImportacion {
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacion {
  creados: number;
  errores: ErrorImportacion[];
}

interface ImportarInput {
  tipo: TipoImportacion;
  periodoId: string;
  csvTexto: string;
}

/** Solo contra el periodo activo (backend/README.md, "Importación") — invalida gastos/ingresos de ESE periodo para que la lista se refresque sola. */
export function useImportar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tipo, periodoId, csvTexto }: ImportarInput) =>
      importarCsv<ResultadoImportacion>(`/periodos/${periodoId}/${tipo}/importar`, csvTexto),
    onSuccess: (_datos, { tipo, periodoId }) => {
      void queryClient.invalidateQueries({ queryKey: [tipo, periodoId] });
      void queryClient.invalidateQueries({ queryKey: ['periodo-activo'] });
      void queryClient.invalidateQueries({ queryKey: ['disponible'] });
    },
  });
}
