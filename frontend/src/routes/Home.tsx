import { AlertTriangle, CreditCard, Plus, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActividadReciente } from '@/components/ActividadReciente';
import { AtajosDeGasto } from '@/components/AtajosDeGasto';
import { BottomNav } from '@/components/BottomNav';
import { CargandoKorly } from '@/components/CargandoKorly';
import { CifraDisponible } from '@/components/CifraDisponible';
import { FormularioGasto } from '@/components/FormularioGasto';
import { FormularioIngreso } from '@/components/FormularioIngreso';
import { HojaInferior } from '@/components/HojaInferior';
import { PasoDeGuia, RESALTADO_GUIA } from '@/components/PasoDeGuia';
import { RecordatorioContextual } from '@/components/RecordatorioContextual';
import { ResumenCompactoPeriodo } from '@/components/ResumenCompactoPeriodo';
import { useAtajos, type Atajo } from '@/hooks/use-atajos';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDisponible } from '@/hooks/use-disponible';
import { useGastos } from '@/hooks/use-gastos';
import { useGuia } from '@/hooks/use-guia';
import { usePagosTarjetaPeriodo } from '@/hooks/use-pagos-tarjeta-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { useResumenPendiente } from '@/hooks/use-resumen-pendiente';
import { ApiError } from '@/lib/api';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { formatearRangoFechas, quincenaDeHoy } from '@/lib/fechas';
import { pasoDeInicio, TEXTOS_GUIA } from '@/lib/guia';
import { cn } from '@/lib/utils';

/**
 * El aha moment del producto (documento-maestro-v2.md §13.3): ver la
 * primera cifra de disponible. Tres estados posibles, en orden de
 * onboarding — sin periodo activo, con periodo pero sin ingreso, y con
 * la cifra real — nunca una mezcla ni un $0 disfrazado de cálculo real.
 *
 * En escritorio, la navegación (logo, Ajustes) ya la da Sidebar.tsx
 * (montada en ProtectedRoute.tsx) — la barra propia de esta pantalla es
 * solo para móvil (`sm:hidden`, mismo corte que el sidebar). La
 * actividad reciente pasa a columna lateral (`lg:grid-cols-[1fr_360px]`)
 * en vez de apilarse debajo del CTA — a propósito en `lg` (1024px), no
 * en `sm`/`md`: con el sidebar ya restando 240px, un tablet en ese
 * rango no tiene espacio real para dos columnas (la de 360px fijos no
 * cabría sin apretar la cifra) — hallazgo real, se veía roto en modo
 * tablet. Hasta `lg`, una sola columna ancha; el orden en móvil queda
 * idéntico al de antes.
 *
 * En pantallas muy anchas (`xl`, 1280px+) el contenido crece hasta `max-w-6xl` (1152px) en vez de quedarse en 896px con
 * medio monitor vacío a cada lado; la columna lateral pasa a 420px. No se agrega información: solo se reparte el espacio
 * (la cifra única sigue siendo el producto, no un dashboard).
 */
export function Home() {
  const formatearMonto = useFormatearMonto();
  const { data, isLoading, error } = useDisponible();
  const { data: periodoActivo } = usePeriodoActivo();
  const { data: resumenPendiente } = useResumenPendiente();
  const crearPeriodo = useCrearPeriodo();
  const quincena = quincenaDeHoy();
  const [mostrarFormularioGasto, setMostrarFormularioGasto] = useState(false);
  const [mostrarFormularioIngreso, setMostrarFormularioIngreso] = useState(false);
  // Un atajo que superó lo disponible abre el formulario con sus datos puestos (ver AtajosDeGasto.tsx).
  const [atajoEnFormulario, setAtajoEnFormulario] = useState<Atajo | null>(null);

  const sinPeriodoActivo = error instanceof ApiError && error.codigo === 'PERIODO_NO_ENCONTRADO';
  const errorInesperado = error && !sinPeriodoActivo;
  // Un gasto se puede registrar con o sin ingreso todavía (modelo-dominio.md
  // §5: "captura de gastos no se bloquea" en sin_ingreso) — el único
  // requisito real es tener un periodo activo, que es justo cuando `data`
  // existe sin error.
  const periodoId = !error ? data?.periodoId : undefined;
  const { data: pagosTarjeta } = usePagosTarjetaPeriodo(periodoId);

  // Guía de primeros pasos (lib/guia.ts): solo para cuentas nuevas o quien la pidió en Ajustes. Cada paso aparece
  // cuando la persona llega a ese punto, pegado al elemento que explica.
  const guia = useGuia();
  const navigate = useNavigate();
  const { data: listaAtajos } = useAtajos();
  const { data: paginasGastos } = useGastos(periodoId);
  const hayGastos = paginasGastos?.pages.some((pagina) => pagina.datos.some((g) => !g.revertido && !g.esRecurrente)) ?? false;
  const pasoGuia = guia.activa
    ? pasoDeInicio(guia.vistos, {
        sinPeriodo: sinPeriodoActivo,
        sinIngreso: !error && data?.estado === 'sin_ingreso',
        conCifra: !error && data?.estado === 'ok',
        hayAtajos: (listaAtajos?.atajos.length ?? 0) > 0,
        hayGastos,
      })
    : null;
  const saltarGuia = () => void guia.terminar();

  // `/?gasto=1` es el enlace del recordatorio por correo: abre directo la hoja de "Nuevo gasto". Se espera a
  // tener periodo (sin él no hay dónde registrar) y el parámetro se quita para que recargar o volver atrás
  // no reabra la hoja. Sin periodo activo, se queda en la pantalla de siempre.
  const [parametros, setParametros] = useSearchParams();
  const pidenGasto = parametros.get('gasto') === '1';
  useEffect(() => {
    if (!pidenGasto || !periodoId) return;
    setMostrarFormularioGasto(true);
    setParametros(
      (previos) => {
        const siguientes = new URLSearchParams(previos);
        siguientes.delete('gasto');
        return siguientes;
      },
      { replace: true }
    );
  }, [pidenGasto, periodoId, setParametros]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col sm:max-w-2xl sm:px-8 sm:pt-8 lg:max-w-4xl xl:max-w-6xl">
      <div className="flex items-center justify-between px-5 pt-5 pb-1 sm:hidden">
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
        <p className="text-muted-foreground px-5 pb-2 text-[13px] sm:px-0 sm:pb-5 sm:text-sm">
          Quincena · {formatearRangoFechas(periodoActivo.fechaInicio, periodoActivo.fechaFin)}
        </p>
      )}

      <div className="flex flex-col gap-3.5 px-5 pt-2 pb-4 sm:px-0 sm:pt-0 lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-8 xl:grid-cols-[1fr_420px] xl:gap-10">
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
                  {pagosTarjeta.length} pago{pagosTarjeta.length === 1 ? '' : 's'} de tarjeta aplicado{pagosTarjeta.length === 1 ? '' : 's'} esta quincena
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

          {isLoading && <CargandoKorly tamano={44} className="text-foreground mx-auto my-8" />}

          {errorInesperado && <p className="text-destructive">{error.message}</p>}

          {sinPeriodoActivo && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Empecemos</CardTitle>
                <CardDescription>
                  Korly lleva tu dinero por quincenas del calendario: del 1 al 15 y del 16 al último día del mes. Hoy estás en la quincena del{' '}
                  {formatearRangoFechas(quincena.fechaInicio, quincena.fechaFin)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => crearPeriodo.mutate()} disabled={crearPeriodo.isPending} className={cn('w-full', pasoGuia === 'quincena' && RESALTADO_GUIA)}>
                  {crearPeriodo.isPending ? 'Creando…' : 'Empezar esta quincena'}
                </Button>
                {crearPeriodo.isError && <p className="text-destructive mt-2 text-sm">{crearPeriodo.error.message}</p>}
              </CardContent>
            </Card>
          )}
          {pasoGuia === 'quincena' && (
            <PasoDeGuia texto={TEXTOS_GUIA.quincena.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('quincena')} onSaltar={saltarGuia} />
          )}

          {!error && data?.estado === 'sin_ingreso' && (
            <Card className={cn('rounded-2xl', pasoGuia === 'ingreso' && RESALTADO_GUIA)}>
              <CardHeader>
                <CardTitle>Registra tu ingreso</CardTitle>
                <CardDescription>Para ver cuánto puedes gastar hoy, necesitamos saber cuánto recibiste.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormularioIngreso periodoId={data.periodoId} />
              </CardContent>
            </Card>
          )}
          {pasoGuia === 'ingreso' && (
            <PasoDeGuia texto={TEXTOS_GUIA.ingreso.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('ingreso')} onSaltar={saltarGuia} />
          )}

          {!error && data?.estado === 'ok' && (
            <div className={cn('rounded-3xl', pasoGuia === 'cifra' && RESALTADO_GUIA)}>
              <CifraDisponible disponible={data} />
            </div>
          )}
          {pasoGuia === 'cifra' && (
            <PasoDeGuia texto={TEXTOS_GUIA.cifra.texto} etiquetaPrincipal="Siguiente" onPrincipal={() => guia.marcarVisto('cifra')} onSaltar={saltarGuia} />
          )}
          {!error && data?.estado === 'ok' && <RecordatorioContextual disponible={data} />}

          {periodoId && (
            <button
              onClick={() => {
                // Abrir el formulario por su cuenta equivale a haber leído este paso.
                if (pasoGuia === 'registrar-gasto') guia.marcarVisto('registrar-gasto');
                setMostrarFormularioGasto(true);
              }}
              className={cn(
                'bg-primary text-primary-foreground shadow-primary/30 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15.5px] font-semibold shadow-lg',
                pasoGuia === 'registrar-gasto' && RESALTADO_GUIA
              )}
            >
              <Plus size={18} strokeWidth={2.5} />
              Registrar gasto
            </button>
          )}
          {pasoGuia === 'registrar-gasto' && (
            <PasoDeGuia texto={TEXTOS_GUIA['registrar-gasto'].texto} etiquetaPrincipal="Entendido" onPrincipal={() => guia.marcarVisto('registrar-gasto')} onSaltar={saltarGuia} />
          )}

          {periodoId && (
            <div className={cn('rounded-2xl', pasoGuia === 'atajo-inicio' && RESALTADO_GUIA)}>
              <AtajosDeGasto
                periodoId={periodoId}
                onAbrirFormulario={(atajo) => {
                  setAtajoEnFormulario(atajo);
                  setMostrarFormularioGasto(true);
                }}
              />
            </div>
          )}
          {pasoGuia === 'atajo-inicio' && (
            <PasoDeGuia texto={TEXTOS_GUIA['atajo-inicio'].texto} etiquetaPrincipal="Entendido" onPrincipal={() => guia.marcarVisto('atajo-inicio')} onSaltar={saltarGuia} />
          )}
          {pasoGuia === 'recurrentes' && (
            <PasoDeGuia
              titulo={TEXTOS_GUIA.recurrentes.titulo}
              texto={TEXTOS_GUIA.recurrentes.texto}
              etiquetaPrincipal="Ver gastos recurrentes"
              onPrincipal={() => {
                guia.marcarVisto('recurrentes');
                navigate('/recurrentes');
              }}
              etiquetaSecundaria="Ahora no"
              onSecundaria={() => guia.marcarVisto('recurrentes')}
              onSaltar={saltarGuia}
            />
          )}
          {pasoGuia === 'cierre' && (
            <PasoDeGuia titulo={TEXTOS_GUIA.cierre.titulo} texto={TEXTOS_GUIA.cierre.texto} etiquetaPrincipal="Terminar" onPrincipal={saltarGuia} />
          )}

          {periodoId && data?.estado === 'ok' && (
            <button
              onClick={() => setMostrarFormularioIngreso(true)}
              className="border-border bg-card text-foreground flex items-center justify-center gap-2 rounded-2xl border py-3 text-[14.5px] font-semibold"
            >
              <Plus size={17} strokeWidth={2.5} />
              Registrar ingreso
            </button>
          )}
        </div>

        {periodoId && (
          <div className="flex flex-col gap-3.5">
            <div className="lg:border-border lg:bg-card lg:rounded-2xl lg:border lg:p-4">
              <ActividadReciente periodoId={periodoId} />
            </div>
            {data?.estado === 'ok' && <ResumenCompactoPeriodo periodoId={periodoId} />}
          </div>
        )}
      </div>

      <BottomNav />

      {pasoGuia === 'bienvenida' && (
        // Cerrarla por cualquier lado (X, fuera, Escape) cuenta como "Empezar": saltar toda la guía es una decisión explícita.
        <HojaInferior titulo={TEXTOS_GUIA.bienvenida.titulo} onCerrar={() => guia.marcarVisto('bienvenida')}>
          <p className="text-[14px] leading-snug">{TEXTOS_GUIA.bienvenida.texto}</p>
          <div className="flex flex-col gap-2">
            <Button type="button" className="h-auto rounded-2xl py-3 text-[15px] font-semibold" onClick={() => guia.marcarVisto('bienvenida')}>
              Empezar
            </Button>
            <Button type="button" variant="ghost" className="text-muted-foreground rounded-2xl" onClick={saltarGuia}>
              Saltar guía
            </Button>
          </div>
        </HojaInferior>
      )}

      {periodoId && mostrarFormularioIngreso && (
        <HojaInferior titulo="Nuevo ingreso" onCerrar={() => setMostrarFormularioIngreso(false)}>
          <FormularioIngreso periodoId={periodoId} onRegistrado={() => setMostrarFormularioIngreso(false)} />
        </HojaInferior>
      )}

      {periodoId && mostrarFormularioGasto && (
        <HojaInferior
          titulo="Nuevo gasto"
          onCerrar={() => {
            setMostrarFormularioGasto(false);
            setAtajoEnFormulario(null);
          }}
        >
          <FormularioGasto
            periodoId={periodoId}
            onRegistrado={() => {
              setMostrarFormularioGasto(false);
              setAtajoEnFormulario(null);
            }}
            inicial={atajoEnFormulario ? { monto: atajoEnFormulario.monto.valorMinimo / 100, categoriaId: atajoEnFormulario.categoriaId, nota: atajoEnFormulario.nombre } : undefined}
          />
        </HojaInferior>
      )}
    </div>
  );
}
