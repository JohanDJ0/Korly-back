import { Lightbulb } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PasoDeGuiaProps {
  titulo?: string;
  texto: string;
  /** Lo que hace el botón principal ("Siguiente", "Entendido", "Terminar"...). */
  etiquetaPrincipal: string;
  onPrincipal: () => void;
  /** Segunda acción con su propio texto ("Ahora no"). */
  etiquetaSecundaria?: string;
  onSecundaria?: () => void;
  /** Sin esto no se ofrece "Saltar guía" (el último paso ya cierra por sí mismo). */
  onSaltar?: () => void;
}

/**
 * Un paso de la guía de primeros pasos (lib/guia.ts), en línea dentro de la pantalla real: va pegado al elemento que
 * explica (que la pantalla resalta con `RESALTADO_GUIA`). No es un globo flotante a propósito: en el celular un globo
 * anclado a un elemento se descoloca con cualquier cambio de diseño; un aviso en el flujo no.
 */
export function PasoDeGuia({ titulo, texto, etiquetaPrincipal, onPrincipal, etiquetaSecundaria, onSecundaria, onSaltar }: PasoDeGuiaProps) {
  return (
    <section aria-label="Guía de Korly" className="border-brand-gold/60 bg-brand-gold/10 flex flex-col gap-2.5 rounded-2xl border p-3.5">
      <div className="flex items-start gap-2.5">
        <Lightbulb size={16} className="text-brand-gold-foreground mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          {titulo && <h2 className="text-[14px] font-semibold">{titulo}</h2>}
          <p className="text-[13px] leading-snug">{texto}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-[26px]">
        <Button type="button" size="sm" className="rounded-xl" onClick={onPrincipal}>
          {etiquetaPrincipal}
        </Button>
        {etiquetaSecundaria && onSecundaria && (
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onSecundaria}>
            {etiquetaSecundaria}
          </Button>
        )}
        {onSaltar && (
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground rounded-xl" onClick={onSaltar}>
            Saltar guía
          </Button>
        )}
      </div>
    </section>
  );
}

/** Se le pone al elemento que el paso activo está explicando (el elemento aporta su propio redondeo). El aro y su latido están en index.css. */
export const RESALTADO_GUIA = 'resaltado-guia';
