import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useImportar, type ResultadoImportacion } from '@/hooks/use-importar';

interface FormularioImportarProps {
  tipo: 'gastos' | 'ingresos';
  periodoId: string;
}

const ETIQUETA: Record<FormularioImportarProps['tipo'], string> = {
  gastos: 'Importar gastos (CSV)',
  ingresos: 'Importar ingresos (CSV)',
};

/**
 * Solo aplica al periodo activo (backend/README.md, "Importación") —
 * quien renderiza este componente ya se asegura de eso, no hace falta
 * repetir la validación aquí. Lee el archivo con `FileReader` en vez de
 * mandarlo como `multipart/form-data`: el backend espera texto plano
 * (`Content-Type: text/csv`), así que basta con leer el contenido en el
 * navegador antes de mandarlo.
 */
export function FormularioImportar({ tipo, periodoId }: FormularioImportarProps) {
  const importar = useImportar();
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onArchivoSeleccionado(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setResultado(null);

    const lector = new FileReader();
    lector.onload = () => {
      const csvTexto = lector.result as string;
      importar.mutate(
        { tipo, periodoId, csvTexto },
        {
          onSuccess: (datos) => setResultado(datos),
        }
      );
    };
    lector.readAsText(archivo);

    // Permite volver a elegir el mismo archivo dos veces seguidas (si
    // no se limpia, el navegador no dispara `onChange` la segunda vez
    // con idéntico nombre de archivo).
    evento.target.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onArchivoSeleccionado} className="hidden" />
      <Button variant="outline" size="sm" disabled={importar.isPending} onClick={() => inputRef.current?.click()}>
        {importar.isPending ? 'Importando…' : ETIQUETA[tipo]}
      </Button>
      {importar.isError && <p className="text-sm text-destructive">{importar.error.message}</p>}
      {resultado && (
        <div className="text-sm">
          <p className={resultado.errores.length > 0 ? 'text-muted-foreground' : 'text-primary'}>
            {resultado.creados} fila{resultado.creados === 1 ? '' : 's'} importada{resultado.creados === 1 ? '' : 's'}
            {resultado.errores.length > 0 && `, ${resultado.errores.length} con error`}
          </p>
          {resultado.errores.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-destructive">
              {resultado.errores.map((error) => (
                <li key={error.fila}>
                  Fila {error.fila}: {error.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
