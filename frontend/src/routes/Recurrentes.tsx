import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilaRecurrente } from '@/components/FilaRecurrente';
import { FormularioRecurrente } from '@/components/FormularioRecurrente';
import { useRecurrentes } from '@/hooks/use-recurrentes';

/** Mismo patrón que Metas.tsx: sin periodo activo no se bloquea la pantalla, ver/crear/pausar recurrentes no depende de tener uno. */
export function Recurrentes() {
  const { data: recurrentes, isLoading, error } = useRecurrentes();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Gastos recurrentes</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error.message}</p>}

      {recurrentes?.length === 0 && !mostrarFormulario && (
        <p className="text-muted-foreground">Todavía no tienes ninguna suscripción o gasto recurrente registrado.</p>
      )}

      {recurrentes && recurrentes.length > 0 && (
        <ul>
          {recurrentes.map((recurrente) => (
            <FilaRecurrente key={recurrente.id} recurrente={recurrente} />
          ))}
        </ul>
      )}

      {!mostrarFormulario && (
        <Button variant="outline" onClick={() => setMostrarFormulario(true)}>
          Nuevo gasto recurrente
        </Button>
      )}

      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo gasto recurrente</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioRecurrente onCreado={() => setMostrarFormulario(false)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
