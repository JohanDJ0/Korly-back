import type { FastifyInstance } from 'fastify';
import { registrarIngreso } from './registrar-ingreso.js';
import { montoDesdeDto, type MontoDto } from '../../shared/http.js';

interface RegistrarIngresoBody {
  monto: MontoDto;
  fechaEfectiva: string;
  nota?: string;
}

/**
 * Respuesta deliberadamente más delgada que el `Ingreso` de
 * docs/openapi.yaml (que incluye monto/fechaEfectiva/fechaRegistro
 * ecoados de vuelta): `ingresos` no guarda esos campos — viven en
 * `movimientos` (ver db/schema/ingresos.ts) — y reconstruirlos aquí
 * necesitaría una consulta nueva que ningún otro caller pide todavía.
 * `{id, movimientoId, periodoId}` alcanza para encadenar los pasos
 * siguientes del ciclo.
 */
export async function rutasIngresos(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/ingresos', async (request, reply) => {
    const body = request.body as RegistrarIngresoBody;
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await registrarIngreso({
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
