import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // Rol de administración (postgres), usado solo para generar/aplicar migraciones.
    url: process.env.DATABASE_URL!,
  },
  entities: {
    roles: {
      // Evita que drizzle-kit intente gestionar los roles propios de Supabase
      // (anon, authenticated, service_role, postgres, etc.).
      provider: 'supabase',
    },
  },
});
