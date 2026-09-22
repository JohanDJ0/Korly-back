import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema/index.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Falta DATABASE_URL en el entorno');
}

/**
 * Conexión con el rol `postgres` (el mismo que usan las migraciones,
 * `BYPASSRLS`) — **nunca importar esto desde un módulo que una ruta
 * HTTP pueda alcanzar.** Existe por un único motivo legítimo: el rol
 * `app_backend` (ver `shared/db.ts`) solo puede leer, vía RLS, la fila
 * de `tenants` que ya coincide con `app.tenant_id` — perfecto para
 * cada request (que siempre atiende a un tenant), inservible para
 * `scripts/enviar-recordatorios.ts`, que necesita enumerar TODOS los
 * tenants antes de saber a cuáles procesar (modulos/notificaciones/).
 *
 * No es el mismo riesgo que "el servidor sirviendo requests con este
 * rol" (la razón de ser de `app_backend`, ver `db/schema/roles.ts`):
 * un script de cron sin superficie HTTP, controlado por quien despliega
 * el código, no es alcanzable por un tenant atacante — bypass de RLS
 * aquí no rompe el aislamiento multi-tenant en la práctica. Aun así,
 * el único uso real es `listarTenantIdsConRecordatoriosActivosTx`
 * (enumerar, nunca leer datos de dominio de un tenant específico); todo
 * lo demás en ese módulo sigue pasando por `conTenant`/`app_backend`.
 *
 * **Segundo uso legítimo:** el webhook de Stripe
 * (`modulos/suscripciones/webhook.ts`). Un evento de Stripe llega sin
 * `app.tenant_id` — no hay sesión de usuario, la request viene firmada
 * por Stripe — y el primer paso es justo *descubrir* a qué tenant
 * pertenece buscando por `stripeCustomerId`, algo que RLS por diseño no
 * permite bajo `app_backend`. Mismo criterio de riesgo: la firma de
 * Stripe ya se verificó antes de tocar la BD (ver `webhook.ts`), y solo
 * toca las columnas de suscripción de la fila que el propio evento
 * identifica, nunca datos de dominio de otro tenant.
 */
const client = postgres(connectionString, { prepare: false });

export const dbAdmin = drizzle(client, { schema });
