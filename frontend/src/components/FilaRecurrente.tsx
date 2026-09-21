import { Button } from '@/components/ui/button';
import { useActualizarRecurrente } from '@/hooks/use-actualizar-recurrente';
import type { GastoRecurrente } from '@/hooks/use-recurrentes';
import { formatearMonto } from '@/lib/dinero';
import { iconoCategoria } from '@/lib/icono-categoria';
import { cn } from '@/lib/utils';

interface FilaRecurrenteProps {
  recurrente: GastoRecurrente;
}

function etiquetaFrecuencia(recurrente: GastoRecurrente): string {
  if (recurrente.frecuencia === 'quincenal') return 'Cada quincena';
  return `Mensual, día ${recurrente.diaMes}`;
}

/** Pausar/reanudar es el "eliminar" de esta plantilla — nunca hard delete (ver backend/README.md, "Gastos recurrentes"). */
export function FilaRecurrente({ recurrente }: FilaRecurrenteProps) {
  const actualizarRecurrente = useActualizarRecurrente();
  const Icono = iconoCategoria(recurrente.descripcion);

  return (
    <li
      className={cn(
        'border-border bg-card flex items-center gap-3 rounded-2xl border p-3.5',
        !recurrente.activo && 'opacity-55'
      )}
    >
      <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
        <Icono size={17} className="text-secondary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{recurrente.descripcion}</p>
        <p className="text-muted-foreground mt-px text-[12.5px]">
          {formatearMonto(recurrente.monto)} — {etiquetaFrecuencia(recurrente)}
          {!recurrente.activo ? ' — Pausado' : ''}
        </p>
        {actualizarRecurrente.isError && <p className="text-destructive text-sm">{actualizarRecurrente.error.message}</p>}
      </div>
      <Button
        size="sm"
        variant={recurrente.activo ? 'outline' : 'default'}
        className="shrink-0 rounded-xl"
        disabled={actualizarRecurrente.isPending}
        onClick={() => actualizarRecurrente.mutate({ recurrenteId: recurrente.id, activo: !recurrente.activo })}
      >
        {recurrente.activo ? 'Pausar' : 'Reanudar'}
      </Button>
    </li>
  );
}
