import { useState } from 'react';

import { BotonConfirmar } from '@/components/BotonConfirmar';
import { FormularioRecurrente } from '@/components/FormularioRecurrente';
import { HojaInferior } from '@/components/HojaInferior';
import { Button } from '@/components/ui/button';
import { useActualizarRecurrente } from '@/hooks/use-actualizar-recurrente';
import { useEliminarRecurrente } from '@/hooks/use-eliminar-recurrente';
import type { GastoRecurrente } from '@/hooks/use-recurrentes';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { iconoCategoria } from '@/lib/icono-categoria';
import { cn } from '@/lib/utils';

interface FilaRecurrenteProps {
  recurrente: GastoRecurrente;
}

function etiquetaFrecuencia(recurrente: GastoRecurrente): string {
  if (recurrente.frecuencia === 'quincenal') return 'Cada quincena';
  return `Mensual, día ${recurrente.diaMes}`;
}

/**
 * Editar, pausar/reanudar y eliminar. Editar aplica desde el próximo cobro; eliminar lo deja de cobrar y de listar (lo ya
 * cobrado se queda en el historial). Pedido real del usuario (2026-10-16): tenía la renta duplicada y solo podía pausarla.
 */
export function FilaRecurrente({ recurrente }: FilaRecurrenteProps) {
  const formatearMonto = useFormatearMonto();
  const actualizarRecurrente = useActualizarRecurrente();
  const eliminarRecurrente = useEliminarRecurrente();
  const [editando, setEditando] = useState(false);
  const Icono = iconoCategoria(recurrente.descripcion);
  const error = actualizarRecurrente.error ?? eliminarRecurrente.error;

  return (
    <li className={cn('border-border bg-card flex flex-col gap-2 rounded-2xl border p-3.5', !recurrente.activo && 'opacity-55')}>
      <div className="flex items-center gap-3">
        <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
          <Icono size={17} className="text-secondary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{recurrente.descripcion}</p>
          <p className="text-muted-foreground mt-px text-[12.5px]">
            {formatearMonto(recurrente.monto)} — {etiquetaFrecuencia(recurrente)}
            {!recurrente.activo ? ' — Pausado' : ''}
          </p>
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error.message}</p>}
      <div className="-ml-2 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditando(true)}>
          Editar
        </Button>
        <Button
          size="sm"
          variant={recurrente.activo ? 'ghost' : 'default'}
          className="rounded-xl"
          disabled={actualizarRecurrente.isPending}
          onClick={() => actualizarRecurrente.mutate({ recurrenteId: recurrente.id, activo: !recurrente.activo })}
        >
          {recurrente.activo ? 'Pausar' : 'Reanudar'}
        </Button>
        <BotonConfirmar
          variant="ghost"
          size="sm"
          className="text-destructive rounded-xl"
          pregunta={`¿Eliminar "${recurrente.descripcion}"? Ya no se cobrará en las siguientes quincenas. Lo que ya se cobró se queda en tu historial.`}
          onConfirmar={() => eliminarRecurrente.mutate(recurrente.id)}
          disabled={eliminarRecurrente.isPending}
        >
          Eliminar
        </BotonConfirmar>
      </div>
      {editando && (
        <HojaInferior titulo="Editar gasto recurrente" onCerrar={() => setEditando(false)}>
          <FormularioRecurrente recurrente={recurrente} onCreado={() => setEditando(false)} onCancelar={() => setEditando(false)} />
        </HojaInferior>
      )}
    </li>
  );
}
