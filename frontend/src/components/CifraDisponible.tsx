import type { DisponibleOk } from '@/hooks/use-disponible';
import { formatearMonto } from '@/lib/dinero';
import { cn } from '@/lib/utils';

interface CifraDisponibleProps {
  disponible: DisponibleOk;
}

/**
 * La cifra diaria es el producto (CLAUDE.md, prioridad #2) — nunca se
 * muestra sin los días restantes al lado (modelo-dominio.md §5, reglas
 * de presentación). "Hoy" y "total" son negativos por razones
 * distintas y se colorean por separado: puedes haberte excedido el
 * objetivo de HOY con el total todavía en positivo (backend/README.md,
 * "Disponible" — el objetivo de hoy es fijo, no se redistribuye a
 * mitad del día), o al revés, ir bien hoy con el total ya en
 * sobregiro. Cada cifra se atenúa según SU propio signo, no el del
 * otro número.
 */
export function CifraDisponible({ disponible }: CifraDisponibleProps) {
  const totalNegativo = disponible.disponible.valorMinimo < 0;
  const teExcedisteHoy = disponible.cifraDiaria.valorMinimo < 0;
  const gastadoHoy = disponible.gastadoHoy.valorMinimo;
  const objetivoHoy = disponible.cifraDiaria.valorMinimo + gastadoHoy;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">{teExcedisteHoy ? 'Te excediste hoy por' : 'Puedes gastar hoy'}</p>
      <p className={cn('text-5xl font-semibold tabular-nums', teExcedisteHoy && 'text-destructive')}>
        {formatearMonto(teExcedisteHoy ? { ...disponible.cifraDiaria, valorMinimo: -disponible.cifraDiaria.valorMinimo } : disponible.cifraDiaria)}
      </p>
      <p className="text-sm text-muted-foreground">
        por día, durante {disponible.diasRestantes} día{disponible.diasRestantes === 1 ? '' : 's'} más
      </p>
      {gastadoHoy > 0 && (
        <p className="text-sm text-muted-foreground">
          Ya gastaste {formatearMonto(disponible.gastadoHoy)} de tu objetivo de hoy de{' '}
          {formatearMonto({ ...disponible.cifraDiaria, valorMinimo: objetivoHoy })}
        </p>
      )}
      <p className={cn('mt-4 text-lg font-medium', totalNegativo && 'text-destructive')}>
        Disponible total: {formatearMonto(disponible.disponible)}
      </p>
    </div>
  );
}
