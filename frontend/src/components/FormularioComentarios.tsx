import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useEnviarComentario, type TipoDeComentario } from '@/hooks/use-enviar-comentario';
import { cn } from '@/lib/utils';

export const LONGITUD_MAXIMA_COMENTARIO = 2000;

const TIPOS: { valor: TipoDeComentario; etiqueta: string }[] = [
  { valor: 'problema', etiqueta: 'Algo falla' },
  { valor: 'idea', etiqueta: 'Tengo una idea' },
  { valor: 'otro', etiqueta: 'Otra cosa' },
];

const AYUDA: Record<TipoDeComentario, string> = {
  problema: 'Cuéntanos qué hiciste y qué pasó. Si algo no cuadra, dinos cuánto esperabas ver.',
  idea: 'Dinos qué te gustaría poder hacer y para qué lo usarías.',
  otro: 'Lo que quieras decirnos.',
};

/**
 * Formulario de comentarios dentro de una `HojaInferior`. Llega por correo al equipo con la pantalla donde estabas y un
 * identificador de tu cuenta; tu correo solo si marcas la casilla. Nunca se manda ningún monto (el texto es lo único
 * que escribes tú: pedimos no poner datos sensibles). Está dicho en el aviso de privacidad.
 */
export function FormularioComentarios({ onCerrar }: { onCerrar: () => void }) {
  const { pathname } = useLocation();
  const enviar = useEnviarComentario();
  const [tipo, setTipo] = useState<TipoDeComentario>('problema');
  const [mensaje, setMensaje] = useState('');
  const [responder, setResponder] = useState(false);
  const [vacio, setVacio] = useState(false);

  if (enviar.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="bg-secondary text-secondary-foreground rounded-xl px-3.5 py-3 text-[14px]">
          ¡Gracias! Tu comentario ya llegó al equipo de Korly. {responder ? 'Si hace falta, te escribiremos a tu correo.' : 'Los leemos todos.'}
        </p>
        <Button className="h-10 rounded-xl" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    );
  }

  function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (mensaje.trim().length === 0) {
      setVacio(true);
      return;
    }
    enviar.mutate({ tipo, mensaje: mensaje.trim(), pantalla: pathname, responder });
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
      <div role="radiogroup" aria-label="Tipo de comentario" className="grid grid-cols-3 gap-1.5">
        {TIPOS.map(({ valor, etiqueta }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={tipo === valor}
            onClick={() => setTipo(valor)}
            className={cn(
              'border-input rounded-xl border px-2 py-2 text-center text-[12.5px] leading-tight font-medium',
              tipo === valor ? 'border-primary bg-secondary text-primary' : 'text-muted-foreground'
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="comentario-mensaje">Tu comentario</Label>
        <textarea
          id="comentario-mensaje"
          value={mensaje}
          onChange={(evento) => {
            setMensaje(evento.target.value);
            if (vacio) setVacio(false);
          }}
          maxLength={LONGITUD_MAXIMA_COMENTARIO}
          rows={5}
          autoFocus
          placeholder={AYUDA[tipo]}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-xl border bg-transparent px-3 py-2.5 text-base outline-none focus-visible:ring-[3px] md:text-sm"
        />
        <div className="text-muted-foreground flex justify-between text-[11.5px]">
          <span>No escribas contraseñas ni datos de tus tarjetas.</span>
          <span>
            {mensaje.length}/{LONGITUD_MAXIMA_COMENTARIO}
          </span>
        </div>
        {vacio && <p className="text-destructive text-sm">Escribe tu comentario</p>}
      </div>

      <label className="flex items-start gap-2.5 text-[13px] leading-snug">
        <input type="checkbox" checked={responder} onChange={(evento) => setResponder(evento.target.checked)} className="accent-primary mt-0.5 h-4 w-4 shrink-0" />
        <span>Pueden escribirme a mi correo si necesitan preguntarme algo.</span>
      </label>

      <p className="text-muted-foreground text-[11.5px] leading-snug">
        Llega al equipo con la pantalla donde estabas y un identificador de tu cuenta, nunca con tus montos. Tu correo solo si marcas la casilla.
      </p>

      {enviar.isError && <p className="text-destructive text-sm">{enviar.error.message}</p>}

      <div className="flex gap-2">
        <Button type="submit" className="h-10 flex-1 rounded-xl" disabled={enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Enviar'}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" disabled={enviar.isPending} onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
