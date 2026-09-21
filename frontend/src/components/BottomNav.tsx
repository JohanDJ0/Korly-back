import { NavLink } from 'react-router-dom';

import { NAV_DESTINOS } from '@/lib/nav-destinos';
import { cn } from '@/lib/utils';

/**
 * Reemplaza la lista de enlaces apiladas que tenía Home.tsx — mismo
 * destino, navegación siempre visible en vez de scroll hasta el final.
 * `NavLink` (no `Link`) porque el estado activo es visual, no algo que
 * este componente deba calcular a mano comparando rutas.
 *
 * Oculta desde `sm:` (640px, mismo corte que Sidebar.tsx) — ahí la
 * navegación vive en el sidebar, siempre visible a la izquierda en vez
 * de compitiendo con el contenido por la franja inferior de la
 * pantalla.
 */
export function BottomNav() {
  return (
    <nav className="bg-card border-border sticky bottom-0 flex h-[76px] shrink-0 items-center border-t pb-2 sm:hidden">
      {NAV_DESTINOS.map(({ to, etiqueta, Icono, fin }) => (
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
