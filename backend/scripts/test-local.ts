/**
 * `npm run test:local` — un solo comando que levanta un Postgres
 * efímero, crea el rol `app_backend`, aplica todas las migraciones,
 * corre la suite completa, y limpia todo al terminar. No depende de
 * pasos manuales fuera de este archivo (ver README, "Cómo correr los
 * tests localmente").
 *
 * Puerto elegido dinámicamente (nunca 5432 fijo): evita chocar con un
 * Postgres real que ya esté corriendo en la máquina, y permite correr
 * esto en paralelo con otra instancia efímera sin coordinarse.
 *
 * El directorio de datos vive en el temp del sistema operativo, no
 * dentro del repo — `persistent: false` hace que `pg.stop()` lo borre
 * completo (recursivo) al final, así que no hace falta limpiarlo a mano.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Misma contraseña que scripts/bootstrap-roles-ci.sql (que usa CI): el
// Postgres es efímero y solo escucha en localhost, no protege nada real.
const PASSWORD_APP_BACKEND = 'app_backend_ci';
const PASSWORD_ADMIN = 'postgres';

async function obtenerPuertoLibre(): Promise<number> {
  return new Promise((resolvePromesa, reject) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on('error', reject);
    servidor.listen(0, () => {
      const direccion = servidor.address();
      if (direccion && typeof direccion === 'object') {
        const puerto = direccion.port;
        servidor.close(() => resolvePromesa(puerto));
      } else {
        reject(new Error('No se pudo obtener un puerto libre para el Postgres de prueba'));
      }
    });
  });
}

async function main(): Promise<void> {
  const puerto = await obtenerPuertoLibre();
  const databaseDir = await mkdtemp(join(tmpdir(), 'korly-test-pg-'));

  const urlAdmin = `postgresql://postgres:${PASSWORD_ADMIN}@localhost:${puerto}/postgres`;
  const urlApp = `postgresql://app_backend:${PASSWORD_APP_BACKEND}@localhost:${puerto}/postgres`;

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: PASSWORD_ADMIN,
    port: puerto,
    persistent: false,
    onLog: () => {}, // silencia el log verboso de initdb/postgres; los errores sí se muestran
    onError: (error) => console.error('[postgres]', error),
  });

  let codigoSalida = 1;

  try {
    console.log(`[test:local] levantando Postgres efímero en el puerto ${puerto}...`);
    await pg.initialise();
    await pg.start();

    console.log('[test:local] creando el rol app_backend...');
    const sqlAdmin = postgres(urlAdmin, { max: 1 });
    const bootstrapSql = readFileSync(resolve(BACKEND_ROOT, 'scripts/bootstrap-roles-ci.sql'), 'utf8');
    await sqlAdmin.unsafe(bootstrapSql);
    await sqlAdmin.end();

    console.log('[test:local] aplicando migraciones...');
    const clienteMigraciones = postgres(urlAdmin, { max: 1 });
    await migrate(drizzle(clienteMigraciones), { migrationsFolder: resolve(BACKEND_ROOT, 'drizzle') });
    await clienteMigraciones.end();

    console.log('[test:local] migraciones aplicadas. Corriendo la suite...\n');
    const resultado = spawnSync('npx', ['vitest', 'run'], {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        APP_DATABASE_URL: urlApp,
        // Los tests nunca llaman a Supabase de verdad (no pasan por
        // auth.ts), pero shared/supabase-admin.ts exige que existan.
        SUPABASE_URL: 'https://test-local-placeholder.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-local-placeholder',
      },
    });
    codigoSalida = resultado.status ?? 1;
  } catch (error) {
    console.error('[test:local] fallo antes de terminar de correr los tests:', error);
    codigoSalida = 1;
  } finally {
    console.log('\n[test:local] deteniendo Postgres y limpiando datos temporales...');
    try {
      await pg.stop();
    } catch (errorAlDetener) {
      console.error('[test:local] no se pudo detener Postgres limpiamente (puede quedar un proceso colgado):', errorAlDetener);
    }
  }

  process.exit(codigoSalida);
}

main();
