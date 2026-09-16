import type { FastifyInstance } from 'fastify';
import { actualizarPreferenciasNotificaciones, obtenerPreferenciasNotificaciones } from './preferencias.js';
import { ErrorDominio } from '../../shared/errores.js';

interface ActualizarPreferenciasBody {
  recibirRecordatorios?: boolean;
}

/**
 * Extensión sobre `docs/openapi.yaml` (que no define preferencias
 * todavía) — ver backend/README.md, "Recordatorios por correo".
 */
export async function rutasNotificaciones(app: FastifyInstance): Promise<void> {
  app.get('/preferencias', async (request, reply) => {
    const preferencias = await obtenerPreferenciasNotificaciones(request.identidad.tenantId);
    reply.send(preferencias);
  });

  app.patch('/preferencias', async (request, reply) => {
    const body = request.body as ActualizarPreferenciasBody | undefined;
    if (typeof body?.recibirRecordatorios !== 'boolean') {
      throw new ErrorDominio('VALIDACION', "El campo 'recibirRecordatorios' es obligatorio y debe ser booleano");
    }

    const preferencias = await actualizarPreferenciasNotificaciones(request.identidad.tenantId, body.recibirRecordatorios);
    reply.send(preferencias);
  });
}
