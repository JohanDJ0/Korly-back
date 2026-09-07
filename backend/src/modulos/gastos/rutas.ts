import type { FastifyInstance } from 'fastify';
import { editarGasto, eliminarGasto, listarGastos, registrarGasto, type GastoDetallado } from './registrar-gasto.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function gastoADto(gasto: GastoDetallado) {
  return {
    id: gasto.id,
    periodoId: gasto.periodoId,
    monto: montoADto(gasto.montoValorMinimo, gasto.moneda),
    fechaEfectiva: gasto.fechaEfectiva,
    fechaRegistro: gasto.fechaRegistro.toISOString(),
    nota: gasto.nota ?? undefined,
    revertido: gasto.revertido,
  };
}

interface RegistrarGastoBody {
  monto: MontoDto;
  fechaEfectiva: string;
  nota?: string;
}

interface EditarGastoBody {
  monto?: MontoDto;
  categoriaId?: string;
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

  app.get<{ Params: { periodoId: string }; Querystring: { cursor?: string; limite?: string } }>(
    '/periodos/:periodoId/gastos',
    async (request, reply) => {
      const limite = request.query.limite !== undefined ? Number(request.query.limite) : undefined;
      if (limite !== undefined && (!Number.isInteger(limite) || limite < 1)) {
        throw new ErrorDominio('VALIDACION', "El parámetro 'limite' debe ser un entero positivo");
      }

      const resultado = await listarGastos(request.identidad.tenantId, request.params.periodoId, {
        cursor: request.query.cursor,
        limite,
      });

      reply.send({ datos: resultado.datos.map(gastoADto), siguienteCursor: resultado.siguienteCursor });
    }
  );

  /**
   * `categoriaId` es un campo válido en el contrato (openapi.yaml
   * EditarGastoRequest) pero no existe ninguna columna para categoría
   * todavía (ver comentario en db/schema/gastos.ts) — 501, no 400: el
   * campo está bien formado, simplemente no implementado.
   *
   * `monto` se exige aquí aunque el contrato lo marca opcional: como
   * `movimientos` también es inmutable, hasta "solo cambiar la nota"
   * exige el mismo reverso + asiento nuevo que cambiar el monto — no
   * hay un camino más barato para un cambio parcial. Simplificación
   * consciente documentada en el README, "Capa HTTP".
   */
  app.patch<{ Params: { gastoId: string } }>('/gastos/:gastoId', async (request, reply) => {
    const body = request.body as EditarGastoBody;
    if (body.categoriaId !== undefined) {
      throw new ErrorDominio('NO_SOPORTADO', 'Categorías todavía no están implementadas');
    }
    if (!body.monto) {
      throw new ErrorDominio('VALIDACION', "El campo 'monto' es obligatorio para editar un gasto");
    }
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await editarGasto({
      tenantId: request.identidad.tenantId,
      gastoId: request.params.gastoId,
      monto: valorMinimo,
      moneda,
      nota: body.nota,
    });

    reply.send({
      gasto: { id: resultado.id, periodoId: resultado.periodoId, monto: montoADto(valorMinimo, moneda) },
      ajusteGenerado: resultado.ajusteGenerado,
      periodoDelAjuste: resultado.ajusteGenerado ? resultado.periodoId : null,
    });
  });

  app.delete<{ Params: { gastoId: string } }>('/gastos/:gastoId', async (request, reply) => {
    await eliminarGasto({ tenantId: request.identidad.tenantId, gastoId: request.params.gastoId });
    reply.code(204).send();
  });
}
