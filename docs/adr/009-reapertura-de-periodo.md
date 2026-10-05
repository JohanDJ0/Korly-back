# ADR-009 — Reapertura de un periodo cerrado por error

- **Estado:** aceptado
- **Fecha:** 2026-10-04
- **Decide:** cómo se deshace un cierre de periodo sin borrar historial ni debilitar la inmutabilidad del ledger
- **Matiza (no reemplaza):** [ADR-001](001-ledger-inmutable-partida-doble.md) y la invariante 5 de `modelo-dominio.md` ("un periodo cerrado no cambia de saldo nunca")

---

## Contexto

Un usuario real pulsó **Cerrar periodo** creyendo que era **Cerrar sesión** (el botón vivía en el mismo lugar de Home donde antes estaba el de sesión). El cierre es una sola transacción con tres efectos:

1. el periodo pasa a `cerrado`;
2. se genera un **resumen** (`resumenes`), que el esquema no permite borrar (ADR-001) y que es único por periodo;
3. el sobrante se **drena** a la cuenta `arrastre_pendiente` con un movimiento `arrastre_sobrante`, y queda una fila en `arrastres`.

Además, el cierre dispara la **promoción perezosa** del borrador siguiente: si había un borrador cuya ventana incluye hoy, pasa a `activo` y materializa sus gastos recurrentes y pagos de tarjeta. En el caso real, ese borrador tenía las mismas fechas que el periodo cerrado (ver "Higiene de borradores" en el README), así que el usuario quedó con dos periodos para la misma quincena: el suyo, cerrado, y un duplicado vacío con cargos automáticos.

No existía forma de deshacerlo. Reabrir "a mano" choca con tres cosas: no se puede borrar el resumen, el periodo solo admite uno (`unique(periodo_id)`), y el saldo del periodo ya fue drenado.

## Opciones consideradas

1. **Borrar el resumen con la purga controlada de ADR-008.** **Descartada:** esa excepción existe únicamente para eliminar una cuenta completa por derecho de cancelación; usarla para reparar datos de una cuenta viva abriría el `DELETE` del ledger a un segundo propósito.
2. **No ofrecer reapertura; solo evitar el clic accidental.** **Descartada:** reduce la probabilidad, pero un cierre equivocado sigue siendo irreversible, y el usuario pierde el control de su quincena por un error de un clic.
3. **Reapertura por anulación.** El resumen no se borra: se **anula** con una marca, y se permite uno nuevo para el mismo periodo. El drenaje y los efectos del borrador promovido se deshacen con **movimientos de reversión**, como cualquier corrección del ledger.

## Decisión

**Opción 3.** La migración 0020:

- agrega `resumenes.anulado_en` (nulo = vigente) y reemplaza `unique(periodo_id)` por un índice único **parcial** `where anulado_en is null`: un periodo tiene a lo sumo un resumen **vigente**, y conserva los anulados como historial;
- amplía el trigger `resumenes_validar_transicion`: además de decidir el sobrante, permite **una** transición más, poner `anulado_en` en un resumen vigente cuyo sobrante no se ha destinado (decisión `pendiente`, o `arrastrado` de un déficit con el arrastre aún sin reclamar). Un resumen anulado no se vuelve a modificar. El `DELETE` sigue bloqueado sin excepción;
- agrega el estado de periodo `descartado` para el duplicado que ya no tiene razón de existir. Se distingue de `archivado` porque el Historial muestra los `archivado`.

`reabrirPeriodo` (`modulos/cierre/reabrir-periodo.ts`), en **una sola transacción**:

1. exige que el periodo esté `cerrado`, que sea el **último** cerrado, que su `fechaFin` no haya pasado (si ya pasó, el cierre perezoso lo volvería a cerrar en el siguiente request) y que su sobrante **no se haya destinado** (ni a una meta, ni reclamado por otro periodo);
2. si hay un periodo `activo` posterior, solo lo descarta cuando **no tiene actividad del usuario**: únicamente gastos recurrentes y pagos de tarjeta materializados solos. Si el usuario ya registró algo ahí, se rechaza con un mensaje que lo explica, en vez de adivinar cómo mover esos movimientos;
3. revierte esos movimientos automáticos, **cada partida en su propia cuenta**, y marca el periodo `descartado`;
4. revierte el drenaje con un movimiento `reversion` ligado al original (`movimiento_revertido_id`);
5. anula el resumen y devuelve el periodo a `activo`.

Al volver a cerrar se genera un resumen nuevo; el anulado queda como historial. Todo lo que lee resúmenes o arrastres (`obtenerResumen`, el aviso de sobrante pendiente, el barrido de N días, el reclamo de arrastres) excluye los anulados.

## Consecuencias

### Positivas

- Un cierre equivocado es reversible mientras el dinero no se haya movido a otro lado, sin tocar la inmutabilidad: no se borra ni se edita ninguna fila del ledger, solo se agregan reversiones y una marca.
- Nada del `DELETE` del ledger se abre a un caso nuevo; la excepción de ADR-008 sigue siendo exclusiva de la purga de cuenta.
- Evita el duplicado del borrador promovido, que ya existía como problema independiente.

### Negativas

- Por primera vez el saldo de un periodo que estuvo cerrado vuelve a cambiar. Se acepta porque el periodo **deja de estar cerrado** al reabrirse (la invariante 5 habla de periodos `cerrado`) y porque cada cambio queda como un movimiento visible, no como una edición.
- Un resumen anulado sigue en la tabla. Quien lea `resumenes` directamente debe filtrar `anulado_en is null` (las lecturas de la aplicación ya lo hacen; una prueba lo comprueba).
- La reapertura es deliberadamente estrecha (último periodo, sin actividad posterior, sobrante sin destinar). Fuera de esos casos se rechaza con una razón clara; ampliarla requeriría decidir cómo reubicar movimientos de otro periodo.

## Qué NO cambia

- Una corrección sigue siendo un movimiento de reversión (ADR-001).
- La purga de ADR-008 sigue abriendo el `DELETE` solo para eliminar una cuenta completa.
