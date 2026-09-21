import { AlertTriangle, CreditCard, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActividadReciente } from '@/components/ActividadReciente';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { BottomNav } from '@/components/BottomNav';
import { CifraDisponible } from '@/components/CifraDisponible';
import { FormularioGasto } from '@/components/FormularioGasto';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { HojaInferior } from '@/components/HojaInferior';
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

/**
 * El aha moment del producto (documento-maestro-v2.md §13.3): ver la
 * primera cifra de disponible. Tres estados posibles, en orden de
 * onboarding — sin periodo activo, con periodo pero sin ingreso, y con
 * la cifra real — nunca una mezcla ni un $0 disfrazado de cálculo real.
 *
 * En escritorio, la navegación (logo, Ajustes) ya la da Sidebar.tsx
 * (montada en ProtectedRoute.tsx) — la barra propia de esta pantalla es
 * solo para móvil (`md:hidden`). La actividad reciente pasa a columna
 * lateral (`md:grid-cols-[1fr_360px]`) en vez de apilarse debajo del
 * CTA; en móvil el grid colapsa a una sola columna y el orden queda
 * idéntico al de antes.
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
    <div className="mx-auto flex min-h-svh max-w-sm flex-col md:max-w-4xl md:px-8 md:pt-8">
      <div className="flex items-center justify-between px-5 pt-5 pb-1 md:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo/icon.svg" alt="" className="h-[30px] w-[30px] rounded-[9px]" />
          <span className="font-display text-base font-bold">Korly</span>
        </div>
        <Button asChild variant="outline" size="icon" className="border-input h-9 w-9 rounded-full">
          <Link to="/ajustes" aria-label="Ajustes">
            <Settings size={17} className="text-muted-foreground" />
          </Link>
        </Button>
      </div>

      {periodoActivo && (
        // ADR-004: la quincena está anclada a calendario, no es
        // "inicio + 15 días fijos" — si el periodo se creó a mitad de
        // una quincena real (p. ej. al probar la app), los días
        // restantes reales son menos de 15. Mostrar el rango explica
        // por qué, en vez de dejar que el usuario asuma un conteo fijo.
        <p className="text-muted-foreground px-5 pb-2 text-[13px] md:px-0 md:pb-5 md:text-sm">
          Quincena · {formatearRangoFechas(periodoActivo.fechaInicio, periodoActivo.fechaFin)}
        </p>
      )}

      <div className="flex flex-col gap-3.5 px-5 pt-2 pb-4 md:grid md:grid-cols-[1fr_360px] md:items-start md:gap-8 md:px-0 md:pt-0">
        <div className="flex flex-col gap-3.5">
          {
            // Hallazgo real de un usuario: cerrar un periodo y crear el
            // siguiente sin decidir el sobrante lo dejaba `pendiente` sin
            // ningún aviso — parecía que el dinero simplemente había
            // desaparecido (aunque nunca se pierde: el barrido de N días lo
            // arrastra solo si nadie decide). Este aviso es la corrección.
          }
          {resumenPendiente && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-[#F6DE9E] bg-[#FFF6E1] p-3 dark:border-brand-gold/30 dark:bg-brand-gold/10">
              <div className="bg-brand-gold flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full">
                <AlertTriangle size={15} className="text-[#5A4300]" />
              </div>
              <p className="flex-1 text-[13px] leading-tight">
                Tienes <span className="font-semibold">{formatearMonto(resumenPendiente.sobrante)}</span> sin decidir de un periodo anterior.
              </p>
              <Link to={`/resumen/${resumenPendiente.periodoId}`} className="text-primary shrink-0 text-[13px] font-semibold">
                Decidir →
              </Link>
            </div>
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
            <div className="border-primary/30 bg-primary/5 dark:bg-primary/10 flex flex-col gap-2 rounded-2xl border p-3.5">
              <div className="flex items-center gap-2">
                <CreditCard size={15} className="text-primary shrink-0" />
                <p className="text-[13px] font-medium">
                  {pagosTarjeta.length} pago{pagosTarjeta.length === 1 ? '' : 's'} de tarjeta aplicados esta quincena
                </p>
              </div>
              <ul className="text-muted-foreground flex flex-col gap-1 pl-[23px] text-[12.5px]">
                {pagosTarjeta.map((pago, indice) => (
                  <li key={indice}>
                    {pago.tarjetaNombre} — {pago.cargoDescripcion} ({pago.numeroPago}/{pago.numeroPlazos}): {formatearMonto(pago.monto)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoading && <p className="text-muted-foreground">Cargando…</p>}

          {errorInesperado && <p className="text-destructive">{error.message}</p>}

          {sinPeriodoActivo && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Empecemos</CardTitle>
                <CardDescription>Crea tu periodo quincenal para empezar a ver cuánto puedes gastar.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => crearPeriodo.mutate()} disabled={crearPeriodo.isPending} className="w-full">
                  {crearPeriodo.isPending ? 'Creando…' : 'Crear periodo'}
                </Button>
                {crearPeriodo.isError && <p className="text-destructive mt-2 text-sm">{crearPeriodo.error.message}</p>}
              </CardContent>
            </Card>
          )}

          {!error && data?.estado === 'sin_ingreso' && (
            <Card className="rounded-2xl">
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

          {periodoId && (
            <button
              onClick={() => setMostrarFormularioGasto(true)}
              className="bg-primary text-primary-foreground shadow-primary/30 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15.5px] font-semibold shadow-lg"
            >
              <Plus size={18} strokeWidth={2.5} />
              Registrar gasto
            </button>
          )}
        </div>

        {periodoId && (
          <div className="md:border-border md:bg-card md:rounded-2xl md:border md:p-4">
            <ActividadReciente periodoId={periodoId} />
          </div>
        )}
      </div>

      {
        // Acciones secundarias, poco frecuentes — atenuadas a propósito
        // para no competir con la cifra ni el CTA principal. Fuera del
        // grid a propósito: ocupa el ancho completo en vez de quedar
        // atrapada en la columna izquierda.
      }
      {periodoId && (
        <div className="mt-1 mb-4 flex justify-center px-5 md:px-0">
          <BotonConfirmar
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
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
        </div>
      )}
      {cerrarPeriodo.isError && <p className="text-destructive text-center text-sm">{cerrarPeriodo.error.message}</p>}

      <BottomNav />

      {periodoId && mostrarFormularioGasto && (
        <HojaInferior titulo="Nuevo gasto" onCerrar={() => setMostrarFormularioGasto(false)}>
          <FormularioGasto periodoId={periodoId} onRegistrado={() => setMostrarFormularioGasto(false)} />
        </HojaInferior>
      )}
    </div>
  );
}
