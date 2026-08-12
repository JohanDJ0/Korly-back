import Fastify from 'fastify';
import { authPlugin } from './shared/auth.js';
import { registrarManejadorErroresDominio } from './shared/http.js';
import { rutasPeriodos } from './modulos/periodos/rutas.js';
import { rutasIngresos } from './modulos/ingresos/rutas.js';
import { rutasGastos } from './modulos/gastos/rutas.js';
import { rutasDisponible } from './modulos/disponible/rutas.js';
import { rutasCierre } from './modulos/cierre/rutas.js';

export function crearApp() {
  const app = Fastify({ logger: true });
  registrarManejadorErroresDominio(app);

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

      // Capa HTTP mínima (ver README): expone el ciclo central del
      // walking skeleton, no toda la API de docs/openapi.yaml todavía.
      v1.register(rutasPeriodos);
      v1.register(rutasIngresos);
      v1.register(rutasGastos);
      v1.register(rutasDisponible);
      v1.register(rutasCierre);
    },
    { prefix: '/v1' }
  );

  return app;
}
