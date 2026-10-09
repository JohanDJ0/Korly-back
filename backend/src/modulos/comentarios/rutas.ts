import type { FastifyInstance } from 'fastify';
import { enviarComentario, validarComentario } from './comentarios.js';

/**
 * Extensión sobre `docs/openapi.yaml`. Límite de 5 por hora: de sobra para una persona de buena fe, muy poco para
 * llenar la bandeja de soporte (y cada comentario es un correo que cuesta cuota de Resend).
 */
export async function rutasComentarios(app: FastifyInstance): Promise<void> {
  app.post('/comentarios', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const entrada = validarComentario(request.body);
    await enviarComentario(request.identidad.tenantId, entrada);
    reply.code(204).send();
  });
}
