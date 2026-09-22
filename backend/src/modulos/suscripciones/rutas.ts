import type { FastifyInstance } from 'fastify';
import { crearSesionCheckout, crearSesionPortal, obtenerEstadoSuscripcion, type Intervalo } from './suscripciones.js';
import { ErrorDominio } from '../../shared/errores.js';

interface CrearCheckoutBody {
  intervalo?: Intervalo;
}

/**
 * `FRONTEND_URL`, no `CORS_ORIGIN` (app.ts): ese es una lista de
 * orígenes permitidos por CORS, esto es un único destino de redirección
 * tras el Checkout/Portal de Stripe — mismo dominio en la práctica, pero
 * conceptos distintos que no vale la pena forzar a compartir variable.
 */
function urlFrontend(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173';
}

/**
 * Extensión sobre `docs/openapi.yaml` (que no define suscripciones
 * todavía) — mismo criterio que `modulos/notificaciones/rutas.ts`.
 */
export async function rutasSuscripciones(app: FastifyInstance): Promise<void> {
  app.get('/suscripcion', async (request, reply) => {
    reply.send(await obtenerEstadoSuscripcion(request.identidad.tenantId));
  });

  app.post('/suscripcion/checkout', async (request, reply) => {
    const body = request.body as CrearCheckoutBody | undefined;
    if (body?.intervalo !== 'mensual' && body?.intervalo !== 'anual') {
      throw new ErrorDominio('VALIDACION', "El campo 'intervalo' es obligatorio y debe ser 'mensual' o 'anual'");
    }

    const sesion = await crearSesionCheckout({
      tenantId: request.identidad.tenantId,
      intervalo: body.intervalo,
      urlExito: `${urlFrontend()}/ajustes?suscripcion=exito`,
      urlCancelado: `${urlFrontend()}/ajustes?suscripcion=cancelado`,
    });
    reply.send(sesion);
  });

  app.post('/suscripcion/portal', async (request, reply) => {
    const sesion = await crearSesionPortal({
      tenantId: request.identidad.tenantId,
      urlRetorno: `${urlFrontend()}/ajustes`,
    });
    reply.send(sesion);
  });
}
