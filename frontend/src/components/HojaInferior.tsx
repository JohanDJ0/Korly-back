import { X } from 'lucide-react';
import { useEffect } from 'react';

interface HojaInferiorProps {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}

/**
 * Overlay genérico para "nuevo X" — reemplaza el patrón anterior de
 * expandir el formulario inline dentro de la página (Home.tsx seguía
 * creciendo hacia abajo cada vez que se abría uno). Deliberadamente sin
 * Radix Dialog: no hay otro modal en la app todavía que justifique la
 * dependencia — cierre por backdrop y Escape alcanza para el único caso
 * de uso real de hoy.
 *
 * En escritorio se centra como un diálogo normal (`md:items-center`,
 * esquinas redondeadas completas) — pegado abajo del todo (el patrón
 * de hoja inferior) solo tiene sentido como gesto de "deslizar hacia
 * abajo para cerrar" en una pantalla táctil angosta.
 */
export function HojaInferior({ titulo, onCerrar, children }: HojaInferiorProps) {
  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/40"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="bg-card relative flex max-h-[88vh] w-full max-w-sm flex-col gap-5 overflow-y-auto rounded-t-3xl p-6 pb-8 shadow-2xl md:rounded-3xl md:pb-6"
      >
        <div className="bg-muted mx-auto h-1 w-10 rounded-full md:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{titulo}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="bg-muted flex h-8 w-8 items-center justify-center rounded-full"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
