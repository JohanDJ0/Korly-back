import type { FastifyInstance } from 'fastify';
import { obtenerDesglose } from './desglose.js';
import { montoADto } from '../../shared/http.js';

/**
 * Extensión sobre `docs/openapi.yaml` (que no define desglose todavía) —
 * ver backend/README.md, "Desglose del periodo".
 */
export async function rutasDesglose(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { periodoId: string } }>('/periodos/:periodoId/desglose', async (request, reply) => {
    const desglose = await obtenerDesglose(request.identidad.tenantId, request.params.periodoId);
    const { moneda } = desglose;

    reply.send({
      periodoId: desglose.periodoId,
      fechaInicio: desglose.fechaInicio,
      fechaFin: desglose.fechaFin,
      totalGastado: montoADto(desglose.totalGastadoValorMinimo, moneda),
      totalVariable: montoADto(desglose.totalVariableValorMinimo, moneda),
      recurrentes: {
        total: montoADto(desglose.recurrentes.totalValorMinimo, moneda),
        items: desglose.recurrentes.items.map((item) => ({
          id: item.id,
          descripcion: item.descripcion,
          frecuencia: item.frecuencia,
          diaMes: item.diaMes,
          monto: montoADto(item.montoValorMinimo, moneda),
        })),
      },
      rubros: desglose.rubros.map((rubro) => ({
        clave: rubro.clave,
        etiqueta: rubro.etiqueta,
        tipo: rubro.tipo,
        monto: montoADto(rubro.montoValorMinimo, moneda),
      })),
      semanas: desglose.semanas.map((semana) => ({
        numero: semana.numero,
        fechaInicio: semana.fechaInicio,
        fechaFin: semana.fechaFin,
        dias: semana.dias,
        diasTranscurridos: semana.diasTranscurridos,
        total: montoADto(semana.totalValorMinimo, moneda),
        promedioDiario: montoADto(semana.promedioDiarioValorMinimo, moneda),
        rubros: semana.rubros.map((rubro) => ({ clave: rubro.clave, monto: montoADto(rubro.montoValorMinimo, moneda) })),
      })),
      semanaMasCara: desglose.semanaMasCara,
    });
  });
}
