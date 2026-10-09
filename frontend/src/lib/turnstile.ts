/**
 * Cloudflare Turnstile (captcha sin acertijos): demuestra que quien se registra o inicia sesión no es un robot.
 *
 * Cómo se reparten el trabajo: el navegador carga el widget con la llave PÚBLICA del sitio (`VITE_TURNSTILE_SITE_KEY`),
 * recibe un token de un solo uso y lo manda a Supabase Auth junto con la petición (`options.captchaToken`); Supabase
 * lo valida con la llave SECRETA, que vive únicamente en su panel (Authentication → Attack Protection) y nunca en este
 * repositorio. El backend propio no interviene.
 *
 * Sin `VITE_TURNSTILE_SITE_KEY` el captcha queda apagado y nada cambia (pruebas, desarrollo sin llaves). Ojo con el orden
 * al activarlo en producción: primero se despliega la app con la llave del sitio y SOLO DESPUÉS se enciende el captcha
 * en Supabase; al revés, Supabase empezaría a exigir un token que la app todavía no manda y nadie podría entrar.
 */

const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface OpcionesWidget {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  appearance?: 'always' | 'execute' | 'interaction-only';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  /** Cloudflare manda un código de error (p. ej. `110200`: dominio no permitido en el widget). */
  'error-callback'?: (codigo?: string) => void;
}

export interface ApiTurnstile {
  render: (contenedor: HTMLElement, opciones: OpcionesWidget) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

/** Texto para cuando se intenta enviar antes de que termine la verificación. */
export const MENSAJE_CAPTCHA_PENDIENTE = 'Espera un momento: estamos verificando que eres una persona.';

/** La llave pública del sitio, o `undefined` si el captcha está apagado. Se lee en cada llamada para poder probarla. */
export function claveDeSitioTurnstile(): string | undefined {
  const clave = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  return clave ? clave : undefined;
}

let carga: Promise<ApiTurnstile> | undefined;

/** Inserta el script de Cloudflare una sola vez. Si no se puede cargar (bloqueador, sin red), la promesa se rechaza y se puede reintentar. */
export function cargarTurnstile(): Promise<ApiTurnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carga ??= new Promise<ApiTurnstile>((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = URL_SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolver(window.turnstile) : rechazar(new Error('Turnstile no se inicializó')));
    script.onerror = () => {
      carga = undefined; // permite reintentar al volver a montar el formulario
      script.remove();
      rechazar(new Error('No se pudo cargar Turnstile'));
    };
    document.head.appendChild(script);
  });
  return carga;
}

/** Solo para pruebas: olvida el script ya cargado. */
export function reiniciarCargaTurnstileParaPruebas(): void {
  carga = undefined;
}
