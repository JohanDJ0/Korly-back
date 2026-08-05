# ADR-006 — API REST versionada con contrato OpenAPI

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** estilo, contrato y versionado de la API

---

## Contexto

La aplicación web es el primer cliente; el cliente móvil vendrá después (Fase 5) y debe consumir **exactamente la misma API**, que era un requisito original del proyecto.

Los clientes móviles **no se actualizan cuando el desarrollador quiere**: un usuario puede permanecer en una versión antigua durante meses.

## Opciones consideradas

1. **tRPC.**
2. **GraphQL.**
3. **REST con `/v1` y OpenAPI como contrato.**

## Decisión

**Opción 3.** Versión en la ruta (`/v1`) desde el primer endpoint. OpenAPI como fuente del contrato, con tipos generados para los clientes.

## Consecuencias

### Positivas

- Web y móvil consumen la misma API, cumpliendo el requisito original.
- Los tipos generados dan seguridad de tipos **sin acoplar** cliente y servidor.
- `/v1` desde el inicio significa que el día que se necesite romper compatibilidad, es posible hacerlo sin dejar clientes viejos rotos.

### Negativas

- **Mantener el contrato OpenAPI actualizado es trabajo continuo**, y es lo primero que se abandona bajo presión. Un contrato desincronizado del código es peor que no tenerlo.
- Más verboso que tRPC en el día a día. Se echará de menos tRPC durante las primeras semanas, cuando el único cliente sea la web.
- Versionar tiene costo: el día que exista `/v2`, hay que mantener dos.

## Mitigación de la desincronización

Generar el contrato **desde el código** (Fastify + JSON Schema / Typebox produce OpenAPI automáticamente), no mantenerlo como documento paralelo escrito a mano. Es la única forma realista de que no se desvíe.

## Alternativas descartadas

**tRPC.** Acopla cliente y servidor en un monorepo TypeScript. Funciona bien mientras el único cliente sea una web propia; se convierte en problema con móvil nativo o cualquier consumidor de terceros. Reversible en teoría, pero migrar la API completa después no es barato.

**GraphQL.** Añade complejidad significativa (problema N+1, caching, seguridad de queries, límites de profundidad) sin beneficio proporcional para un solo desarrollador y un dominio de esta forma.

## Referencias

- Documento Maestro v2, §6.5
