import type { FastifyInstance } from 'fastify';
import { exportarGastosCsv, exportarIngresosCsv } from './exportar.js';
import { ErrorDominio } from '../../shared/errores.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function validarFiltroFechas(query: { desde?: string; hasta?: string }): { desde?: string; hasta?: string } {
  for (const [nombre, valor] of [
    ['desde', query.desde],
    ['hasta', query.hasta],
  ] as const) {
    if (valor !== undefined && !FORMATO_FECHA.test(valor)) {
      throw new ErrorDominio('VALIDACION', `El parámetro '${nombre}' debe tener formato YYYY-MM-DD`);
    }
  }
  return { desde: query.desde, hasta: query.hasta };
}

/**
 * Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md §12,
 * "importación/exportación" — ver backend/README.md, "Exportación").
 * `Content-Disposition: attachment` es lo que le dice al navegador que
 * descargue el archivo en vez de intentar mostrarlo, aunque el request
 * se haga con `fetch` y no con una navegación directa.
 */
export async function rutasExportar(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/exportar/gastos.csv', async (request, reply) => {
    const filtro = validarFiltroFechas(request.query);
    const csv = await exportarGastosCsv(request.identidad.tenantId, filtro);
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="gastos.csv"').send(csv);
  });

  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/exportar/ingresos.csv', async (request, reply) => {
    const filtro = validarFiltroFechas(request.query);
    const csv = await exportarIngresosCsv(request.identidad.tenantId, filtro);
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="ingresos.csv"').send(csv);
  });
}
