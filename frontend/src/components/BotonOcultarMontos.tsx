import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePrivacidadStore } from '@/stores/privacidad-store';

/**
 * El ojito: oculta o muestra todos los montos de la app. `aria-pressed` es true mientras están ocultos. Va en la
 * tarjeta de la cifra de Inicio y en el encabezado de las demás pantallas (`PageHeader`).
 */
export function BotonOcultarMontos({ className }: { className?: string }) {
  const oculto = usePrivacidadStore((s) => s.oculto);
  const alternar = usePrivacidadStore((s) => s.alternar);
  const Icono = oculto ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oculto}
      aria-label={oculto ? 'Mostrar montos' : 'Ocultar montos'}
      title={oculto ? 'Mostrar montos' : 'Ocultar montos'}
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', className)}
    >
      <Icono size={17} strokeWidth={2.1} />
    </button>
  );
}
