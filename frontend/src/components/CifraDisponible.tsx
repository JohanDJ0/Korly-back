import type { DisponibleOk } from '@/hooks/use-disponible';
import { formatearMonto } from '@/lib/dinero';
import { cn } from '@/lib/utils';

interface CifraDisponibleProps {
  disponible: DisponibleOk;
}

/**
 * La cifra diaria es el producto (CLAUDE.md, prioridad #2) — nunca se
 * muestra sin los días restantes al lado (modelo-dominio.md §5, reglas
 * de presentación). Un disponible negativo (sobregiro) se muestra tal
 * cual, sin suavizar: la cifra diaria también sale negativa y en rojo,
 * comunicando que se está gastando de un futuro que aún no llega.
 */
export function CifraDisponible({ disponible }: CifraDisponibleProps) {
  const negativo = disponible.disponible.valorMinimo < 0;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">Puedes gastar hoy</p>
      <p className={cn('text-5xl font-semibold tabular-nums', negativo && 'text-destructive')}>
        {formatearMonto(disponible.cifraDiaria)}
      </p>
      <p className="text-sm text-muted-foreground">
        por día, durante {disponible.diasRestantes} día{disponible.diasRestantes === 1 ? '' : 's'} más
      </p>
      <p className={cn('mt-4 text-lg font-medium', negativo && 'text-destructive')}>
        Disponible total: {formatearMonto(disponible.disponible)}
      </p>
    </div>
  );
}
