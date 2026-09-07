import Fastify from 'fastify';
import cors from '@fastify/cors';
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

  /**
   * El frontend (Vite, otro origen) manda un preflight `OPTIONS` antes de
   * cada request con Authorization — sin este plugin, Fastify no tiene
   * ninguna ruta para `OPTIONS` y responde 404, así que el navegador nunca
   * llega a mandar el request real. Ningún test/`.http`/curl anterior lo
   * necesitaba porque ninguno pasa por un navegador.
   *
   * `CORS_ORIGIN` es una lista separada por comas; por defecto, el puerto
   * de Vite en desarrollo. `credentials: true` no es necesario hoy (la
   * sesión viaja en el header `Authorization`, no en cookies) pero no
   * estorba y evita tener que revisarlo otra vez si eso cambia.
   */
  app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    // Explícito: el default de @fastify/cors no incluye PATCH/DELETE (se
    // comprobó contra el servidor real) — sin esto, el navegador bloquea
    // esos requests en el preflight aunque el 204 se vea bien.
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

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
