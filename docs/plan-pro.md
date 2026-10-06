# Korly Pro — qué incluye y por qué

- **Estado:** definición de producto, 2026-10-05. Korly Pro **todavía no se vende** (`COBROS_HABILITADOS` apagado; Ajustes → Plan muestra "Korly Pro llegará pronto" y el botón "Avísame").
- **Fuente:** `documento-maestro-v2.md` §9.2 (empaquetado) + lo que se decidió después. Si algo de aquí contradice al documento maestro, manda este archivo para Pro.
- **Sin precios en la app** mientras no haya cobro. El precio sugerido del documento maestro (~$79–99 MXN/mes o ~$690–890 MXN/año) y los Price de Stripe (`$89/mes`, `$790/año`) se retoman al activar el cobro.

## Principio

El límite del plan gratuito está donde **escala el compromiso del usuario**, no en lo que crea el hábito (documento maestro §9). Por eso son gratis y se quedan gratis: la cifra del día, la captura, categorías personalizadas, recordatorios básicos, tarjetas/MSI y gastos recurrentes. Pro vende dos cosas: **compartir** y **llegar más lejos** con el mismo hábito.

## Qué incluye Pro

### Para compartir (el gancho)

| Ventaja | Qué ve el usuario | Estado |
|---|---|---|
| **Presupuesto en pareja o familia** | Dos personas llevan juntas la misma quincena: las dos registran gastos e ingresos y ven el mismo "cuánto me queda". | Sin construir. Documento maestro: "Finanzas compartidas", Pro = Sí (F4, 5–7 semanas). Requiere ADR nuevo (ver abajo). |
| **Metas en común** | Cada quien aporta desde su propia cuenta a la misma meta (viaje, enganche, fondo de emergencia) con las funciones normales de metas (aportar, usar el dinero, ver movimientos) y las dos ven el avance. | Sin construir. **Idea nueva (2026-10-05)**, no estaba en el documento maestro. Requiere ADR nuevo (ver abajo). |

### Para ir más lejos

| Ventaja | Qué ve el usuario | Estado |
|---|---|---|
| **Metas sin límite** | Free tiene 2 metas. | **Construido** (`LIMITE_METAS_FREE` en `modulos/metas/metas.ts`). |
| **Historial completo** | Free ve 12 meses de quincenas. | **Construido** (`MESES_HISTORIAL_FREE` en `modulos/periodos/crear-periodo.ts`). |
| **Exportar a CSV** | Gastos e ingresos para el contador o una hoja de cálculo. | **Construido** (`modulos/exportar/`, `FUNCION_PRO`). PDF: pendiente. |
| **Alertas de ritmo** | "Vas gastando más rápido de lo que alcanza tu quincena", antes de quedarse corto. Es la alerta de mayor valor según las conversaciones de campo (documento maestro §13, punto 4). | Sin construir (F2; puntuación RICE 6.4). |

### Del documento maestro y deliberadamente fuera de la lista

- **Periodos activos ilimitados** — hoy solo existe un periodo activo por usuario (modelo de dominio, regla 9); no hay nada que vender.
- **Recurrentes / MSI "completo"** — hoy todo el mundo tiene recurrentes y MSI completos. Quitarlos de Free sería un retroceso para quien ya los usa.
- **OCR de tickets** — Fase 2+, fuera del alcance; se anunciará si algún día existe.

## Reglas para esta lista

1. La tarjeta de Ajustes (`frontend/src/components/TarjetaPlan.tsx`, `GRUPOS_PRO`) y este archivo deben decir lo mismo. Al cambiar uno, cambiar el otro.
2. No anunciar en la tarjeta nada que no esté aquí. Mientras Pro sea "próximamente" se pueden listar las ventajas sin construir, pero **antes de cobrar** hay que decidir, para cada una, si ya existe: no se cobra por una promesa.
3. Lo que hoy ya es restricción de Free (metas, historial, CSV) no cambia con el lanzamiento: es lo que el usuario ya conoce.

## Diseño pendiente de las funciones compartidas

Son las dos ventajas más atractivas y las más caras de construir. La razón de fondo es el aislamiento de datos (ADR-005): **cada fila de dominio lleva un solo `tenant_id` y RLS solo deja ver las filas del tenant de la sesión; hoy cada usuario es un tenant de un solo miembro.**

Los dos casos son distintos:

- **Presupuesto compartido = un tenant con dos miembros.** El ADR-005 ya lo previó ("Business se vuelve una feature de producto, no una reescritura"). Hacen falta: una tabla de membresías (hoy `usuario → tenant` es 1 a 1), que una sesión elija en qué tenant opera (el personal o el compartido), invitaciones, qué pasa al salir uno de los dos, y de quién son los datos al eliminar una cuenta (ADR-008 hoy purga el tenant completo).
- **Meta en común entre dos cuentas personales = datos que cruzan tenants.** Una meta y su cuenta de ledger pertenecen a un solo tenant, así que no puede ser "de los dos" sin romper la regla. Caminos posibles:
  1. **Espacio compartido:** crear un tenant de dos miembros solo para las metas en común (y, más adelante, el presupuesto compartido). Cada persona conserva su tenant personal y además pertenece al espacio. Reutiliza el mismo mecanismo que el presupuesto compartido, por eso es el camino recomendado.
  2. **Meta espejo entre tenants:** cada cuenta tiene su propia meta y se sincronizan. Mantiene el aislamiento, pero obliga a conciliar saldos entre dos ledgers inmutables: mucha complejidad para poco.

  Hay que decidir además cómo se aporta: el aporte sale de la quincena de quien aporta (movimiento en su tenant) y entra a la meta del espacio (movimiento en el otro), y el ledger de partida doble exige que cada movimiento cuadre **dentro de un tenant**. Ese puente es lo difícil.

**Recomendación:** un ADR nuevo (ADR-011) antes de escribir código, que decida el "espacio compartido" y resuelva los aportes entre tenants. Hasta entonces, ambas ventajas son solo intención de producto. Documento maestro y `CLAUDE.md` las marcan como fuera del MVP ("finanzas compartidas": no implementar sin discusión previa).

## Privacidad del "Avísame"

Es una **finalidad voluntaria** del aviso de privacidad (sección 3): solo se usa el correo, una vez, para avisar que Pro existe, y el usuario puede retirar la petición en Ajustes → Plan. No usar la lista para ninguna otra comunicación sin cambiar el aviso (y volver a pedir aceptación, `VERSION_AVISO_PRIVACIDAD`).

## Cómo se mide el interés

El botón "Avísame" guarda `tenants.aviso_pro_solicitado_en`; `npm run metricas` muestra cuántos usuarios lo pidieron. Esa cifra, junto con la activación y la retención, es lo que decide cuándo activar el cobro y qué construir primero.
