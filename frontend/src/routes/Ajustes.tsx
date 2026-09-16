import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useActualizarPreferencias } from '@/hooks/use-actualizar-preferencias';
import { usePreferencias } from '@/hooks/use-preferencias';

/**
 * Primera y única preferencia hoy (documento-maestro-v2.md §13.4):
 * apagar los recordatorios por correo. Vive en su propia pantalla, no
 * junto a Categorías/Tarjetas/Metas, porque conceptualmente es un
 * ajuste de cuenta, no un catálogo de datos financieros.
 */
export function Ajustes() {
  const { data: preferencias, isLoading, error } = usePreferencias();
  const actualizarPreferencias = useActualizarPreferencias();

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Ajustes</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error.message}</p>}

      {preferencias && (
        <div className="flex items-center gap-2">
          <input
            id="recibir-recordatorios"
            type="checkbox"
            checked={preferencias.recibirRecordatorios}
            onChange={(evento) => actualizarPreferencias.mutate(evento.target.checked)}
            disabled={actualizarPreferencias.isPending}
            className="h-4 w-4"
          />
          <Label htmlFor="recibir-recordatorios">Recibir recordatorios por correo</Label>
        </div>
      )}
      {actualizarPreferencias.isError && <p className="text-sm text-destructive">{actualizarPreferencias.error.message}</p>}
    </div>
  );
}
