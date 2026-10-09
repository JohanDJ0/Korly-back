import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { cargarTurnstile, claveDeSitioTurnstile } from '@/lib/turnstile';

export interface CaptchaTurnstile {
  /** `false` si no hay llave del sitio: no se muestra nada y los formularios funcionan como siempre. */
  activo: boolean;
  /** Token de un solo uso listo para mandarse a Supabase; `undefined` mientras la verificación no termina. */
  token: string | undefined;
  /** Hubo un problema cargando o resolviendo la verificación (bloqueador de anuncios, sin conexión...). */
  fallo: boolean;
  /** Los tokens son de un solo uso: llamar después de CADA intento de envío, salga bien o mal. */
  reiniciar: () => void;
  contenedor: RefObject<HTMLDivElement | null>;
}

/**
 * Widget de Turnstile para un formulario. Pon `contenedor` en un `<div>` (ver `CaptchaDelFormulario`), manda `token`
 * como `options.captchaToken` en la llamada a Supabase y llama a `reiniciar()` al terminar el intento.
 *
 * `habilitado` sirve para formularios que se abren y se cierran dentro de una pantalla (Ajustes): el widget solo existe
 * mientras el formulario está abierto.
 */
export function useTurnstile(habilitado = true): CaptchaTurnstile {
  const clave = claveDeSitioTurnstile();
  const contenedor = useRef<HTMLDivElement>(null);
  const idDelWidget = useRef<string | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!clave || !habilitado) return;
    let cancelado = false;
    cargarTurnstile()
      .then((api) => {
        const destino = contenedor.current;
        if (cancelado || !destino) return;
        idDelWidget.current = api.render(destino, {
          sitekey: clave,
          theme: 'dark',
          // Casi siempre se resuelve sola, sin que la persona haga nada; solo se muestra si Cloudflare necesita que interactúe.
          appearance: 'interaction-only',
          callback: (nuevo) => {
            setToken(nuevo);
            setFallo(false);
          },
          'expired-callback': () => setToken(undefined),
          'error-callback': () => {
            setToken(undefined);
            setFallo(true);
          },
        });
      })
      .catch(() => {
        if (!cancelado) setFallo(true);
      });
    return () => {
      cancelado = true;
      const id = idDelWidget.current;
      idDelWidget.current = undefined;
      if (id) window.turnstile?.remove(id);
    };
  }, [clave, habilitado]);

  const reiniciar = useCallback(() => {
    setToken(undefined);
    const id = idDelWidget.current;
    if (id) window.turnstile?.reset(id);
  }, []);

  return { activo: Boolean(clave), token: habilitado ? token : undefined, fallo, reiniciar, contenedor };
}
