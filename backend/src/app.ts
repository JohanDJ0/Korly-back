import Fastify from 'fastify';
import { authPlugin } from './shared/auth.js';

export function crearApp() {
  const app = Fastify({ logger: true });

  // Fuera de /v1 y sin auth: healthcheck de infraestructura, no de dominio.
  app.get('/salud', async () => ({ estado: 'ok' }));

  app.register(
    async (v1) => {
      v1.register(authPlugin);

      // Prueba vertical del punto 1: JWT real de Supabase -> usuario/tenant
      // reales resueltos (o aprovisionados) contra Postgres con RLS activo.
      v1.get('/me', async (request) => ({
        usuarioId: request.identidad.usuarioId,
        tenantId: request.identidad.tenantId,
      }));
    },
    { prefix: '/v1' }
  );

  return app;
}
