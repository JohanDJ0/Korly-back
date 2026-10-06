import type { FastifyInstance } from 'fastify';
import { ErrorDominio } from './errores.js';
import { reportarErrorInesperado } from './observabilidad.js';

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
  // ADR-009: reabrir un periodo cerrado solo es posible mientras su sobrante no se haya destinado y no haya actividad posterior; 409 porque depende del estado actual.
  REAPERTURA_NO_PERMITIDA: 409,
  NO_SOPORTADO: 501,
  GASTO_NO_ENCONTRADO: 404,
  // No documentados en openapi.yaml (que solo lista 404 genérico para
  // PATCH/DELETE /gastos/{gastoId}) — mismo criterio que NO_SOPORTADO:
  // agregamos el código que realmente distingue el caso, en vez de
  // forzarlo dentro de uno existente que significa otra cosa.
  SIN_PERIODO_ACTIVO: 409,
  GASTO_YA_REVERTIDO: 409,
  // Editar/eliminar ingreso es una extensión sobre openapi.yaml (que no
  // define PATCH/DELETE /ingresos/{id} todavía) — mismos códigos que su
  // espejo en gastos, ver backend/README.md.
  INGRESO_NO_ENCONTRADO: 404,
  INGRESO_YA_REVERTIDO: 409,
  META_NO_ENCONTRADA: 404,
  // Pagar con una meta (modulos/metas/metas.ts): a diferencia del retiro hacia la quincena, no se permite sobregirar la meta.
  SALDO_META_INSUFICIENTE: 409,
  // Aportar a una meta desde la quincena: el monto no puede pasar de lo disponible.
  APORTE_EXCEDE_DISPONIBLE: 409,
  PAGO_META_NO_ENCONTRADO: 404,
  PAGO_META_YA_REVERTIDO: 409,
  DEPOSITO_META_NO_ENCONTRADO: 404,
  DEPOSITO_META_YA_REVERTIDO: 409,
  CATEGORIA_NO_ENCONTRADA: 404,
  LIMITE_CATEGORIAS_ALCANZADO: 403,
  RECURRENTE_NO_ENCONTRADO: 404,
  TARJETA_NO_ENCONTRADA: 404,
  // Mismo criterio que LIMITE_CATEGORIAS_ALCANZADO (403): a diferencia
  // de "presupuesto excedido" (nunca se bloquea), el límite de crédito
  // de una tarjeta es un tope físico real — ver backend/README.md,
  // "Tarjetas de crédito y MSI".
  LIMITE_CREDITO_EXCEDIDO: 403,
  // Eliminar tarjetas/categorías/metas es una extensión sobre
  // openapi.yaml (que no define DELETE para ninguno de los tres
  // todavía) — 409 porque el bloqueo depende del estado actual del
  // recurso (¿ya tiene historial?), no de que el request esté mal
  // formado. Ver backend/README.md, "Eliminar tarjetas/categorías/metas".
  TARJETA_CON_HISTORIAL: 409,
  CATEGORIA_PREDETERMINADA: 409,
  CATEGORIA_EN_USO: 409,
  META_CON_HISTORIAL: 409,
  // modulos/tarjetas/registrar-cargo.ts, eliminarCargoTarjeta — mismo
  // criterio que GASTO_YA_REVERTIDO/INGRESO_YA_REVERTIDO.
  CARGO_NO_ENCONTRADO: 404,
  CARGO_YA_REVERTIDO: 409,
  // documento-maestro-v2.md §9.2 (Free/Pro) — mismo criterio que
  // LIMITE_CATEGORIAS_ALCANZADO/LIMITE_CREDITO_EXCEDIDO (403): el
  // request está bien formado, lo que falta es autorización de plan,
  // no un dato inválido.
  LIMITE_METAS_ALCANZADO: 403,
  FUNCION_PRO: 403,
  // modulos/suscripciones/: pedir el Portal de facturación sin haber
  // empezado nunca un checkout. Mismo criterio que SIN_PERIODO_ACTIVO:
  // el request está bien formado, lo que falta es un estado previo.
  SIN_SUSCRIPCION: 409,
  // Checkout/portal con `COBROS_HABILITADOS` apagado (Korly Pro "próximamente"). 403 como FUNCION_PRO: el request es válido, lo que falta es que la función exista para este usuario.
  COBROS_NO_DISPONIBLES: 403,
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
      // 429 lo genera @fastify/rate-limit (app.ts): código propio para que el cliente distinga "ve más despacio" de "tu solicitud está mal".
      const codigo = statusDeFastify === 429 ? 'DEMASIADAS_SOLICITUDES' : 'SOLICITUD_INVALIDA';
      reply.code(statusDeFastify).send({ codigo, mensaje: errorConStatus.message });
      return;
    }

    app.log.error(error);
    reportarErrorInesperado(error);
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

/**
 * Rechaza lo que no es un monto razonable ANTES de convertirlo: `BigInt(NaN)` o
 * `BigInt(Infinity)` lanzaban un `RangeError` (un 500 genérico), y un número
 * por encima de `Number.MAX_SAFE_INTEGER` ya perdió precisión al llegar como
 * JSON (el contrato eligió `integer`, ver `montoADto`). Los montos negativos o
 * en cero los rechaza cada operación de dominio con su propio mensaje.
 */
export function montoDesdeDto(dto: MontoDto): { valorMinimo: bigint; moneda: string } {
  if (typeof dto.valorMinimo !== 'number' || !Number.isFinite(dto.valorMinimo) || Math.abs(dto.valorMinimo) > Number.MAX_SAFE_INTEGER) {
    throw new ErrorDominio('VALIDACION', "El campo 'valorMinimo' debe ser un número entero dentro de un rango válido");
  }
  return { valorMinimo: BigInt(Math.trunc(dto.valorMinimo)), moneda: dto.moneda };
}
