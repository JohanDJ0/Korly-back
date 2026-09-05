import type { FastifyInstance } from 'fastify';
import { ErrorDominio } from './errores.js';

/**
 * Mapeo de `ErrorDominio.codigo` a status HTTP. `NO_SOPORTADO` → 501,
 * no 400: el valor es válido según el contrato (`docs/openapi.yaml`
 * lista `'ahorrar'` como una opción legítima de `DecisionSobranteRequest`),
 * simplemente no está implementado — 400 sería decir "tu request está
 * mal formado", que no es el caso.
 */
const CODIGO_A_STATUS: Record<string, number> = {
  VALIDACION: 400,
  PERIODO_NO_ENCONTRADO: 404,
  PERIODO_NO_ACTIVO: 409,
  SOBRANTE_YA_DECIDIDO: 409,
  NO_SOPORTADO: 501,
  GASTO_NO_ENCONTRADO: 404,
  // No documentados en openapi.yaml (que solo lista 404 genérico para
  // PATCH/DELETE /gastos/{gastoId}) — mismo criterio que NO_SOPORTADO:
  // agregamos el código que realmente distingue el caso, en vez de
  // forzarlo dentro de uno existente que significa otra cosa.
  SIN_PERIODO_ACTIVO: 409,
  GASTO_YA_REVERTIDO: 409,
};

/**
 * Traduce cualquier `ErrorDominio` lanzado por una ruta a la respuesta
 * `{ codigo, mensaje }` de `docs/openapi.yaml` con el status correcto —
 * un manejador global, no un `try/catch` repetido en cada ruta.
 *
 * Errores que no son `ErrorDominio` pero sí traen su propio
 * `statusCode` de 4xx (Fastify los genera solos: body JSON vacío o mal
 * formado, ruta inexistente, método no soportado) se respetan tal
 * cual, en vez de aplastarlos a 500 — encontrado probando el ciclo
 * completo contra el servidor real: un `POST /cerrar` sin body pero
 * con `Content-Type: application/json` es un 400 de Fastify
 * (`FST_ERR_CTP_EMPTY_JSON_BODY`), y devolver 500 ahí es
 * objetivamente incorrecto, no solo menos informativo. Cualquier otra
 * cosa (sin `statusCode`, o `statusCode >= 500`) sí es un bug real, se
 * registra y responde 500 genérico sin filtrar detalles internos.
 */
export function registrarManejadorErroresDominio(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ErrorDominio) {
      const status = CODIGO_A_STATUS[error.codigo] ?? 400;
      reply.code(status).send({ codigo: error.codigo, mensaje: error.message });
      return;
    }

    const errorConStatus = error as { statusCode?: number; message: string };
    const statusDeFastify = errorConStatus.statusCode;
    if (statusDeFastify && statusDeFastify >= 400 && statusDeFastify < 500) {
      reply.code(statusDeFastify).send({ codigo: 'SOLICITUD_INVALIDA', mensaje: errorConStatus.message });
      return;
    }

    app.log.error(error);
    reply.code(500).send({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
  });
}

export interface MontoDto {
  valorMinimo: number;
  moneda: string;
}

/**
 * ADR-002: "un solo lugar en el código convierte entre entero y
 * representación". Internamente los montos son `bigint`; `Monto` en
 * `docs/openapi.yaml` define `valorMinimo` como `integer` — un número
 * JSON, no un string — así que la conversión ocurre aquí, en el límite
 * HTTP, no antes.
 *
 * Sin pérdida para cualquier monto real: `Number.MAX_SAFE_INTEGER`
 * (2^53 - 1) son ~90 billones de pesos en centavos. Más allá de eso,
 * `Number(bigint)` pierde precisión silenciosamente — un límite
 * teórico ya implícito en que el propio contrato eligió `integer` y no
 * `string` para este campo (ver README, "Capa HTTP").
 */
export function montoADto(valorMinimo: bigint, moneda: string): MontoDto {
  return { valorMinimo: Number(valorMinimo), moneda };
}

export function montoDesdeDto(dto: MontoDto): { valorMinimo: bigint; moneda: string } {
  return { valorMinimo: BigInt(Math.trunc(dto.valorMinimo)), moneda: dto.moneda };
}
