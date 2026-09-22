import type { FastifyInstance } from 'fastify';
import { verificarEventoStripe } from './webhook.js';
import { procesarEventoStripe } from './suscripciones.js';

/**
 * Registrada aparte de `rutasSuscripciones` (fuera del bloque `/v1` con
 * `authPlugin`, ver `app.ts`) — Stripe llama este endpoint sin el Bearer
 * token de Supabase que el resto de la API exige. La autenticación real
 * es la firma `Stripe-Signature`, verificada en `webhook.ts` contra el
 * body crudo.
 */
export async function rutasWebhookStripe(app: FastifyInstance): Promise<void> {
  // Content type parser propio, scopeado a este plugin: deja el body tal
  // cual (string, sin parsear) en vez de dejar que Fastify lo convierta a
  // JSON antes de que la ruta lo vea — la verificación de firma necesita
  // los bytes exactos que Stripe firmó (ver el comentario de
  // `verificarEventoStripe`).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/stripe', async (request, reply) => {
    const firma = request.headers['stripe-signature'];
    if (typeof firma !== 'string') {
      return reply.code(400).send({ codigo: 'FIRMA_FALTANTE', mensaje: 'Falta el encabezado Stripe-Signature' });
    }

    let evento;
    try {
      evento = verificarEventoStripe(request.body as string, firma);
    } catch (error) {
      request.log.warn({ error }, '[webhook stripe] firma inválida o evento no verificable');
      return reply.code(400).send({ codigo: 'FIRMA_INVALIDA', mensaje: 'No se pudo verificar el evento' });
    }

    await procesarEventoStripe(evento);
    reply.code(204).send();
  });
}
