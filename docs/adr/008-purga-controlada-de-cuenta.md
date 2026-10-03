# ADR-008 — Purga controlada de una cuenta (derecho de cancelación)

- **Estado:** aceptado
- **Fecha:** 2026-10-03
- **Decide:** cómo se elimina por completo la cuenta de un usuario sin debilitar la inmutabilidad del ledger
- **Matiza (no reemplaza):** [ADR-001](001-ledger-inmutable-partida-doble.md)

---

## Contexto

ADR-001 hace el ledger inmutable, y lo hace cumplir en la base de datos: un trigger de Postgres (`ledger_bloquear_mutacion`, migración 0002) rechaza cualquier `UPDATE` o `DELETE` sobre `asientos`, `movimientos`, `ingresos`, `gastos` y el `DELETE` de `resumenes`. No es una convención de la aplicación: ni siquiera la conexión de administración puede borrar una fila.

Pero Korly guarda datos financieros personales, y la LFPDPPP (nueva ley, DOF 20-mar-2025) da al titular derechos ARCO, entre ellos **cancelación**: pedir que sus datos se borren. Un usuario que cierra su cuenta tiene derecho a que sus movimientos, notas, metas y tarjetas dejen de existir.

Las dos cosas chocan: con el ledger inmutable, hoy es literalmente imposible eliminar una cuenta que tuvo un solo movimiento.

## Opciones consideradas

1. **Anonimizar y conservar las filas.** Desvincular al usuario (correo, identidad) y dejar los movimientos. **Descartada:** las notas y descripciones libres que escribe el usuario ("tacos con Laura", nombre de una meta) viven en filas inmutables, así que no se pueden limpiar; y conservar el historial de alguien que se fue no cumple el derecho de cancelación.
2. **Desactivar los triggers con `ALTER TABLE ... DISABLE TRIGGER`** durante la purga. **Descartada:** toma un bloqueo exclusivo sobre las tablas del ledger y detiene a todos los demás tenants mientras dura, y deja la protección apagada si algo falla a la mitad.
3. **Purga controlada:** los triggers siguen activos siempre, pero abren el `DELETE` —solo el `DELETE`— cuando se cumplen dos condiciones a la vez.

## Decisión

**Opción 3.** La función `ledger_purga_autorizada()` (migración 0019) devuelve verdadero solo si:

1. la transacción lo declaró (`set_config('app.purga_cuenta', 'on', true)`, local a la transacción), **y**
2. la sesión **no** es `app_backend`, el rol con el que el servidor atiende cada request.

`ledger_bloquear_mutacion()` y el chequeo diferido de balance (que de otro modo vería una suma `NULL` al borrar todos los asientos de un movimiento) consultan esa función; un `UPDATE` sigue rechazado siempre, sin excepción.

El único código que cumple ambas condiciones es `eliminarCuenta` (`modulos/cuenta/eliminar-cuenta.ts`), por la conexión de administración (`shared/db-admin.ts`), en **una sola transacción** que borra todas las tablas con `tenant_id` y luego la fila de `tenants`: todo o nada. El `tenantId` sale siempre de la identidad ya verificada del request, nunca del cuerpo. La orquestación completa es: borrar el Customer de Stripe (cancela sus suscripciones), purgar la base, borrar el usuario de Supabase Auth.

La lista de tablas a purgar (y exportar, para el derecho de acceso) es una sola (`modulos/cuenta/tablas-tenant.ts`), y una prueba la compara contra el catálogo de Postgres: una tabla nueva con `tenant_id` que nadie decidió cómo exportar o purgar rompe CI.

## Consecuencias

### Positivas

- La inmutabilidad de una cuenta **viva** no cambia en nada: el rol normal no puede borrar historial aunque un bug o una inyección fije el parámetro (hay una prueba que lo intenta).
- Cumple el derecho de cancelación de verdad, sin dejar filas huérfanas ni datos libres en el ledger.
- Sin bloqueos de tabla ni ventanas con la protección apagada: es un `DELETE` normal que los demás tenants no notan.

### Negativas

- Existe, por primera vez, un camino alcanzable desde una ruta HTTP autenticada que usa la conexión de administración (ver el comentario en `shared/db-admin.ts`). La seguridad descansa en que el `tenantId` viene del token verificado y en que cada `DELETE` está acotado a él.
- La eliminación es **irreversible**: no hay periodo de gracia (decisión del producto: sin hosting con tareas programadas, y una confirmación escrita es suficiente). Si se quisiera uno, bastaría marcar la cuenta y purgar después.
- Los respaldos de la base (Supabase) pueden conservar datos hasta que roten; el aviso de privacidad debe decirlo cuando exista una política de respaldos.
- Stripe conserva por su cuenta los registros de pago que la ley le obliga a guardar.

## Qué NO cambia

- Una corrección sigue siendo un movimiento de reversión (ADR-001). Esto no autoriza a borrar un gasto, un cargo ni una tarjeta: solo una cuenta completa, por decisión de su titular.
