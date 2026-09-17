import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { CifraDisponible } from '@/components/CifraDisponible';
import { FormularioGasto } from '@/components/FormularioGasto';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { RecordatorioContextual } from '@/components/RecordatorioContextual';
import { useCerrarPeriodo } from '@/hooks/use-cerrar-periodo';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDisponible } from '@/hooks/use-disponible';
import { usePagosTarjetaPeriodo } from '@/hooks/use-pagos-tarjeta-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { useResumenPendiente } from '@/hooks/use-resumen-pendiente';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
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
  const { data: resumenPendiente } = useResumenPendiente();
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
  const { data: pagosTarjeta } = usePagosTarjetaPeriodo(periodoId);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <img src="/logo/full.svg" alt="Korly" className="h-9" />

      {periodoActivo && (
        // ADR-004: la quincena está anclada a calendario, no es
        // "inicio + 15 días fijos" — si el periodo se creó a mitad de
        // una quincena real (p. ej. al probar la app), los días
        // restantes reales son menos de 15. Mostrar el rango explica
        // por qué, en vez de dejar que el usuario asuma un conteo fijo.
        <p className="text-sm text-muted-foreground">Quincena del {formatearRangoFechas(periodoActivo.fechaInicio, periodoActivo.fechaFin)}</p>
      )}

      {
        // Hallazgo real de un usuario: cerrar un periodo y crear el
        // siguiente sin decidir el sobrante lo dejaba `pendiente` sin
        // ningún aviso — parecía que el dinero simplemente había
        // desaparecido (aunque nunca se pierde: el barrido de N días lo
        // arrastra solo si nadie decide). Este aviso es la corrección.
      }
      {resumenPendiente && (
        <Card className="w-full max-w-sm border-brand-gold/60 bg-brand-gold/10 dark:bg-brand-gold/15">
          <CardContent className="flex flex-col gap-2 pt-6">
            <p className="text-sm">
              Tienes un sobrante de <span className="font-semibold">{formatearMonto(resumenPendiente.sobrante)}</span> sin decidir de un
              periodo anterior.
            </p>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link to={`/resumen/${resumenPendiente.periodoId}`}>Decidir ahora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {
        // Hallazgo real (el usuario preguntó si el pago de tarjeta se
        // descuenta solo o hay que agregarlo a mano): sí es automático,
        // pero antes no había ningún aviso — un 'pago_tarjeta' nunca
        // aparece en el listado de gastos (es un tipo de movimiento
        // distinto), así que el disponible bajaba sin ninguna
        // explicación visible. Este aviso es la corrección.
      }
      {pagosTarjeta && pagosTarjeta.length > 0 && (
        <Card className="w-full max-w-sm border-primary/40 bg-primary/5 dark:bg-primary/10">
          <CardContent className="flex flex-col gap-2 pt-6">
            <p className="text-sm font-medium">
              Esta quincena ya se aplicaron {pagosTarjeta.length} pago{pagosTarjeta.length === 1 ? '' : 's'} de tarjeta a tu disponible:
            </p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {pagosTarjeta.map((pago, indice) => (
                <li key={indice}>
                  {pago.tarjetaNombre} — {pago.cargoDescripcion} ({pago.numeroPago}/{pago.numeroPlazos}): {formatearMonto(pago.monto)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
      {!error && data?.estado === 'ok' && <RecordatorioContextual disponible={data} />}

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

      {
        // Sin gate en periodoId a propósito: el historial puede seguir
        // teniendo periodos anteriores que ver aunque ahora mismo no
        // haya uno activo (p. ej. justo después de cerrar el último).
      }
      <Button asChild variant="link" size="sm">
        <Link to="/historial">Ver historial</Link>
      </Button>
      <Button asChild variant="link" size="sm">
        <Link to="/metas">Ver metas</Link>
      </Button>
      <Button asChild variant="link" size="sm">
        <Link to="/recurrentes">Gastos recurrentes</Link>
      </Button>
      <Button asChild variant="link" size="sm">
        <Link to="/tarjetas">Tarjetas de crédito</Link>
      </Button>
      <Button asChild variant="link" size="sm">
        <Link to="/categorias">Categorías</Link>
      </Button>
      <Button asChild variant="link" size="sm">
        <Link to="/ajustes">Ajustes</Link>
      </Button>

      {periodoId && (
        <BotonConfirmar
          variant="outline"
          size="sm"
          disabled={cerrarPeriodo.isPending}
          pregunta="¿Cerrar este periodo ahora? No se puede deshacer."
          onConfirmar={() => {
            cerrarPeriodo.mutate(periodoId, {
              onSuccess: (resumen) => navigate(`/resumen/${resumen.periodoId}`),
            });
          }}
        >
          {cerrarPeriodo.isPending ? 'Cerrando…' : 'Cerrar periodo'}
        </BotonConfirmar>
      )}
      {cerrarPeriodo.isError && <p className="text-sm text-destructive">{cerrarPeriodo.error.message}</p>}

      <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
