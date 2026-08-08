import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema/index.js';

const connectionString = process.env.APP_DATABASE_URL;

if (!connectionString) {
  throw new Error('Falta APP_DATABASE_URL en el entorno');
}

// `prepare: false`: necesario si más adelante se conecta a través del
// pooler de Supabase (pgbouncer en modo transacción), que no soporta
// prepared statements. Sin costo real en conexión directa.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

/**
 * Ejecuta `fn` dentro de una transacción con `app.tenant_id` fijado para
 * esa transacción (ADR-005: "el contexto de tenant se establece en un
 * único punto del ciclo de request, nunca por consulta individual").
 *
 * `set_config(..., true)` con el tercer argumento en `true` equivale a
 * `SET LOCAL`: el valor se descarta solo al terminar la transacción, y al
 * pasar tenantId como parámetro (no interpolado en el texto SQL) se evita
 * inyección SQL en el nombre del tenant.
 */
export async function conTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
