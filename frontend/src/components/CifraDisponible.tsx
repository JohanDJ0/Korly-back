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
 *
 * La barra de progreso es puramente decorativa (rediseño visual) —
 * ninguna decisión de negocio nueva vive aquí, solo repinta lo que
 * `objetivoHoy`/`gastadoHoy` ya significaban antes de este cambio.
 */
export function CifraDisponible({ disponible }: CifraDisponibleProps) {
  const totalNegativo = disponible.disponible.valorMinimo < 0;
  const teExcedisteHoy = disponible.cifraDiaria.valorMinimo < 0;
  const gastadoHoy = disponible.gastadoHoy.valorMinimo;
  const objetivoHoy = disponible.cifraDiaria.valorMinimo + gastadoHoy;
  const porcentajeGastado = teExcedisteHoy ? 100 : objetivoHoy > 0 ? Math.min(100, (gastadoHoy / objetivoHoy) * 100) : 0;

  return (
    <div className="bg-hero text-hero-foreground flex flex-col gap-3.5 rounded-3xl px-5.5 py-6">
      <p className="text-hero-foreground-muted text-sm font-medium">{teExcedisteHoy ? 'Te excediste hoy por' : 'Puedes gastar hoy'}</p>
      <p className={cn('font-display text-[52px] leading-none font-extrabold tracking-tight tabular-nums', teExcedisteHoy && 'text-red-400')}>
        {formatearMonto(teExcedisteHoy ? { ...disponible.cifraDiaria, valorMinimo: -disponible.cifraDiaria.valorMinimo } : disponible.cifraDiaria)}
      </p>

      <div className="mt-1 flex flex-col gap-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full rounded-full', teExcedisteHoy ? 'bg-red-400' : 'bg-brand-gold')}
            style={{ width: `${porcentajeGastado}%` }}
          />
        </div>
        <p className="text-hero-foreground-muted text-[12.5px]">
          por día, durante {disponible.diasRestantes} día{disponible.diasRestantes === 1 ? '' : 's'} más
        </p>
        {gastadoHoy > 0 && (
          <p className="text-hero-foreground-muted text-[12.5px]">
            Ya gastaste {formatearMonto(disponible.gastadoHoy)} de tu objetivo de hoy de{' '}
            {formatearMonto({ ...disponible.cifraDiaria, valorMinimo: objetivoHoy })}
          </p>
        )}
      </div>

      <div className="my-0.5 h-px bg-white/10" />

      <div className="flex items-center">
        <div className="flex-1">
          <div className="text-hero-foreground-muted text-[11.5px]">Disponible total</div>
          <div className={cn('font-display mt-0.5 text-lg font-bold', totalNegativo && 'text-red-400')}>
            {formatearMonto(disponible.disponible)}
          </div>
        </div>
        <div className="h-7 w-px bg-white/10" />
        <div className="flex-1 text-right">
          <div className="text-hero-foreground-muted text-[11.5px]">Días restantes</div>
          <div className="font-display mt-0.5 text-lg font-bold">{disponible.diasRestantes}</div>
        </div>
      </div>
    </div>
  );
}
