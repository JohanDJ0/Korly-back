import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from './supabase-admin.js';
import { resolverOcrearIdentidad, type IdentidadResuelta } from '../modulos/identidad/resolver-identidad.js';

declare module 'fastify' {
  interface FastifyRequest {
    identidad: IdentidadResuelta;
  }
}

/**
 * Resuelve la identidad interna (usuario_id, tenant_id) a partir del
 * Bearer token de Supabase Auth en cada request (ADR-003). El token se
 * valida contra Supabase, nunca se usa como identificador de dominio.
 */
export const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorateRequest('identidad', null, []);

  /**
   * `preValidation`, no `onRequest`: el límite de peticiones (app.ts) es un
   * hook `onRequest` de cada ruta, y esos corren DESPUÉS de los hooks
   * `onRequest` de instancia como este. Con auth en `onRequest`, una
   * petición con un token falso recibía 401 sin contar jamás contra el
   * límite — justo el abuso que había que frenar, y cada una costaba una
   * llamada a Supabase Auth. En `preValidation` (después de leer el cuerpo,
   * antes del handler) el límite corre primero. El preflight CORS no se ve
   * afectado: @fastify/cors lo responde en su propio `onRequest`.
   */
  fastify.addHook('preValidation', async (request, reply) => {
    const encabezado = request.headers.authorization;
    if (!encabezado?.startsWith('Bearer ')) {
      return reply.code(401).send({
        codigo: 'NO_AUTENTICADO',
        mensaje: 'Falta el encabezado Authorization: Bearer <token>',
      });
    }

    const token = encabezado.slice('Bearer '.length);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return reply.code(401).send({
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'El token no es válido o expiró',
      });
    }

    request.identidad = await resolverOcrearIdentidad(data.user.id);
  });
});
