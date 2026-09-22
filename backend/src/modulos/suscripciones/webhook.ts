import type Stripe from 'stripe';
import { stripe } from '../../shared/stripe.js';

/**
 * Verifica la firma `Stripe-Signature` contra el payload **crudo** (sin
 * parsear) — Stripe firma los bytes exactos que mandó, así que un
 * `JSON.parse`+`JSON.stringify` de por medio (aunque el contenido sea
 * "el mismo") rompe la verificación si el re-serializado no es
 * byte-a-byte idéntico. Por eso `rutas-webhook.ts` registra un content
 * type parser propio que deja el body como string sin tocar, en vez de
 * dejar que el parser de JSON de Fastify lo consuma primero.
 *
 * Lanza si la firma no es válida o si falta `STRIPE_WEBHOOK_SECRET` —
 * en ambos casos `rutas-webhook.ts` responde 400, nunca procesa un
 * evento sin verificar.
 */
export function verificarEventoStripe(payloadCrudo: string | Buffer, firma: string, clienteStripe = stripe): Stripe.Event {
  if (!clienteStripe) throw new Error('Falta STRIPE_SECRET_KEY en el entorno');
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) throw new Error('Falta STRIPE_WEBHOOK_SECRET en el entorno');
  return clienteStripe.webhooks.constructEvent(payloadCrudo, firma, secreto);
}
