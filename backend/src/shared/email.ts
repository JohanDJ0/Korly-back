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
/**
 * **Hallazgo real, al probar contra la cuenta real:** el SDK de Resend
 * no lanza en un error de la API (límite del modo de prueba, dominio
 * sin verificar, etc.) — devuelve `{ data, error }`, y solo lo *loguea*
 * a consola por su cuenta. Sin este chequeo, `procesarRecordatorioDiarioDeTenant`
 * marcaba `enviado: true` (y `recordatorios_enviados` ya había
 * reclamado el día) aunque el correo nunca hubiera salido — el conteo
 * del job (`enviados`/`fallidos`) mentía. Lanzar aquí hace que el
 * `catch` por tenant en `scripts/enviar-recordatorios.ts` lo cuente
 * como lo que es: un fallo, no un envío.
 */
export async function enviarCorreo(entrada: CorreoEntrada): Promise<void> {
  if (!resend) return;

  const { error } = await resend.emails.send({
    from: remitente,
    to: entrada.para,
    subject: entrada.asunto,
    text: entrada.textoPlano,
  });
  if (error) {
    throw new Error(`Resend rechazó el envío: ${error.message}`);
  }
}
