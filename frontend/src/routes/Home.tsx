import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CifraDisponible } from '@/components/CifraDisponible';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDisponible } from '@/hooks/use-disponible';
import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * El aha moment del producto (documento-maestro-v2.md §13.3): ver la
 * primera cifra de disponible. Tres estados posibles, en orden de
 * onboarding — sin periodo activo, con periodo pero sin ingreso, y con
 * la cifra real — nunca una mezcla ni un $0 disfrazado de cálculo real.
 */
export function Home() {
  const { data, isLoading, error } = useDisponible();
  const crearPeriodo = useCrearPeriodo();

  const sinPeriodoActivo = error instanceof ApiError && error.codigo === 'PERIODO_NO_ENCONTRADO';
  const errorInesperado = error && !sinPeriodoActivo;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Korly</h1>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}

      {errorInesperado && <p className="text-destructive">{error.message}</p>}

      {sinPeriodoActivo && (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Empecemos</CardTitle>
            <CardDescription>Crea tu periodo quincenal para empezar a ver cuánto puedes gastar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => crearPeriodo.mutate()} disabled={crearPeriodo.isPending} className="w-full">
              {crearPeriodo.isPending ? 'Creando…' : 'Crear periodo'}
            </Button>
            {crearPeriodo.isError && <p className="mt-2 text-sm text-destructive">{crearPeriodo.error.message}</p>}
          </CardContent>
        </Card>
      )}

      {!error && data?.estado === 'sin_ingreso' && (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Registra tu ingreso</CardTitle>
            <CardDescription>Para ver cuánto puedes gastar hoy, necesitamos saber cuánto recibiste.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioIngreso periodoId={data.periodoId} />
          </CardContent>
        </Card>
      )}

      {!error && data?.estado === 'ok' && <CifraDisponible disponible={data} />}

      <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
