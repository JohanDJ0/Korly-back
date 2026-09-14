import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilaMeta } from '@/components/FilaMeta';
import { FormularioMeta } from '@/components/FormularioMeta';
import { useMetas } from '@/hooks/use-metas';

/** Sin periodo activo no se bloquea la pantalla — se puede crear y ver metas siempre; solo aportar/retirar exigen uno (ver FilaMeta.tsx). */
export function Metas() {
  const { data: metas, isLoading, error } = useMetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Volver</Link>
        </Button>
        <h1 className="text-xl font-semibold">Metas de ahorro</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error.message}</p>}

      {metas?.length === 0 && !mostrarFormulario && <p className="text-muted-foreground">Todavía no tienes ninguna meta.</p>}

      {metas && metas.length > 0 && <ul>{metas.map((meta) => <FilaMeta key={meta.id} meta={meta} />)}</ul>}

      {!mostrarFormulario && (
        <Button variant="outline" onClick={() => setMostrarFormulario(true)}>
          Nueva meta
        </Button>
      )}

      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva meta</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioMeta onCreada={() => setMostrarFormulario(false)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
