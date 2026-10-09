/**
 * Postgres desechable para scripts y pruebas: levanta uno de verdad (embedded-postgres) en un puerto libre y un
 * directorio temporal, crea el rol `app_backend`, opcionalmente aplica las migraciones, y lo borra todo al detenerlo.
 * Lo usan `npm run test:local` y `npm run respaldo:probar`. Nunca toca el puerto 5432 ni un Postgres real de la máquina.
 */
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

export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Misma contraseña que scripts/bootstrap-roles-ci.sql (que usa CI): el Postgres es efímero y solo escucha en
// localhost, no protege nada real.
const PASSWORD_APP_BACKEND = 'app_backend_ci';
const PASSWORD_ADMIN = 'postgres';

export interface PostgresEfimero {
  puerto: number;
  urlAdmin: string;
  urlApp: string;
  /** URL de administración hacia otra base del mismo servidor. */
  urlDeBase: (nombre: string) => string;
  detener: () => Promise<void>;
}

async function obtenerPuertoLibre(): Promise<number> {
  return new Promise((resolverPuerto, rechazar) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on('error', rechazar);
    servidor.listen(0, () => {
      const direccion = servidor.address();
      if (direccion && typeof direccion === 'object') {
        const puerto = direccion.port;
        servidor.close(() => resolverPuerto(puerto));
      } else {
        rechazar(new Error('No se pudo obtener un puerto libre para el Postgres de prueba'));
      }
    });
  });
}

export async function aplicarMigraciones(urlAdmin: string): Promise<void> {
  const cliente = postgres(urlAdmin, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(cliente), { migrationsFolder: resolve(BACKEND_ROOT, 'drizzle') });
  } finally {
    await cliente.end();
  }
}

export async function iniciarPostgresEfimero(opciones: { migrar: boolean; registro?: (mensaje: string) => void }): Promise<PostgresEfimero> {
  const registro = opciones.registro ?? (() => {});
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

  const detener = async () => {
    try {
      await pg.stop();
    } catch (error) {
      console.error('No se pudo detener Postgres limpiamente (puede quedar un proceso colgado):', error);
    }
  };

  try {
    registro(`levantando Postgres efímero en el puerto ${puerto}...`);
    await pg.initialise();
    await pg.start();

    registro('creando el rol app_backend...');
    const sqlAdmin = postgres(urlAdmin, { max: 1 });
    await sqlAdmin.unsafe(readFileSync(resolve(BACKEND_ROOT, 'scripts/bootstrap-roles-ci.sql'), 'utf8'));
    await sqlAdmin.end();

    if (opciones.migrar) {
      registro('aplicando migraciones...');
      await aplicarMigraciones(urlAdmin);
    }
  } catch (error) {
    await detener();
    throw error;
  }

  const urlDeBase = (nombre: string) => {
    const url = new URL(urlAdmin);
    url.pathname = `/${nombre}`;
    return url.toString();
  };
  return { puerto, urlAdmin, urlApp, urlDeBase, detener };
}
