import { CreditCard, History, House, MoreHorizontal, Target, type LucideIcon } from 'lucide-react';

export interface NavDestino {
  to: string;
  etiqueta: string;
  Icono: LucideIcon;
  /** `end` de NavLink — solo Inicio necesita match exacto, el resto son prefijos de ruta. */
  fin: boolean;
}

/** Compartido entre BottomNav.tsx (móvil) y Sidebar.tsx (escritorio) — mismos 5 destinos, misma navegación. */
export const NAV_DESTINOS: NavDestino[] = [
  { to: '/', etiqueta: 'Inicio', Icono: House, fin: true },
  { to: '/historial', etiqueta: 'Historial', Icono: History, fin: false },
  { to: '/metas', etiqueta: 'Metas', Icono: Target, fin: false },
  { to: '/tarjetas', etiqueta: 'Tarjetas', Icono: CreditCard, fin: false },
  { to: '/ajustes', etiqueta: 'Más', Icono: MoreHorizontal, fin: false },
];
