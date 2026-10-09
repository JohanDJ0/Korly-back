import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Sin globals: cada prueba importa lo que usa de 'vitest', así tsc no necesita tipos globales extra.
    globals: false,
    // Las pruebas no hablan con nadie: estas variables solo existen para que lib/api.ts y lib/supabase.ts
    // (que fallan si faltan) se puedan importar. Los módulos de red se sustituyen con vi.mock en cada prueba.
    env: {
      VITE_API_BASE_URL: 'http://api.prueba.local/v1',
      VITE_SUPABASE_URL: 'https://supabase.prueba.local',
      VITE_SUPABASE_ANON_KEY: 'clave-de-prueba',
      // Vacías a propósito: Vitest también lee frontend/.env, y los datos reales del responsable no deben decidir si una prueba pasa.
      VITE_RESPONSABLE_NOMBRE: '',
      VITE_RESPONSABLE_DOMICILIO: '',
      VITE_RESPONSABLE_JURISDICCION: '',
      // Igual: con la llave real en frontend/.env los formularios pedirían un token de Cloudflare y las pruebas no sabrían dárselo. Las pruebas del captcha la fijan ellas mismas.
      VITE_TURNSTILE_SITE_KEY: '',
    },
    // Los recorridos de punta a punta (e2e/*.e2e.ts) los corre Playwright, no Vitest.
    exclude: ['**/node_modules/**', 'e2e/**'],
    css: false,
  },
});
