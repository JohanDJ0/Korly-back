import { ChevronDown, ChevronUp, Plus, Target } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { useAportarMeta } from '@/hooks/use-aportar-meta';
import { useDeshacerPagoMeta } from '@/hooks/use-deshacer-pago-meta';
import { useEliminarMeta } from '@/hooks/use-eliminar-meta';
import type { Meta } from '@/hooks/use-metas';
import { useMovimientosMeta, type MovimientoMeta } from '@/hooks/use-movimientos-meta';
import { usePagarMeta } from '@/hooks/use-pagar-meta';
import { useRetirarMeta } from '@/hooks/use-retirar-meta';
import { formatearMonto } from '@/lib/dinero';
import { formatearFechaActividad } from '@/lib/fechas';
import { cn } from '@/lib/utils';

interface FilaMetaProps {
  meta: Meta;
}

type Modo = 'aportar' | 'pagar' | 'retirar' | null;

const AYUDA_POR_MODO = {
  aportar: 'Se descuenta de lo que puedes gastar en tu quincena.',
  pagar: 'Sale directo de la meta. No cuenta en el presupuesto ni en los gastos de tu quincena.',
  retirar: 'Pasa a tu quincena como ingreso: aumenta lo que puedes gastar y cuenta como ingreso del periodo.',
} as const;

function etiquetaMovimiento(movimiento: MovimientoMeta): string {
  if (movimiento.tipo === 'pago') return `Pago: ${movimiento.nota ?? 'sin motivo'}`;
  if (movimiento.tipo === 'retiro') return `A la quincena: ${movimiento.nota ?? 'sin motivo'}`;
  return 'Aporte';
}

/**
 * Tres formas de mover una meta, y cada una cuenta distinto en la quincena
 * (ver backend/README.md, "Metas de ahorro"):
 * - Aportar reduce el disponible del periodo activo (como un gasto).
 * - Pagar con la meta sale directo de ella: no toca la quincena, no exige
 *   periodo activo, y el backend rechaza si la meta no alcanza.
 * - Pasar a la quincena (retirar) aumenta el disponible (como un ingreso).
 * Aportar y pasar a la quincena requieren periodo activo: si no hay uno, el
 * error del backend (`SIN_PERIODO_ACTIVO`) se muestra tal cual, no se
 * duplica la validación aquí.
 */
export function FilaMeta({ meta }: FilaMetaProps) {
  const [modo, setModo] = useState<Modo>(null);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [mostrarMovimientos, setMostrarMovimientos] = useState(false);
  // Hallazgo del pase de QA/UX: un monto/motivo inválido no debe fallar
  // en silencio (el botón simplemente sin hacer nada, sin explicar por
  // qué) — a diferencia de FormularioGasto/FormularioMeta (RHF + Zod,
  // con su propio manejo de errores), este formulario inline usa
  // useState simple, así que el mensaje se arma a mano aquí.
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const aportarMeta = useAportarMeta();
  const retirarMeta = useRetirarMeta();
  const pagarMeta = usePagarMeta();
  const deshacerPago = useDeshacerPagoMeta();
  const eliminarMeta = useEliminarMeta();
  const { data: movimientos, isLoading: cargandoMovimientos } = useMovimientosMeta(mostrarMovimientos ? meta.id : undefined);

  function cerrar() {
    setModo(null);
    setMonto('');
    setMotivo('');
    setErrorValidacion(null);
    aportarMeta.reset();
    retirarMeta.reset();
    pagarMeta.reset();
  }

  function confirmar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorValidacion('El monto debe ser mayor a cero');
      return;
    }
    if (modo === 'retirar' && motivo.trim().length === 0) {
      setErrorValidacion('Indica un motivo para el retiro');
      return;
    }
    if (modo === 'pagar') {
      if (motivo.trim().length === 0) {
        setErrorValidacion('Indica en qué usas este dinero');
        return;
      }
      if (Math.round(valor * 100) > meta.montoAcumulado.valorMinimo) {
        setErrorValidacion(`La meta solo tiene ${formatearMonto(meta.montoAcumulado)}`);
        return;
      }
    }
    setErrorValidacion(null);
    const montoDto = { valorMinimo: Math.round(valor * 100), moneda: meta.montoObjetivo.moneda };

    if (modo === 'aportar') {
      aportarMeta.mutate({ metaId: meta.id, monto: montoDto }, { onSuccess: cerrar });
    } else if (modo === 'retirar') {
      retirarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    } else if (modo === 'pagar') {
      pagarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    }
  }

  const pendiente = aportarMeta.isPending || retirarMeta.isPending || pagarMeta.isPending;
  const mensajeError = errorValidacion ?? (aportarMeta.error ?? retirarMeta.error ?? pagarMeta.error ?? eliminarMeta.error)?.message;
  const porcentaje = Math.min(100, meta.porcentajeAvance);
  const pideMotivo = modo === 'retirar' || modo === 'pagar';

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4.5">
      <div className="flex items-center gap-2.5">
        <div className="bg-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]">
          <Target size={17} className="text-secondary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold break-words">{meta.nombre}</p>
          <p className="text-muted-foreground mt-px text-[12.5px]">
            {formatearMonto(meta.montoAcumulado)} de {formatearMonto(meta.montoObjetivo)}
          </p>
        </div>
        <span className="font-display text-primary shrink-0 text-[15px] font-bold">{meta.porcentajeAvance.toFixed(0)}%</span>
      </div>

      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className="bg-brand-gold h-full rounded-full" style={{ width: `${porcentaje}%` }} />
      </div>

      {modo === null && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="min-w-24 flex-1 rounded-xl" onClick={() => setModo('aportar')}>
            <Plus size={14} /> Aportar
          </Button>
          <Button variant="outline" size="sm" className="min-w-32 flex-1 rounded-xl" onClick={() => setModo('pagar')}>
            Pagar con la meta
          </Button>
          <Button variant="outline" size="sm" className="min-w-32 flex-1 rounded-xl" onClick={() => setModo('retirar')}>
            Pasar a mi quincena
          </Button>
          <BotonConfirmar
            variant="ghost"
            size="sm"
            className="text-destructive ml-auto"
            pregunta={`¿Eliminar la meta "${meta.nombre}"?`}
            onConfirmar={() => eliminarMeta.mutate(meta.id)}
            disabled={eliminarMeta.isPending}
          >
            Eliminar
          </BotonConfirmar>
        </div>
      )}

      {modo !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={monto}
              onChange={(evento) => {
                setMonto(evento.target.value);
                setErrorValidacion(null);
              }}
              type="number"
              step="0.01"
              min="0"
              placeholder="Monto"
              autoFocus
              className="w-28 min-w-0"
            />
            {pideMotivo && (
              <Input
                value={motivo}
                onChange={(evento) => {
                  setMotivo(evento.target.value);
                  setErrorValidacion(null);
                }}
                placeholder={modo === 'pagar' ? '¿En qué lo usas?' : 'Motivo'}
                className="w-40 min-w-36 flex-1"
              />
            )}
            <Button size="sm" onClick={confirmar} disabled={pendiente}>
              {pendiente ? 'Guardando…' : modo === 'aportar' ? 'Aportar' : modo === 'pagar' ? 'Pagar' : 'Pasar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
          </div>
          <p className="text-muted-foreground text-[12px]">{AYUDA_POR_MODO[modo]}</p>
        </div>
      )}
      {mensajeError && <p className="text-destructive text-sm">{mensajeError}</p>}

      <button
        type="button"
        onClick={() => setMostrarMovimientos((v) => !v)}
        className="text-muted-foreground flex items-center gap-1 self-start text-[12.5px] font-medium"
      >
        {mostrarMovimientos ? 'Ocultar movimientos' : 'Ver movimientos'}
        {mostrarMovimientos ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {mostrarMovimientos && (
        <div className="flex flex-col">
          {cargandoMovimientos && <p className="text-muted-foreground text-sm">Cargando…</p>}
          {movimientos?.length === 0 && <p className="text-muted-foreground text-sm">Todavía no hay movimientos.</p>}
          {movimientos?.map((movimiento, indice) => {
            const entra = movimiento.monto.valorMinimo > 0;
            return (
              <div key={movimiento.id}>
                {indice > 0 && <div className="bg-border h-px" />}
                <div className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className={cn('text-[13px] font-medium break-words', movimiento.revertido && 'text-muted-foreground line-through')}>
                      {etiquetaMovimiento(movimiento)}
                    </p>
                    <p className="text-muted-foreground text-[11.5px]">
                      {formatearFechaActividad(movimiento.fechaEfectiva)}
                      {movimiento.revertido ? ' · deshecho' : ''}
                    </p>
                    {movimiento.tipo === 'pago' && !movimiento.revertido && (
                      <BotonConfirmar
                        variant="ghost"
                        size="sm"
                        className="text-destructive -ml-2.5 h-7 text-xs"
                        pregunta="¿Deshacer este pago? El dinero vuelve a la meta."
                        onConfirmar={() => deshacerPago.mutate({ metaId: meta.id, movimientoId: movimiento.id })}
                        disabled={deshacerPago.isPending}
                      >
                        Deshacer
                      </BotonConfirmar>
                    )}
                    {deshacerPago.isError && deshacerPago.variables?.movimientoId === movimiento.id && (
                      <p className="text-destructive text-xs">{deshacerPago.error.message}</p>
                    )}
                  </div>
                  <span className={cn('shrink-0 text-[13px] font-semibold', movimiento.revertido && 'text-muted-foreground line-through')}>
                    {entra ? '+' : '-'}
                    {formatearMonto({ valorMinimo: Math.abs(movimiento.monto.valorMinimo), moneda: movimiento.monto.moneda })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
