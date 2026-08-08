import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';
import { tenants } from './tenants.js';

/**
 * Identidad canónica del usuario (ADR-003): UUID propio, nunca el id del
 * proveedor de auth. Pertenece a un tenant (ADR-005).
 */
export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('usuarios_aislamiento_tenant', {
      for: 'all',
      to: appBackend,
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();

/**
 * Mapeo entre el usuario propio y su identidad en un proveedor externo
 * (ADR-003). Hoy solo existe el proveedor "supabase".
 *
 * Excepción deliberada de aislamiento: esta tabla NO filtra por tenant en
 * su política RLS (using: true), a diferencia de toda otra tabla de
 * dominio. Razón: el flujo de login busca la identidad por
 * (proveedor, id_en_proveedor) precisamente para DESCUBRIR el tenant —
 * exigir `app.tenant_id` de antemano haría imposible esa búsqueda. La
 * política sigue dando defensa en profundidad (bloquea a cualquier rol
 * que no sea app_backend); la seguridad de la búsqueda misma depende de
 * que el valor de id_en_proveedor provenga siempre del JWT ya verificado
 * por Supabase Auth, nunca de un parámetro que el cliente pueda elegir.
 */
export const identidadesExternas = pgTable(
  'identidades_externas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    proveedor: text('proveedor').notNull(),
    idEnProveedor: text('id_en_proveedor').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('identidades_externas_proveedor_id_unica').on(t.proveedor, t.idEnProveedor),
    pgPolicy('identidades_externas_acceso_backend', {
      for: 'all',
      to: appBackend,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ]
).enableRLS();
