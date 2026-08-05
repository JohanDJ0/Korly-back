# ADR-007 — Separación entre periodo presupuestal y evento de ingreso

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** relación entre el periodo de presupuesto y la llegada real del dinero
- **Origen:** surgió al validar ADR-004 contra la realidad observada en campo

---

## Contexto

El planteamiento original trataba el periodo y la llegada del dinero como **la misma cosa**: "define la fecha de inicio y el sistema calcula la fecha de fin".

La realidad observada lo contradice:

- Por **LFT Art. 88**, si el pago cae en fin de semana o día festivo, se adelanta al día hábil anterior.
- En la práctica el pago también se corre por decisión del patrón, un día antes o un día después.
- Esto ocurre **varias veces al año. No es una excepción.**

Si periodo y pago son lo mismo, cada corrimiento reajusta el periodo, la cifra de gasto diario salta sin motivo aparente, y el usuario deja de entender el número. **En una aplicación cuyo producto entero es ese número, eso es fatal.**

## Opciones consideradas

1. **Periodo = fecha de pago.** Simple, pero se desajusta con cada corrimiento.
2. **Periodo fijo anclado a calendario; el ingreso es un evento separado** con su propia fecha.
3. **Periodo fijo con tolerancia configurable de ±N días.**

## Decisión

**Opción 2.**

| Concepto | Naturaleza |
|---|---|
| **Periodo presupuestal** | Unidad de planeación. Anclado a calendario (1–15 / 16–fin de mes). **Estable, no se mueve por corrimientos de pago** |
| **Ingreso** | Evento con fecha propia. Se registra cuando llegó realmente y se asocia al periodo que financia |

**El motor de flujo de caja cuenta los días restantes contra el fin del PERIODO, no contra el próximo pago.**

## Consecuencias

### Positivas

- **La cifra diaria es estable.** Si el pago llega el 30 en vez del 31, el usuario no ve un salto inexplicable.
- Los reportes son comparables entre periodos.
- Los periodos coinciden con meses naturales: los cortes mensuales cuadran sin acrobacias.
- Permite casos que el modelo unificado no soporta: **pago dividido en dos partes, bono a mitad de periodo, ingreso extra por trabajo informal** — todos son ingresos adicionales asociados al mismo periodo. Esto último importa especialmente dado el peso del empleo informal en el mercado objetivo.

### Negativas

- Dos conceptos donde antes había uno. Riesgo de fricción si se expone mal en el onboarding.
- **Caso incómodo:** si el pago se adelanta al periodo anterior (llega el 31 el pago que corresponde al 1–15 siguiente), hay que decidir la asociación.
- Un periodo puede quedarse **sin ingreso registrado** si el usuario se distrae.

## Reglas derivadas

1. **Regla de asociación:** el ingreso pertenece al **periodo que financia**, no al periodo en que cayó su fecha. El usuario puede corregirlo manualmente.
2. **Periodo sin ingreso:** es un estado válido pero **degradado**. La cifra de disponible **no debe presentarse como certera** si no hay ingreso capturado (ver riesgo de "cifra falsa", Documento Maestro §11).
3. Un ingreso puede reasignarse de periodo **sin destruir el ledger** (mediante reversión + nuevo asiento, per ADR-001).

## Nota de UX (crítica)

**Al usuario NO se le presentan dos conceptos.** Ve "esta quincena" y "ya me pagaron". La separación es interna al modelo.

**Si el onboarding obliga al usuario a entender la distinción, este ADR se implementó mal.**

## Consecuencias para el modelo de dominio (Fase 2)

- Periodo e Ingreso son entidades distintas, relacionadas de uno a muchos.
- Debe definirse el comportamiento del motor de flujo de caja ante un periodo sin ingreso.

## Referencias

- Documento Maestro v2, §11 (riesgo de cifra falsa), §12 (brecha 1)
- ADR-004 (periodos anclados)
- LFT Art. 88
