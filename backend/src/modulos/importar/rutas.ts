import type { FastifyInstance } from 'fastify';
import { importarGastosCsv, importarIngresosCsv } from './importar.js';
import { ErrorDominio } from '../../shared/errores.js';

/**
 * Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md §12,
 * "importación/exportación" — ver backend/README.md, "Importación").
 * Recibe el CSV como `text/csv` en el body, no `multipart/form-data`:
 * el frontend ya lee el archivo con `FileReader` antes de mandarlo, así
 * que no hace falta que el backend maneje un upload multipart para
 * esto — es texto plano de principio a fin.
 */
export async function rutasImportar(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/gastos/importar', async (request, reply) => {
    const csv = request.body;
    if (typeof csv !== 'string' || csv.trim().length === 0) {
      throw new ErrorDominio('VALIDACION', "El body debe ser un CSV en texto plano con 'Content-Type: text/csv'");
    }
    const resultado = await importarGastosCsv(request.identidad.tenantId, request.params.periodoId, csv);
    reply.code(201).send(resultado);
  });

  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/ingresos/importar', async (request, reply) => {
    const csv = request.body;
    if (typeof csv !== 'string' || csv.trim().length === 0) {
      throw new ErrorDominio('VALIDACION', "El body debe ser un CSV en texto plano con 'Content-Type: text/csv'");
    }
    const resultado = await importarIngresosCsv(request.identidad.tenantId, request.params.periodoId, csv);
    reply.code(201).send(resultado);
  });
}
