import type { FastifyInstance } from 'fastify';
import { cerrarPeriodoManualmente } from './cerrar-periodo.js';
import { decidirSobrante, type DecisionSobranteEntrada } from './decidir-sobrante.js';
import { obtenerResumen, type ResumenGenerado } from './generar-resumen.js';
import { ErrorDominio } from '../../shared/errores.js';
import { montoADto } from '../../shared/http.js';

/** Misma limitación que disponible/rutas.ts: decidirSobrante no rastrea moneda. */
const MONEDA_DEFAULT = 'MXN';

function resumenADto(resumen: ResumenGenerado) {
  return {
    periodoId: resumen.periodoId,
    totalIngresos: montoADto(resumen.totalIngresosValorMinimo, resumen.moneda),
    totalGastado: montoADto(resumen.totalGastadoValorMinimo, resumen.moneda),
    sobrante: montoADto(resumen.sobranteValorMinimo, resumen.moneda),
    decisionSobrante: resumen.decisionSobrante,
    generadoEn: resumen.generadoEn,
  };
}

export async function rutasCierre(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/cerrar', async (request, reply) => {
    const resumen = await cerrarPeriodoManualmente(request.identidad.tenantId, request.params.periodoId);
    reply.send(resumenADto(resumen));
  });

  /**
   * No distingue 404 ("el periodo no existe") de 409 ("existe pero no
   * está cerrado") como sí hace docs/openapi.yaml — ambos casos dan el
   * mismo `null` desde `obtenerResumen` (no hay fila en `resumenes`, y
   * no hay forma barata de saber cuál de las dos razones es sin una
   * consulta extra a `periodos`). Simplificación consciente para este
   * punto, no un descuido — ver README, "Capa HTTP".
   */
  app.get<{ Params: { periodoId: string } }>('/periodos/:periodoId/resumen', async (request, reply) => {
    const resumen = await obtenerResumen(request.identidad.tenantId, request.params.periodoId);
    if (!resumen) {
      return reply.code(404).send({
        codigo: 'PERIODO_NO_ENCONTRADO',
        mensaje: 'El periodo no existe o todavía no está cerrado (no tiene resumen)',
      });
    }
    reply.send(resumenADto(resumen));
  });

  app.post<{ Params: { periodoId: string } }>('/periodos/:periodoId/sobrante/decision', async (request, reply) => {
    const body = request.body as { decision?: string } | undefined;
    const decision = body?.decision;
    if (decision !== 'ahorrar' && decision !== 'arrastrar') {
      throw new ErrorDominio('VALIDACION', "El campo 'decision' debe ser 'ahorrar' o 'arrastrar'");
    }

    const resultado = await decidirSobrante(request.identidad.tenantId, request.params.periodoId, decision as DecisionSobranteEntrada);
    reply.send({
      periodoId: resultado.periodoId,
      decision: resultado.decision,
      montoAplicado: montoADto(resultado.montoAplicadoValorMinimo, MONEDA_DEFAULT),
    });
  });
}
