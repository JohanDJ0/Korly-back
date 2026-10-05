# ADR-010 — Contrato OpenAPI mantenido a mano, con una prueba que impide el desfase

- **Estado:** aceptado
- **Fecha:** 2026-10-05
- **Decide:** cómo se mantiene `docs/openapi.yaml` mientras no exista un cliente que lo consuma
- **Sustituye (solo) la sección "Mitigación de la desincronización" de:** [ADR-006](006-api-rest-versionada-openapi.md). El resto del ADR-006 (REST, `/v1`, OpenAPI como contrato) sigue vigente.

---

## Contexto

El ADR-006 advirtió que mantener el contrato a mano es "lo primero que se abandona bajo presión" y fijó como mitigación **generarlo desde el código** (Fastify + JSON Schema).

Eso no se hizo, y pasó lo que el ADR predijo: al 2026-10-05 el servidor tenía **59 operaciones** bajo `/v1` y el contrato documentaba **22**, varias de ellas con campos que ya no coincidían con las respuestas reales (por ejemplo `Periodo` prometía `tipo` y `tieneIngresoRegistrado`, y el listado de periodos prometía paginación que no existe).

Hoy **nadie consume el contrato**: el frontend usa tipos escritos a mano, no tipos generados. El costo real del desfase era solo de documentación — pero crece con cada endpoint y se volvería un problema serio el día que exista el cliente móvil (Fase 5).

## Opciones consideradas

1. **Actualizar a mano más una prueba automática de desfase.**
2. **Generar el contrato desde el código** (lo que pedía el ADR-006): esquemas de entrada y salida en las 59 rutas y `@fastify/swagger`.
3. **No hacer nada.**

## Decisión

**Opción 1, hasta que se acerque el cliente móvil.**

- `docs/openapi.yaml` se reescribió para coincidir con lo que el servidor responde de verdad: las 59 operaciones, los códigos de error de dominio, las convenciones de autenticación y límites.
- `backend/test/integracion/openapi.test.ts` compara las rutas que Fastify registra contra las operaciones documentadas, **en las dos direcciones**, y revisa que el archivo esté bien armado (todas las `$ref` resuelven, cada `{parámetro}` de una ruta está declarado, cada operación tiene etiqueta, resumen y respuestas). Si alguien agrega una ruta sin documentarla, o documenta una que no existe, la prueba falla — en CI también, porque el flujo del backend ahora corre cuando cambia `docs/openapi.yaml`.
- La prueba **no** compara los campos de cada respuesta. Eso sigue siendo trabajo manual, y lo cubren las pruebas de cada módulo.

## Por qué no la opción 2 todavía

Generar el contrato obliga a declarar el esquema de **cada** ruta, y Fastify usa los esquemas de respuesta para serializar: un esquema incompleto **recorta campos de la respuesta en silencio**. Es un cambio grande, con riesgo real, cuyo beneficio (tipos generados para un cliente) solo se cobra cuando ese cliente exista. La opción 1 elimina lo más dañino del desfase —rutas que nadie documentó— con una fracción del riesgo.

## Consecuencias

### Positivas

- El contrato vuelve a ser verdad, y el desfase de rutas **no puede reaparecer sin que falle una prueba**.
- Costo de mantenimiento bajo y a la vista: agregar una ruta ya obliga a tocar el contrato.

### Negativas

- Los **campos** de cada operación siguen dependiendo de la disciplina de quien cambie una respuesta. La prueba no los verifica.
- Hay que mantener a mano una dependencia de desarrollo (`yaml`) solo para leer el archivo en la prueba.

## Cuándo revisarlo

Cuando se empiece el cliente móvil (o cualquier consumidor externo), proponer un ADR que adopte la generación desde el código —esquemas Typebox en las rutas— y retire este. Para entonces el contrato escrito a mano sirve de punto de partida y de lista de verificación: la misma prueba puede comparar el contrato generado contra este.
