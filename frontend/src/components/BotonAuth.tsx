import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

type Variante = 'oro' | 'oscuro' | 'plano';

interface ComunProps {
  variante?: Variante;
  children: ReactNode;
  className?: string;
}

type BotonProps = ComunProps & Omit<ComponentProps<'button'>, 'children' | 'className'> & { to?: undefined };
type EnlaceProps = ComunProps & { to: string };

/**
 * Botón de las pantallas de acceso. `oro` (acción principal) y `oscuro` (secundaria) son "de tecla": la cara se hunde
 * al presionar y se ve el borde grueso de abajo (ver `.btn-3d` en index.css); `plano` es sin relieve, para acciones
 * discretas. Con `to` se comporta como enlace de React Router.
 */
export function BotonAuth(props: BotonProps | EnlaceProps) {
  const { variante = 'oro', children, className } = props;
  const clases = cn(variante === 'plano' ? 'btn-plano' : cn('btn-3d', variante === 'oscuro' && 'btn-3d--oscuro'), className);

  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={clases}>
        <span>{children}</span>
      </Link>
    );
  }

  const { variante: _variante, children: _hijos, className: _clase, to: _to, type = 'button', ...resto } = props;
  return (
    <button type={type} className={clases} {...resto}>
      {variante === 'plano' ? children : <span>{children}</span>}
    </button>
  );
}
