import { ChevronRight, MessageSquareText } from 'lucide-react';
import { useState } from 'react';

import { FormularioComentarios } from '@/components/FormularioComentarios';
import { HojaInferior } from '@/components/HojaInferior';

/**
 * Entrada al formulario de comentarios. Dos presentaciones: `fila` (Ajustes, en el celular y en escritorio) y `menu`
 * (columna lateral de escritorio, ver Sidebar.tsx). El formulario vive en una `HojaInferior`, así no cambia de pantalla
 * y la ruta donde estabas queda registrada en el comentario.
 */
export function BotonComentarios({ variante = 'fila' }: { variante?: 'fila' | 'menu' }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {variante === 'fila' ? (
        <button type="button" onClick={() => setAbierto(true)} className="flex w-full items-center gap-3 text-left">
          <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
            <MessageSquareText size={17} className="text-secondary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">Enviar comentarios</div>
            <div className="text-muted-foreground text-[12px]">Cuéntanos qué falla o qué te gustaría que hiciera Korly.</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-muted-foreground hover:bg-secondary mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium"
        >
          <MessageSquareText size={19} strokeWidth={2.2} />
          Enviar comentarios
        </button>
      )}
      {abierto && (
        <HojaInferior titulo="Enviar comentarios" onCerrar={() => setAbierto(false)}>
          <FormularioComentarios onCerrar={() => setAbierto(false)} />
        </HojaInferior>
      )}
    </>
  );
}
