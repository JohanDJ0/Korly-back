import 'dotenv/config';
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const remitente = process.env.RESEND_REMITENTE ?? 'Korly <onboarding@resend.dev>';

const resend = apiKey ? new Resend(apiKey) : null;

export interface CorreoEntrada {
  para: string;
  asunto: string;
  textoPlano: string;
}

/**
 * Mismo criterio que `observabilidad.ts` con Sentry: sin `RESEND_API_KEY`
 * (desarrollo, CI, `test:local`) esto no manda nada y no truena — un
 * no-op explícito, no un intento de red que fallaría en silencio o
 * tumbaría el job. `resend` es `null` en ese caso, nunca se construye
 * un cliente con una API key vacía.
 *
 * Sin plantilla HTML a propósito: el contenido es una sola frase con
 * la cifra accionable (regla 1, documento-maestro-v2.md §13.4) — no
 * hay nada que un diseño le agregue todavía. `textoPlano` como body
 * también sirve de `text` para Resend, que ya genera un `html` mínimo
 * a partir de texto si no se le da uno explícito.
 */
export async function enviarCorreo(entrada: CorreoEntrada): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from: remitente,
    to: entrada.para,
    subject: entrada.asunto,
    text: entrada.textoPlano,
  });
}
