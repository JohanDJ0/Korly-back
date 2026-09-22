import 'dotenv/config';
import Stripe from 'stripe';

const apiKey = process.env.STRIPE_SECRET_KEY;

/**
 * Mismo criterio que `shared/email.ts` con Resend: sin `STRIPE_SECRET_KEY`
 * (desarrollo, CI, `test:local`) esto es `null`, nunca un cliente
 * construido con una key vacía. Todo lo que de verdad llama a Stripe
 * (`modulos/suscripciones/`) recibe este cliente inyectado, así que los
 * tests siempre pasan un stub — mismo patrón que `resolverCorreo`.
 */
export const stripe = apiKey ? new Stripe(apiKey) : null;

export interface PreciosSuscripcion {
  mensual: string;
  anual: string;
}

/**
 * Ids de los `Price` de Stripe (`price_...`), creados una sola vez en el
 * dashboard/API de Stripe — nunca se generan en código, a diferencia del
 * Customer (que sí se crea por tenant, ver `obtenerOcrearClienteStripeTx`).
 * `undefined` en desarrollo/test es aceptable: nada que no llame a
 * `crearSesionCheckout` los necesita.
 */
export function obtenerPreciosSuscripcion(): PreciosSuscripcion {
  const mensual = process.env.STRIPE_PRICE_MENSUAL;
  const anual = process.env.STRIPE_PRICE_ANUAL;
  if (!mensual || !anual) {
    throw new Error('Faltan STRIPE_PRICE_MENSUAL/STRIPE_PRICE_ANUAL en el entorno');
  }
  return { mensual, anual };
}
