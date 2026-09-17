import { sql } from 'drizzle-orm';
import { boolean, check, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appBackend } from './roles.js';

export const PLANES = ['free', 'pro'] as const;
export type Plan = (typeof PLANES)[number];

/**
 * Unidad de aislamiento (ADR-005). En el MVP cada usuario personal es su
 * propio tenant de un solo miembro; Business reutilizará la misma tabla
 * con varios usuarios por tenant sin migración estructural.
 *
 * Políticas RLS:
 * - Lectura/edición: solo la fila cuyo id coincide con el tenant de la
 *   sesión actual (`app.tenant_id`). Nadie puede listar tenants ajenos.
 * - Alta: sin restricción de contenido (withCheck true). La creación de
 *   un tenant ocurre exclusivamente durante el aprovisionamiento de una
 *   identidad nueva (ver modulos/identidad/resolver-identidad.ts), antes
 *   de que exista un `app.tenant_id` que verificar contra la fila.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Opt-out de los recordatorios por correo (documento-maestro-v2.md
     * §13.4) — vive aquí, no en una tabla de preferencias aparte,
     * porque hoy es la única preferencia que existe y un tenant es de
     * un solo miembro (ver comentario de arriba); no vale la pena la
     * indirección de una tabla para un solo booleano.
     */
    recibirRecordatorios: boolean('recibir_recordatorios').notNull().default(true),
    /**
     * documento-maestro-v2.md §9.2 (Free/Pro/Business). Sin cobro real
     * todavía (Stripe+PAC es Fase 3, requiere que el usuario resuelva
     * primero su alta fiscal) — hasta entonces, subir un tenant a 'pro'
     * es una operación manual (UPDATE directo), no un endpoint propio:
     * un "actualízate a pro" de autoservicio sin nada de por medio que
     * cobre sería un gate falso, no una función a medio construir que
     * habría que rehacer cuando sí exista el cobro real.
     */
    plan: text('plan').notNull().default('free').$type<Plan>(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tenants_plan_valido', sql`${t.plan} in ('free', 'pro')`),
    pgPolicy('tenants_lectura_propia', {
      for: 'select',
      to: appBackend,
      using: sql`${t.id} = current_setting('app.tenant_id', true)::uuid`,
    }),
    pgPolicy('tenants_alta_aprovisionamiento', {
      for: 'insert',
      to: appBackend,
      withCheck: sql`true`,
    }),
    // Nueva: sin esta política, PATCH /preferencias fallaría en
    // silencio (RLS bloquea el UPDATE, cero filas afectadas) — mismo
    // hallazgo que ya se documentó para otras tablas: falta una
    // política no es un error visible, es una operación que no hace
    // nada. Solo la fila propia, igual que la de lectura.
    pgPolicy('tenants_actualizacion_propia', {
      for: 'update',
      to: appBackend,
      using: sql`${t.id} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.id} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ]
).enableRLS();
