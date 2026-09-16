import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormularioCargo } from '@/components/FormularioCargo';
import { useCargosTarjeta } from '@/hooks/use-cargos-tarjeta';
import { useEliminarTarjeta } from '@/hooks/use-eliminar-tarjeta';
import type { Tarjeta } from '@/hooks/use-tarjetas';
import { formatearMonto } from '@/lib/dinero';

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

  function eliminar() {
    if (!window.confirm(`¿Eliminar la tarjeta "${tarjeta.nombre}"?`)) return;
    eliminarTarjeta.mutate(tarjeta.id);
  }

  return (
    <li className="flex flex-col gap-3 border-b py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{tarjeta.nombre}</p>
          <p className="text-sm text-muted-foreground">
            Debes {formatearMonto(tarjeta.deuda)} · {formatearMonto(tarjeta.creditoDisponible)} disponible de{' '}
            {formatearMonto(tarjeta.limiteCredito)}
          </p>
          <p className="text-sm text-muted-foreground">
            Corte día {tarjeta.diaCorte} · {tarjeta.diasParaPago} días para pagar
          </p>
          {eliminarTarjeta.isError && <p className="text-sm text-destructive">{eliminarTarjeta.error.message}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => setMostrarFormularioCargo((v) => !v)}>
            {mostrarFormularioCargo ? 'Cancelar' : 'Registrar cargo'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMostrarCargos((v) => !v)}>
            {mostrarCargos ? 'Ocultar compras' : 'Ver compras'}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={eliminar} disabled={eliminarTarjeta.isPending}>
            Eliminar
          </Button>
        </div>
      </div>

      {mostrarFormularioCargo && (
        <Card>
          <CardContent className="pt-6">
            <FormularioCargo tarjetaId={tarjeta.id} onRegistrado={() => setMostrarFormularioCargo(false)} />
          </CardContent>
        </Card>
      )}

      {mostrarCargos && (
        <div className="flex flex-col gap-3">
          {cargandoCargos && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {cargos?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay compras registradas.</p>}
          {cargos?.map((cargo) => (
            <div key={cargo.id} className="rounded-md border p-3">
              <p className="font-medium">
                {cargo.descripcion} — {formatearMonto(cargo.montoTotal)}
                {cargo.numeroPlazos > 1 && ` a ${cargo.numeroPlazos} MSI`}
              </p>
              <p className="text-xs text-muted-foreground">{cargo.fechaCompra}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {cargo.mensualidades.map((m) => (
                  <li key={m.numeroPago} className="flex items-center justify-between text-sm">
                    <span className={m.pagado ? 'text-muted-foreground line-through' : ''}>
                      {m.numeroPago}/{cargo.numeroPlazos} — {formatearMonto(m.monto)} — vence {m.fechaVencimiento}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.pagado ? 'Pagado' : 'Pendiente'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
