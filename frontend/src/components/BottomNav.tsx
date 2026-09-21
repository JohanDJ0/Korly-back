import { CreditCard, History, House, MoreHorizontal, Target } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

const PESTANAS = [
  { to: '/', etiqueta: 'Inicio', Icono: House, fin: true },
  { to: '/historial', etiqueta: 'Historial', Icono: History, fin: false },
  { to: '/metas', etiqueta: 'Metas', Icono: Target, fin: false },
  { to: '/tarjetas', etiqueta: 'Tarjetas', Icono: CreditCard, fin: false },
  { to: '/ajustes', etiqueta: 'Más', Icono: MoreHorizontal, fin: false },
] as const;

/**
 * Reemplaza la lista de enlaces apiladas que tenía Home.tsx — mismo
 * destino, navegación siempre visible en vez de scroll hasta el final.
 * `NavLink` (no `Link`) porque el estado activo es visual, no algo que
 * este componente deba calcular a mano comparando rutas.
 */
export function BottomNav() {
  return (
    <nav className="bg-card border-border sticky bottom-0 flex h-[76px] shrink-0 items-center border-t pb-2">
      {PESTANAS.map(({ to, etiqueta, Icono, fin }) => (
        <NavLink
          key={to}
          to={to}
          end={fin}
          className={({ isActive }) =>
            cn('flex flex-1 flex-col items-center gap-1 text-muted-foreground', isActive && 'text-primary')
          }
        >
          {({ isActive }) => (
            <>
              <Icono size={21} strokeWidth={2.2} />
              <span className={cn('text-[10.5px]', isActive && 'font-semibold')}>{etiqueta}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
