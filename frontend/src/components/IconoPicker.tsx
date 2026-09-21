import { ICONOS_CATEGORIA } from '@/lib/icono-categoria';
import { cn } from '@/lib/utils';

interface IconoPickerProps {
  /** `null` = sin ícono elegido (respaldo por palabra clave). */
  value: string | null;
  onChange: (clave: string) => void;
}

/**
 * Cuadrícula del set fijo de íconos de categoría (ver
 * lib/icono-categoria.tsx) — usada al crear una categoría
 * (Categorias.tsx) y al editar una ya existente (FilaCategoria.tsx).
 *
 * `flex flex-wrap` en vez de un grid con columnas por breakpoint
 * (`sm:grid-cols-8`) a propósito — hallazgo real: esas columnas se
 * activan según el ancho de la VENTANA, no el de esta tarjeta. Dentro
 * de la cuadrícula de 2-3 columnas de Categorias.tsx, la tarjeta es
 * angosta aunque la ventana sea ancha, así que 8 columnas forzadas no
 * cabían y los íconos quedaban apretados/desalineados. `flex-wrap` con
 * un tamaño fijo por botón se acomoda solo al ancho real disponible,
 * sea cual sea.
 */
export function IconoPicker({ value, onChange }: IconoPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ICONOS_CATEGORIA.map(({ clave, etiqueta, Icono }) => {
        const seleccionado = value === clave;
        return (
          <button
            key={clave}
            type="button"
            title={etiqueta}
            aria-label={etiqueta}
            aria-pressed={seleccionado}
            onClick={() => onChange(clave)}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              seleccionado ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-input text-foreground'
            )}
          >
            <Icono size={17} />
          </button>
        );
      })}
    </div>
  );
}
