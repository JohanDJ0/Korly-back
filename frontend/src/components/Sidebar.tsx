import { NavLink } from 'react-router-dom';

import { NAV_DESTINOS } from '@/lib/nav-destinos';
import { cn } from '@/lib/utils';

/**
 * Versión de escritorio de BottomNav.tsx — mismos 5 destinos, misma
 * navegación, pero como columna fija a la izquierda en vez de barra
 * inferior (que en una pantalla ancha competiría por espacio con el
 * contenido y se ve fuera de lugar). Aparece desde `sm:` (640px), no
 * `md:` (768px) — hallazgo real: un tablet en vertical suele medir
 * justo alrededor de 768px, así que con el corte en `md` el menú
 * saltaba entre modo escritorio y modo móvil según el dispositivo
 * cayera un pixel a un lado u otro de esa frontera. Corriendo el corte
 * a `sm` deja todo el rango de tablet consistentemente en modo
 * escritorio (con contenido a una sola columna hasta `lg`, ver
 * Home.tsx/Metas.tsx). Se monta una sola vez en ProtectedRoute.tsx, no
 * en cada pantalla.
 */
export function Sidebar() {
  return (
    <aside className="border-border bg-card sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-1 border-r p-5 sm:flex">
      <div className="flex items-center gap-2 px-2 pb-6">
        <img src="/logo/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
        <span className="font-display text-base font-bold">Korly</span>
      </div>

      {NAV_DESTINOS.map(({ to, etiqueta, Icono, fin }) => (
        <NavLink
          key={to}
          to={to}
          end={fin}
          className={({ isActive }) =>
            cn(
              'text-muted-foreground flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium',
              isActive && 'bg-secondary text-primary'
            )
          }
        >
          <Icono size={19} strokeWidth={2.2} />
          {etiqueta}
        </NavLink>
      ))}
    </aside>
  );
}
