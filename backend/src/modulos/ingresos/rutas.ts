import type { FastifyInstance } from 'fastify';
import { editarIngreso, eliminarIngreso, listarIngresos, registrarIngreso, type IngresoDetallado } from './registrar-ingreso.js';
import { montoADto, montoDesdeDto, type MontoDto } from '../../shared/http.js';

function ingresoADto(ingreso: IngresoDetallado) {
  return {
    id: ingreso.id,
    periodoId: ingreso.periodoId,
    monto: montoADto(ingreso.montoValorMinimo, ingreso.moneda),
    fechaEfectiva: ingreso.fechaEfectiva,
    fechaRegistro: ingreso.fechaRegistro.toISOString(),
    nota: ingreso.nota ?? undefined,
    revertido: ingreso.revertido,
  };
}

interface RegistrarIngresoBody {
  monto: MontoDto;
  fechaEfectiva: string;
  nota?: string;
}

interface EditarIngresoBody {
  monto: MontoDto;
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

  app.get<{ Params: { periodoId: string } }>('/periodos/:periodoId/ingresos', async (request, reply) => {
    const ingresos = await listarIngresos(request.identidad.tenantId, request.params.periodoId);
    reply.send(ingresos.map(ingresoADto));
  });

  /**
   * Extensión sobre openapi.yaml (que solo define PATCH/DELETE para
   * gastos) — mismo mecanismo exacto que su espejo en
   * modulos/gastos/rutas.ts: revierte el movimiento original y, en
   * edición, registra uno nuevo contra el periodo activo actual. Sin
   * `categoriaId` porque `CrearIngresoRequest` nunca lo tuvo.
   */
  app.patch<{ Params: { ingresoId: string } }>('/ingresos/:ingresoId', async (request, reply) => {
    const body = request.body as EditarIngresoBody;
    const { valorMinimo, moneda } = montoDesdeDto(body.monto);

    const resultado = await editarIngreso({
      tenantId: request.identidad.tenantId,
      ingresoId: request.params.ingresoId,
      monto: valorMinimo,
      moneda,
      nota: body.nota,
    });

    reply.send({
      ingreso: { id: resultado.id, periodoId: resultado.periodoId, monto: montoADto(valorMinimo, moneda) },
      ajusteGenerado: resultado.ajusteGenerado,
      periodoDelAjuste: resultado.ajusteGenerado ? resultado.periodoId : null,
    });
  });

  app.delete<{ Params: { ingresoId: string } }>('/ingresos/:ingresoId', async (request, reply) => {
    await eliminarIngreso({ tenantId: request.identidad.tenantId, ingresoId: request.params.ingresoId });
    reply.code(204).send();
  });
}
