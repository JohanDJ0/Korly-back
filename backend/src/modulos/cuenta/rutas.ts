import type { FastifyInstance } from 'fastify';
import { eliminarCuenta } from './eliminar-cuenta.js';
import { exportarDatosCuenta, serializarDatosCuenta } from './exportar-datos.js';

interface EliminarCuentaBody {
  confirmacion?: unknown;
}

/**
 * Derechos ARCO de acceso y cancelación — extensión sobre
 * `docs/openapi.yaml` (ver backend/README.md, "Privacidad y derechos
 * ARCO"). Rectificación y oposición ya existen: editar los datos y
 * `PATCH /preferencias`.
 */
export async function rutasCuenta(app: FastifyInstance): Promise<void> {
  /** Sin gate de plan, a propósito: ver los propios datos no es una función de pago. */
  app.get('/cuenta/datos', async (request, reply) => {
    const datos = await exportarDatosCuenta(request.identidad.tenantId);
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="korly-mis-datos.json"')
      .send(serializarDatosCuenta(datos));
  });

  /**
   * POST y no DELETE: lleva un cuerpo (la palabra de confirmación) y no
   * todos los clientes/proxies aceptan cuerpo en un DELETE. El tenant sale
   * siempre de la identidad verificada, nunca del cuerpo.
   */
  app.post('/cuenta/eliminar', async (request, reply) => {
    const body = request.body as EliminarCuentaBody | undefined;
    const resultado = await eliminarCuenta(request.identidad.tenantId, body?.confirmacion);
    reply.send(resultado);
  });
}
