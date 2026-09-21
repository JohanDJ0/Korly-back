import { ChevronDown, ChevronUp, CreditCard } from 'lucide-react';
import { useState } from 'react';

import { BotonConfirmar } from '@/components/BotonConfirmar';
import { FormularioCargo } from '@/components/FormularioCargo';
import { HojaInferior } from '@/components/HojaInferior';
import { useCargosTarjeta } from '@/hooks/use-cargos-tarjeta';
import { useEliminarTarjeta } from '@/hooks/use-eliminar-tarjeta';
import type { Tarjeta } from '@/hooks/use-tarjetas';
import { formatearMonto } from '@/lib/dinero';
import { cn } from '@/lib/utils';

interface FilaTarjetaProps {
  tarjeta: Tarjeta;
}

/**
 * "Ver compras" pide `GET /tarjetas/:id/cargos` solo cuando se expande
 * (`useCargosTarjeta` con `enabled` condicionado) — la mayoría de las
 * veces el usuario solo quiere ver deuda/disponible de un vistazo, sin
 * pagar el costo de traer cada mensualidad de cada compra.
 *
 * "Eliminar" siempre se muestra (sin pedir los cargos por adelantado
 * solo para decidir si mostrarlo o no — eso repetiría el costo que
 * "Ver compras" ya evita a propósito): el backend rechaza con
 * `TARJETA_CON_HISTORIAL` si ya tiene cargos, y ese mensaje se muestra
 * tal cual, mismo criterio que `LIMITE_CREDITO_EXCEDIDO` en
 * FormularioCargo (el backend decide, el frontend no adivina).
 */
export function FilaTarjeta({ tarjeta }: FilaTarjetaProps) {
  const [mostrarFormularioCargo, setMostrarFormularioCargo] = useState(false);
  const [mostrarCargos, setMostrarCargos] = useState(false);
  const { data: cargos, isLoading: cargandoCargos } = useCargosTarjeta(mostrarCargos ? tarjeta.id : undefined);
  const eliminarTarjeta = useEliminarTarjeta();

  const porcentajeUsado = tarjeta.limiteCredito.valorMinimo > 0 ? Math.min(100, (tarjeta.deuda.valorMinimo / tarjeta.limiteCredito.valorMinimo) * 100) : 0;

  return (
    <li className="flex flex-col gap-3">
      <div className="bg-hero text-hero-foreground flex flex-col gap-3.5 rounded-[20px] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-brand-gold" />
            <span className="text-[15px] font-semibold">{tarjeta.nombre}</span>
          </div>
          <span className="text-hero-foreground-muted text-xs">Corte día {tarjeta.diaCorte}</span>
        </div>

        <div>
          <div className="text-hero-foreground-muted text-xs">Debes</div>
          <div className="font-display mt-0.5 text-[32px] font-extrabold">{formatearMonto(tarjeta.deuda)}</div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="bg-brand-gold h-full rounded-full" style={{ width: `${porcentajeUsado}%` }} />
          </div>
          <div className="text-hero-foreground-muted text-xs">
            {formatearMonto(tarjeta.creditoDisponible)} disponible de {formatearMonto(tarjeta.limiteCredito)}
          </div>
        </div>

        <div className="text-hero-foreground-muted text-[12.5px]">{tarjeta.diasParaPago} días para pagar</div>

        {eliminarTarjeta.isError && <p className="text-sm text-red-400">{eliminarTarjeta.error.message}</p>}

        <div className="mt-0.5 flex gap-2">
          <button
            onClick={() => setMostrarFormularioCargo(true)}
            className="bg-primary flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white"
          >
            Registrar cargo
          </button>
          <button
            onClick={() => setMostrarCargos((v) => !v)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-white/25 py-2.5 text-[13px] font-semibold"
          >
            {mostrarCargos ? 'Ocultar' : 'Ver compras'}
            {mostrarCargos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <BotonConfirmar
          variant="ghost"
          size="sm"
          className="text-destructive"
          pregunta={`¿Eliminar la tarjeta "${tarjeta.nombre}"?`}
          onConfirmar={() => eliminarTarjeta.mutate(tarjeta.id)}
          disabled={eliminarTarjeta.isPending}
        >
          Eliminar tarjeta
        </BotonConfirmar>
      </div>

      {mostrarCargos && (
        <div className="flex flex-col gap-2.5">
          {cargandoCargos && <p className="text-muted-foreground text-sm">Cargando…</p>}
          {cargos?.length === 0 && <p className="text-muted-foreground text-sm">Todavía no hay compras registradas.</p>}
          {cargos?.map((cargo) => (
            <div key={cargo.id} className="border-border bg-card rounded-2xl border p-4">
              <p className="text-[14px] font-semibold">
                {cargo.descripcion} — {formatearMonto(cargo.montoTotal)}
                {cargo.numeroPlazos > 1 && ` a ${cargo.numeroPlazos} MSI`}
              </p>
              <p className="text-muted-foreground text-xs">{cargo.fechaCompra}</p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {cargo.mensualidades.map((m) => (
                  <li key={m.numeroPago} className="flex items-center justify-between text-[13px]">
                    <span className={cn(m.pagado && 'text-muted-foreground line-through')}>
                      {m.numeroPago}/{cargo.numeroPlazos} — {formatearMonto(m.monto)} — vence {m.fechaVencimiento}
                    </span>
                    <span className={cn('shrink-0 text-[11px] font-semibold', m.pagado ? 'text-muted-foreground' : 'text-[#B5680C]')}>
                      {m.pagado ? 'Pagado' : 'Pendiente'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {mostrarFormularioCargo && (
        <HojaInferior titulo="Registrar cargo" onCerrar={() => setMostrarFormularioCargo(false)}>
          <FormularioCargo tarjetaId={tarjeta.id} onRegistrado={() => setMostrarFormularioCargo(false)} />
        </HojaInferior>
      )}
    </li>
  );
}
