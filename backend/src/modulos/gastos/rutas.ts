import type { FastifyInstance } from 'fastify';
import { registrarGasto } from './registrar-gasto.js';
import { montoDesdeDto, type MontoDto } from '../../shared/http.js';

interface RegistrarGastoBody {
  monto: MontoDto;
  fechaEfectiva: string;
  nota?: string;
}

/** Misma respuesta delgada que ingresos/rutas.ts, mismo motivo. */
export async function rutasGastos(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/gastos', async (request, reply) => {
    const body = request.body as RegistrarGastoBody;
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await registrarGasto({
      tenantId: request.identidad.tenantId,
      periodoId: request.params.periodoId,
      monto: valorMinimo,
      moneda,
      fechaEfectiva: body.fechaEfectiva,
      nota: body.nota,
    });

    reply.code(201).send({ id: resultado.id, movimientoId: resultado.movimientoId, periodoId: request.params.periodoId });
  });
}
