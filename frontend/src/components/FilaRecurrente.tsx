import { Button } from '@/components/ui/button';
import { useActualizarRecurrente } from '@/hooks/use-actualizar-recurrente';
import type { GastoRecurrente } from '@/hooks/use-recurrentes';
import { formatearMonto } from '@/lib/dinero';

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

  return (
    <li className={`flex items-center justify-between gap-2 border-b py-3 ${recurrente.activo ? '' : 'opacity-50'}`}>
      <div>
        <p className="font-medium">{recurrente.descripcion}</p>
        <p className="text-sm text-muted-foreground">
          {formatearMonto(recurrente.monto)} — {etiquetaFrecuencia(recurrente)}
          {!recurrente.activo ? ' — Pausado' : ''}
        </p>
        {actualizarRecurrente.isError && <p className="text-sm text-destructive">{actualizarRecurrente.error.message}</p>}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={actualizarRecurrente.isPending}
        onClick={() => actualizarRecurrente.mutate({ recurrenteId: recurrente.id, activo: !recurrente.activo })}
      >
        {recurrente.activo ? 'Pausar' : 'Reanudar'}
      </Button>
    </li>
  );
}
