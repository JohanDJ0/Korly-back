import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import { db } from './shared/db.js';
import { authPlugin } from './shared/auth.js';
import { registrarManejadorErroresDominio } from './shared/http.js';
import { rutasPeriodos } from './modulos/periodos/rutas.js';
import { rutasIngresos } from './modulos/ingresos/rutas.js';
import { rutasGastos } from './modulos/gastos/rutas.js';
import { rutasDisponible } from './modulos/disponible/rutas.js';
import { rutasCierre } from './modulos/cierre/rutas.js';
import { rutasMetas } from './modulos/metas/rutas.js';
import { rutasCategorias } from './modulos/categorias/rutas.js';
import { rutasRecurrentes } from './modulos/recurrentes/rutas.js';
import { rutasExportar } from './modulos/exportar/rutas.js';
import { rutasImportar } from './modulos/importar/rutas.js';
import { rutasTarjetas } from './modulos/tarjetas/rutas.js';
import { rutasNotificaciones } from './modulos/notificaciones/rutas.js';
import { rutasSuscripciones } from './modulos/suscripciones/rutas.js';
import { rutasDesglose } from './modulos/desglose/rutas.js';
import { rutasCuenta } from './modulos/cuenta/rutas.js';
import { rutasWebhookStripe } from './modulos/suscripciones/rutas-webhook.js';

export interface OpcionesApp {
  /** Peticiones por minuto, por IP y por ruta. Por defecto `RATE_LIMIT_POR_MINUTO` o 600. */
  limitePorMinuto?: number;
  /** Por defecto `true`; las pruebas lo apagan. */
  logger?: boolean;
  /**
   * Por defecto `TRUST_PROXY === 'true'`. Detrás de un proxy (Railway,
   * Cloudflare...) TODOS los requests llegan desde la IP del proxy: sin
   * esto, el límite por IP sería uno solo compartido por todos los
   * usuarios. Pero activado sin proxy delante, cualquiera puede falsear
   * `X-Forwarded-For` y esquivar el límite — por eso es opt-in explícito.
   */
  trustProxy?: boolean;
}

const LIMITE_POR_MINUTO_POR_DEFECTO = 600;

function limiteDesdeEntorno(): number {
  const valor = Number(process.env.RATE_LIMIT_POR_MINUTO);
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_POR_MINUTO_POR_DEFECTO;
}

export function crearApp(opciones: OpcionesApp = {}) {
  const app = Fastify({ logger: opciones.logger ?? true, trustProxy: opciones.trustProxy ?? process.env.TRUST_PROXY === 'true' });
  registrarManejadorErroresDominio(app);

  /**
   * Fastify solo trae parser para `application/json` de fábrica — sin
   * esto, `POST /periodos/:id/{gastos,ingresos}/importar` (que recibe
   * el CSV como texto plano, simétrico a como lo entrega la
   * exportación) respondería 415 antes de que la ruta viera el body.
   * `parseAs: 'string'` porque el CSV puede traer texto no-ASCII
   * (acentos en `nota`/`categoria`) — un Buffer forzaría a decodificar
   * a mano en cada ruta.
   */
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

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

  /**
   * Cabeceras de seguridad estándar (nosniff, HSTS, no-referrer...). Es una
   * API JSON, no sirve HTML, así que el valor es modesto pero gratis.
   * `Cross-Origin-Resource-Policy: cross-origin` porque el frontend vive
   * en otro origen — el valor por defecto de helmet (`same-origin`) es para
   * recursos que no se piden desde otro sitio.
   */
  app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });

  /**
   * Límite de peticiones por IP. El contador global es **uno solo**,
   * compartido por todas las rutas sin configuración propia; las rutas con
   * `config.rateLimit` (cuenta, suscripción...) llevan un contador aparte y
   * mucho más estricto. Generoso por defecto — la app hace varias
   * peticiones por pantalla y refresca sola — porque está para frenar
   * inundaciones y abuso, no para dosificar a un usuario normal. El contador
   * vive en memoria: vale con una sola instancia; con varias habría que
   * moverlo a un almacén compartido.
   *
   * Corre ANTES de la autenticación (que por eso vive en `preValidation`,
   * ver shared/auth.ts), así que también frena a quien manda tokens falsos
   * y, con ello, las llamadas a Supabase Auth que cada uno provocaría.
   */
  app.register(rateLimit, {
    global: true,
    max: opciones.limitePorMinuto ?? limiteDesdeEntorno(),
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, contexto) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Demasiadas solicitudes. Intenta de nuevo en ${Math.max(1, Math.ceil(contexto.ttl / 1000))} segundos.`,
    }),
  });

  // Fuera de /v1 y sin auth: healthchecks de infraestructura, no de dominio.
  // Sin límite de peticiones: el orquestador los llama a intervalo fijo.
  app.get('/salud', { config: { rateLimit: false } }, async () => ({ estado: 'ok' }));

  /**
   * "Listo para recibir tráfico": además de estar vivo, la base de datos
   * contesta. Distinto de `/salud` a propósito — si la base cae, reiniciar
   * el proceso no la arregla; esto sirve para que el balanceador deje de
   * mandarle tráfico, no para matar el contenedor.
   */
  app.get('/salud/listo', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { estado: 'ok' };
    } catch (error) {
      app.log.error(error);
      return reply.code(503).send({ estado: 'sin_base_de_datos' });
    }
  });

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
      v1.register(rutasMetas);
      v1.register(rutasCategorias);
      v1.register(rutasRecurrentes);
      v1.register(rutasExportar);
      v1.register(rutasImportar);
      v1.register(rutasTarjetas);
      v1.register(rutasNotificaciones);
      v1.register(rutasSuscripciones);
      v1.register(rutasDesglose);
      v1.register(rutasCuenta);
    },
    { prefix: '/v1' }
  );

  // Fuera del bloque de arriba a propósito: Stripe llama este endpoint sin
  // el Bearer token de Supabase que `authPlugin` exige ahí dentro (ver
  // modulos/suscripciones/rutas-webhook.ts).
  app.register(rutasWebhookStripe, { prefix: '/v1/webhooks' });

  return app;
}
