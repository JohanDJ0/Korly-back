import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta en un Chrome real (el que ya está instalado: no se descarga ningún navegador). Corren contra una
 * pila LOCAL y desechable —Postgres, la API real de Korly y un Supabase Auth de mentira, ver `backend/scripts/pila-e2e.ts`—
 * más el frontend real en Vite. Nunca tocan producción. `npm run e2e` desde frontend/.
 */
const PUERTO_WEB = 5199;
const ORIGEN_WEB = `http://localhost:${PUERTO_WEB}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e/resultados',
  // Una sola pila compartida: cada prueba crea su propia cuenta, pero en serie es más fácil de leer cuando algo falla.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: ORIGEN_WEB,
    channel: 'chrome',
    headless: true,
    locale: 'es-MX',
    // La quincena se calcula con la fecha de México, en el servidor y en el navegador: que coincidan.
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', testIgnore: '**/celular.e2e.ts', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 800 } } },
    { name: 'celular', testMatch: '**/celular.e2e.ts', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npx vite --port ${PUERTO_WEB} --strictPort`,
    url: ORIGEN_WEB,
    reuseExistingServer: false,
    timeout: 60_000,
    // Process env gana sobre frontend/.env: así ni la llave de Turnstile ni las URLs de producción entran en estas pruebas.
    env: {
      VITE_API_BASE_URL: 'http://localhost:3199/v1',
      VITE_SUPABASE_URL: 'http://localhost:54399',
      VITE_SUPABASE_ANON_KEY: 'llave-anonima-de-prueba',
      VITE_TURNSTILE_SITE_KEY: '',
      VITE_SENTRY_DSN: '',
      VITE_RESPONSABLE_NOMBRE: 'Persona de Prueba',
      VITE_RESPONSABLE_DOMICILIO: 'Calle de Prueba 1, Ciudad de Prueba',
      VITE_RESPONSABLE_JURISDICCION: 'Ciudad de Prueba',
    },
  },
});
