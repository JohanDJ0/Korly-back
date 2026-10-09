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
import { BACKEND_ROOT, iniciarPostgresEfimero } from './lib/postgres-efimero.js';

async function main(): Promise<void> {
  const pg = await iniciarPostgresEfimero({ migrar: true, registro: (mensaje) => console.log(`[test:local] ${mensaje}`) });
  const { urlAdmin, urlApp } = pg;

  let codigoSalida = 1;

  try {
    console.log('[test:local] migraciones aplicadas. Corriendo la suite...\n');
    // Los argumentos extra (p. ej. `npm run test:local -- test/integracion/gastos.test.ts`) se pasan a vitest.
    const resultado = spawnSync('npx', ['vitest', 'run', ...process.argv.slice(2)], {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        APP_DATABASE_URL: urlApp,
        // shared/db-admin.ts (modulos/notificaciones/) lee DATABASE_URL
        // en tiempo de ejecución, no solo drizzle-kit — sin este override,
        // un backend/.env real en este mismo directorio haría que
        // dotenv/config (que sí corre dentro del proceso de vitest)
        // cargara el DATABASE_URL de producción encima del efímero.
        // Mismo motivo que el override de APP_DATABASE_URL de arriba.
        DATABASE_URL: urlAdmin,
        // Los tests nunca llaman a Supabase de verdad (no pasan por
        // auth.ts), pero shared/supabase-admin.ts exige que existan.
        SUPABASE_URL: 'https://test-local-placeholder.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-local-placeholder',
        // Los tests nunca mandan correos de verdad (ver el parámetro
        // resolverCorreo/enviarCorreo inyectable en
        // modulos/notificaciones/enviar-recordatorios.ts) — vacío
        // aquí por la misma razón que DATABASE_URL arriba: que un
        // backend/.env real no filtre una API key real hacia los tests.
        RESEND_API_KEY: '',
        // Mismo motivo: los tests de modulos/suscripciones/ siempre pasan
        // un cliente de Stripe stub inyectado, nunca el real.
        STRIPE_SECRET_KEY: '',
        // Las pruebas fijan esta bandera ellas mismas donde importa; que un backend/.env con los cobros prendidos no cambie el resultado.
        COBROS_HABILITADOS: '',
      },
    });
    codigoSalida = resultado.status ?? 1;
  } catch (error) {
    console.error('[test:local] fallo antes de terminar de correr los tests:', error);
    codigoSalida = 1;
  } finally {
    console.log('\n[test:local] deteniendo Postgres y limpiando datos temporales...');
    await pg.detener();
  }

  process.exit(codigoSalida);
}

main().catch((error) => {
  console.error('[test:local] fallo antes de terminar de correr los tests:', error);
  process.exit(1);
});
