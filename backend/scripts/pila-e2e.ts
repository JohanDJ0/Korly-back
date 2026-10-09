/**
 * Pila local para las pruebas de punta a punta (`npm run e2e` en frontend/): un Postgres desechable con las migraciones,
 * un Supabase Auth de mentira y la API REAL de Korly, todo en localhost y sin tocar producción. Playwright la arranca
 * (frontend/e2e/global-setup.ts) y la apaga al terminar; a mano: `npm run pila-e2e` en backend/.
 *
 * Protocolo con quien la lanza: imprime una línea `PILA_LISTA {...}` con los puertos cuando todo responde, y se apaga
 * limpio (API, auth falso y Postgres con su carpeta temporal) cuando recibe `SALIR` por la entrada estándar, cuando esa
 * entrada se cierra (si quien la lanzó murió) o con Ctrl+C. Un Postgres huérfano no se borra solo, de ahí lo del cierre.
 *
 * Seguridad: TODAS las variables que importan se fijan aquí a valores locales (dotenv no pisa las que ya existen), así
 * que el `backend/.env` de producción nunca entra en la pila. Y se niega a arrancar si algo no apunta a localhost.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
import { BACKEND_ROOT, aplicarMigraciones, iniciarPostgresEfimero } from './lib/postgres-efimero.js';
import { resolve } from 'node:path';
import { iniciarAuthFalso } from './lib/auth-falso.js';

const PUERTO_API = Number(process.env.E2E_PUERTO_API ?? 3199);
const PUERTO_AUTH = Number(process.env.E2E_PUERTO_AUTH ?? 54399);
const ORIGEN_WEB = process.env.E2E_ORIGEN_WEB ?? 'http://localhost:5199';
const BASE = 'korly_e2e';

function soloLocal(nombre: string, valor: string) {
  const host = new URL(valor).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`${nombre} apunta a ${host}: la pila de pruebas solo corre contra localhost.`);
}

async function main() {
  const registro = (m: string) => console.error(`[pila-e2e] ${m}`);
  const pg = await iniciarPostgresEfimero({ migrar: false, registro });

  // Base en UTF-8 como la de Supabase (el Postgres embebido de Windows nace en WIN1252 y rechazaría emojis en las notas).
  const admin = postgres(pg.urlAdmin, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${BASE} template template0 encoding 'UTF8' locale 'C'`);
  await admin.end();
  const urlAdmin = pg.urlDeBase(BASE);
  const urlApp = (() => {
    const u = new URL(pg.urlApp);
    u.pathname = `/${BASE}`;
    return u.toString();
  })();
  // Los permisos de `app_backend` son por base de datos: el bootstrap solo los dio en la base `postgres`, así que se repiten
  // aquí (sin el CREATE ROLE, que ya existe) ANTES de migrar, para que las tablas nuevas nazcan con ellos.
  const permisos = readFileSync(resolve(BACKEND_ROOT, 'scripts/bootstrap-roles-ci.sql'), 'utf8').replace(/create role app_backend[\s\S]*?noreplication;/i, '');
  const enBase = postgres(urlAdmin, { max: 1, onnotice: () => {} });
  await enBase.unsafe(permisos);
  await enBase.end();
  registro('aplicando migraciones...');
  await aplicarMigraciones(urlAdmin);

  const auth = await iniciarAuthFalso(PUERTO_AUTH);

  const entorno: Record<string, string> = {
    DATABASE_URL: urlAdmin,
    APP_DATABASE_URL: urlApp,
    SUPABASE_URL: `http://localhost:${PUERTO_AUTH}`,
    SUPABASE_SERVICE_ROLE_KEY: 'llave-de-servicio-de-prueba',
    CORS_ORIGIN: ORIGEN_WEB,
    FRONTEND_URL: ORIGEN_WEB,
    // Vacíos a propósito: ni correos, ni cobros, ni monitoreo, ni nada que hable con un servicio real.
    RESEND_API_KEY: '',
    RESEND_REMITENTE: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    SENTRY_DSN: '',
    COBROS_HABILITADOS: '',
    COMENTARIOS_DESTINO: '',
    NODE_ENV: 'development',
  };
  for (const clave of ['DATABASE_URL', 'APP_DATABASE_URL', 'SUPABASE_URL', 'CORS_ORIGIN']) soloLocal(clave, entorno[clave]!);
  Object.assign(process.env, entorno);

  // Importado DESPUÉS de fijar el entorno: shared/db.ts y shared/supabase-admin.ts lo leen al cargarse.
  const { crearApp } = await import('../src/app.js');
  const app = crearApp({ limitePorMinuto: 100000 }); // el recorrido hace muchas peticiones seguidas desde una sola IP
  await app.listen({ port: PUERTO_API, host: '127.0.0.1' });

  let cerrando = false;
  async function apagar() {
    if (cerrando) return;
    cerrando = true;
    registro('apagando...');
    await app.close().catch(() => {});
    await auth.cerrar().catch(() => {});
    await pg.detener();
    process.exit(0);
  }

  const lectura = createInterface({ input: process.stdin });
  lectura.on('line', (linea) => {
    if (linea.trim() === 'SALIR') void apagar();
  });
  process.stdin.on('end', () => void apagar()); // quien me lanzó murió: no dejar el Postgres huérfano
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());

  console.log(`PILA_LISTA ${JSON.stringify({ api: `http://localhost:${PUERTO_API}`, auth: `http://localhost:${PUERTO_AUTH}` })}`);
}

main().catch((error) => {
  console.error('[pila-e2e] no se pudo levantar la pila:', error);
  process.exit(1);
});
