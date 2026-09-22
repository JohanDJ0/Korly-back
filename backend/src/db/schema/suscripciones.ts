import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Idempotencia del webhook de Stripe (`modulos/suscripciones/webhook.ts`)
 * — Stripe garantiza *al menos una* entrega por evento, nunca exactamente
 * una (reintenta si no recibe 200 a tiempo), así que sin este registro un
 * mismo `checkout.session.completed` reenviado podría, por ejemplo,
 * reconciliarse dos veces. `id` es el id del evento (`evt_...`), que
 * Stripe garantiza único — insertar antes de procesar y que la segunda
 * entrega falle por índice único (mismo patrón que
 * `recordatorios_enviados`, ver `enviar-recordatorios.ts`).
 *
 * Sin RLS/política para `app_backend` a propósito: esta tabla no la
 * toca ninguna request de un tenant, solo el webhook vía `dbAdmin` (ver
 * `shared/db-admin.ts`) — con RLS habilitada y cero políticas, el rol de
 * la app queda sin ningún acceso por defecto, que es exactamente lo
 * que se quiere aquí.
 */
export const eventosWebhookStripe = pgTable('eventos_webhook_stripe', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(),
  procesadoEn: timestamp('procesado_en', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
