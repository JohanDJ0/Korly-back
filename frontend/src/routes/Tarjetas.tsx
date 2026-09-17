import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilaTarjeta } from '@/components/FilaTarjeta';
import { FormularioTarjeta } from '@/components/FormularioTarjeta';
import { useTarjetas } from '@/hooks/use-tarjetas';

/** Mismo patrón que Metas.tsx/Recurrentes.tsx: sin periodo activo no se bloquea la pantalla — dar de alta una tarjeta y ver su deuda no depende de tener uno. */
export function Tarjetas() {
  const { data: tarjetas, isLoading, error } = useTarjetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Tarjetas de crédito</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error.message}</p>}

      {tarjetas?.length === 0 && !mostrarFormulario && <p className="text-muted-foreground">Todavía no tienes ninguna tarjeta registrada.</p>}

      {tarjetas && tarjetas.length > 0 && <ul>{tarjetas.map((tarjeta) => <FilaTarjeta key={tarjeta.id} tarjeta={tarjeta} />)}</ul>}

      {!mostrarFormulario && (
        <Button variant="outline" onClick={() => setMostrarFormulario(true)}>
          Nueva tarjeta
        </Button>
      )}

      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva tarjeta</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioTarjeta onCreada={() => setMostrarFormulario(false)} onCancelar={() => setMostrarFormulario(false)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
