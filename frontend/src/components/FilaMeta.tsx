import { ChevronDown, ChevronUp, Plus, Target } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { useAportarMeta } from '@/hooks/use-aportar-meta';
import { useDeshacerPagoMeta } from '@/hooks/use-deshacer-pago-meta';
import { useDepositarMeta } from '@/hooks/use-depositar-meta';
import { useDisponible } from '@/hooks/use-disponible';
import { useEditarMeta } from '@/hooks/use-editar-meta';
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

type Modo = 'aportar' | 'pagar' | 'retirar' | 'editar' | null;
type OrigenAporte = 'quincena' | 'externo';

const AYUDA_POR_MODO = {
  aportar: 'Se descuenta de lo que puedes gastar en tu quincena.',
  aportarExterno: 'Es dinero que ya tenías fuera de Korly. Entra directo a la meta y no cambia lo que puedes gastar en tu quincena.',
  pagar: 'Sale directo de la meta. No cuenta en el presupuesto ni en los gastos de tu quincena.',
  retirar: 'Pasa a tu quincena como ingreso: aumenta lo que puedes gastar y cuenta como ingreso del periodo.',
} as const;

function etiquetaMovimiento(movimiento: MovimientoMeta): string {
  if (movimiento.tipo === 'pago') return `Pago: ${movimiento.nota ?? 'sin motivo'}`;
  if (movimiento.tipo === 'retiro') return `A la quincena: ${movimiento.nota ?? 'sin motivo'}`;
  if (movimiento.tipo === 'deposito') return movimiento.nota ? `Aporte externo: ${movimiento.nota}` : 'Aporte externo';
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
  const [origen, setOrigen] = useState<OrigenAporte>('quincena');
  const [mostrarMovimientos, setMostrarMovimientos] = useState(false);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [objetivoEdicion, setObjetivoEdicion] = useState('');
  // Hallazgo del pase de QA/UX: un monto/motivo inválido no debe fallar
  // en silencio (el botón simplemente sin hacer nada, sin explicar por
  // qué) — a diferencia de FormularioGasto/FormularioMeta (RHF + Zod,
  // con su propio manejo de errores), este formulario inline usa
  // useState simple, así que el mensaje se arma a mano aquí.
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const aportarMeta = useAportarMeta();
  const retirarMeta = useRetirarMeta();
  const pagarMeta = usePagarMeta();
  const depositarMeta = useDepositarMeta();
  const deshacerPago = useDeshacerPagoMeta();
  const eliminarMeta = useEliminarMeta();
  const { data: disponible } = useDisponible();
  const editarMeta = useEditarMeta();
  const { data: movimientos, isLoading: cargandoMovimientos } = useMovimientosMeta(mostrarMovimientos ? meta.id : undefined);

  function cerrar() {
    setModo(null);
    setMonto('');
    setMotivo('');
    setOrigen('quincena');
    setErrorValidacion(null);
    aportarMeta.reset();
    depositarMeta.reset();
    retirarMeta.reset();
    pagarMeta.reset();
    editarMeta.reset();
  }

  function abrirEdicion() {
    setNombreEdicion(meta.nombre);
    setObjetivoEdicion(String(meta.montoObjetivo.valorMinimo / 100));
    setErrorValidacion(null);
    setModo('editar');
  }

  function guardarEdicion() {
    const nombre = nombreEdicion.trim();
    const objetivo = Number(objetivoEdicion);
    if (nombre.length === 0) {
      setErrorValidacion('El nombre no puede estar vacío');
      return;
    }
    if (!Number.isFinite(objetivo) || objetivo <= 0) {
      setErrorValidacion('El objetivo debe ser mayor a cero');
      return;
    }
    setErrorValidacion(null);
    editarMeta.mutate(
      { metaId: meta.id, nombre, montoObjetivo: { valorMinimo: Math.round(objetivo * 100), moneda: meta.montoObjetivo.moneda } },
      { onSuccess: cerrar }
    );
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
    // El backend también lo rechaza (SALDO_META_INSUFICIENTE); aquí se evita el viaje y se dice cuánto hay.
    if (modo === 'retirar' && Math.round(valor * 100) > meta.montoAcumulado.valorMinimo) {
      setErrorValidacion(`La meta solo tiene ${formatearMonto(meta.montoAcumulado)}`);
      return;
    }
    // El backend también lo rechaza (APORTE_EXCEDE_DISPONIBLE); aquí solo se evita el viaje y se dice cuánto hay.
    if (modo === 'aportar' && origen === 'quincena' && disponible?.estado === 'ok' && Math.round(valor * 100) > disponible.disponible.valorMinimo) {
      setErrorValidacion(`Tu quincena solo tiene ${formatearMonto(disponible.disponible)} disponible`);
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

    if (modo === 'aportar' && origen === 'externo') {
      depositarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo: motivo.trim() || undefined }, { onSuccess: cerrar });
    } else if (modo === 'aportar') {
      aportarMeta.mutate({ metaId: meta.id, monto: montoDto }, { onSuccess: cerrar });
    } else if (modo === 'retirar') {
      retirarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    } else if (modo === 'pagar') {
      pagarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    }
  }

  const pendiente = aportarMeta.isPending || retirarMeta.isPending || pagarMeta.isPending || depositarMeta.isPending || editarMeta.isPending;
  const mensajeError = errorValidacion ?? (aportarMeta.error ?? depositarMeta.error ?? retirarMeta.error ?? pagarMeta.error ?? editarMeta.error ?? eliminarMeta.error)?.message;
  const porcentaje = Math.min(100, meta.porcentajeAvance);
  const aportaExterno = modo === 'aportar' && origen === 'externo';
  const pideMotivo = modo === 'retirar' || modo === 'pagar' || aportaExterno;

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
          <Button variant="outline" size="sm" className="flex-auto rounded-xl" onClick={() => setModo('aportar')}>
            <Plus size={14} /> Aportar
          </Button>
          <Button variant="outline" size="sm" className="flex-auto rounded-xl" onClick={() => setModo('pagar')}>
            Pagar con la meta
          </Button>
          <Button variant="outline" size="sm" className="flex-auto rounded-xl" onClick={() => setModo('retirar')}>
            Pasar a mi quincena
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground ml-auto" onClick={abrirEdicion}>
            Editar
          </Button>
          <BotonConfirmar
            variant="ghost"
            size="sm"
            className="text-destructive"
            pregunta={`¿Eliminar la meta "${meta.nombre}"?`}
            onConfirmar={() => eliminarMeta.mutate(meta.id)}
            disabled={eliminarMeta.isPending}
          >
            Eliminar
          </BotonConfirmar>
        </div>
      )}

      {modo === 'editar' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`nombre-${meta.id}`} className="text-muted-foreground text-[12px] font-medium">
              Nombre
            </label>
            <Input
              id={`nombre-${meta.id}`}
              value={nombreEdicion}
              onChange={(evento) => {
                setNombreEdicion(evento.target.value);
                setErrorValidacion(null);
              }}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`objetivo-${meta.id}`} className="text-muted-foreground text-[12px] font-medium">
              Objetivo
            </label>
            <Input
              id={`objetivo-${meta.id}`}
              value={objetivoEdicion}
              onChange={(evento) => {
                setObjetivoEdicion(evento.target.value);
                setErrorValidacion(null);
              }}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
            />
          </div>
          <p className="text-muted-foreground text-[12px]">Lo que ya ahorraste no cambia: solo se recalcula el avance.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={guardarEdicion} disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {(modo === 'aportar' || modo === 'pagar' || modo === 'retirar') && (
        <div className="flex flex-col gap-2">
          {modo === 'aportar' && (
            <div role="radiogroup" aria-label="¿De dónde sale el dinero?" className="bg-muted flex gap-1 rounded-xl p-1">
              {(
                [
                  ['quincena', 'De mi quincena'],
                  ['externo', 'Ya lo tenía ahorrado'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={origen === valor}
                  onClick={() => {
                    setOrigen(valor);
                    setErrorValidacion(null);
                  }}
                  className={cn(
                    'flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors',
                    origen === valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
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
                placeholder={modo === 'pagar' ? '¿En qué lo usas?' : aportaExterno ? 'Origen (opcional)' : 'Motivo'}
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
          <p className="text-muted-foreground text-[12px]">
            {AYUDA_POR_MODO[aportaExterno ? 'aportarExterno' : modo]}
            {modo === 'aportar' && origen === 'quincena' && disponible?.estado === 'ok' && ` Tienes ${formatearMonto(disponible.disponible)} disponible.`}
            {(modo === 'pagar' || modo === 'retirar') && ` La meta tiene ${formatearMonto(meta.montoAcumulado)}.`}
          </p>
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
                    {(movimiento.tipo === 'pago' || movimiento.tipo === 'deposito') && !movimiento.revertido && (
                      <BotonConfirmar
                        variant="ghost"
                        size="sm"
                        className="text-destructive -ml-2.5 h-7 text-xs"
                        pregunta={movimiento.tipo === 'pago' ? '¿Deshacer este pago? El dinero vuelve a la meta.' : '¿Deshacer este aporte? El dinero sale de la meta.'}
                        onConfirmar={() => deshacerPago.mutate({ metaId: meta.id, movimientoId: movimiento.id, tipo: movimiento.tipo === 'pago' ? 'pago' : 'deposito' })}
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
