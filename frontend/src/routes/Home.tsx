import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CifraDisponible } from '@/components/CifraDisponible';
import { FormularioGasto } from '@/components/FormularioGasto';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { useCerrarPeriodo } from '@/hooks/use-cerrar-periodo';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDisponible } from '@/hooks/use-disponible';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { ApiError } from '@/lib/api';
import { formatearRangoFechas } from '@/lib/fechas';
import { supabase } from '@/lib/supabase';

/**
 * El aha moment del producto (documento-maestro-v2.md §13.3): ver la
 * primera cifra de disponible. Tres estados posibles, en orden de
 * onboarding — sin periodo activo, con periodo pero sin ingreso, y con
 * la cifra real — nunca una mezcla ni un $0 disfrazado de cálculo real.
 */
export function Home() {
  const { data, isLoading, error } = useDisponible();
  const { data: periodoActivo } = usePeriodoActivo();
  const crearPeriodo = useCrearPeriodo();
  const cerrarPeriodo = useCerrarPeriodo();
  const navigate = useNavigate();
  const [mostrarFormularioGasto, setMostrarFormularioGasto] = useState(false);

  const sinPeriodoActivo = error instanceof ApiError && error.codigo === 'PERIODO_NO_ENCONTRADO';
  const errorInesperado = error && !sinPeriodoActivo;
  // Un gasto se puede registrar con o sin ingreso todavía (modelo-dominio.md
  // §5: "captura de gastos no se bloquea" en sin_ingreso) — el único
  // requisito real es tener un periodo activo, que es justo cuando `data`
  // existe sin error.
  const periodoId = !error ? data?.periodoId : undefined;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Korly</h1>

      {periodoActivo && (
        // ADR-004: la quincena está anclada a calendario, no es
        // "inicio + 15 días fijos" — si el periodo se creó a mitad de
        // una quincena real (p. ej. al probar la app), los días
        // restantes reales son menos de 15. Mostrar el rango explica
        // por qué, en vez de dejar que el usuario asuma un conteo fijo.
        <p className="text-sm text-muted-foreground">Quincena del {formatearRangoFechas(periodoActivo.fechaInicio, periodoActivo.fechaFin)}</p>
      )}

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

      {periodoId && !mostrarFormularioGasto && (
        <Button onClick={() => setMostrarFormularioGasto(true)} className="w-full max-w-sm">
          Registrar gasto
        </Button>
      )}

      {periodoId && mostrarFormularioGasto && (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Nuevo gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioGasto periodoId={periodoId} onRegistrado={() => setMostrarFormularioGasto(false)} />
          </CardContent>
        </Card>
      )}

      {periodoId && (
        <Button asChild variant="link" size="sm">
          <Link to="/historial">Ver historial</Link>
        </Button>
      )}

      {periodoId && (
        <Button
          variant="outline"
          size="sm"
          disabled={cerrarPeriodo.isPending}
          onClick={() => {
            if (!window.confirm('¿Cerrar este periodo ahora? No se puede deshacer.')) return;
            cerrarPeriodo.mutate(periodoId, {
              onSuccess: (resumen) => navigate(`/resumen/${resumen.periodoId}`),
            });
          }}
        >
          {cerrarPeriodo.isPending ? 'Cerrando…' : 'Cerrar periodo'}
        </Button>
      )}
      {cerrarPeriodo.isError && <p className="text-sm text-destructive">{cerrarPeriodo.error.message}</p>}

      <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
