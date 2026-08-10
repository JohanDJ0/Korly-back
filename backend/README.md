# Backend — Korly (walking skeleton)

**Punto 1 — tenant + identidad + RLS:** un JWT real de Supabase Auth
llega hasta Postgres y resuelve (o crea) un usuario propio dentro de su
tenant, con RLS activo.

**Punto 2 — ledger (partida doble):** el motor genérico de cuentas,
movimientos y asientos (ADR-001) que usarán periodos, ingresos, gastos
y metas. Todavía no existen esos módulos ni sus endpoints HTTP — el
ledger se prueba directamente, sin pasar por la API.

**Punto 3 — periodos:** creación anclada a calendario (ADR-004, solo
quincenal) y el invariante de un solo periodo activo por tenant.
Tampoco tiene endpoints HTTP todavía.

## 1. Crear el proyecto Supabase

Crear un proyecto en https://supabase.com (plan free). De **Project
Settings**:
- **API** → `Project URL` (→ `SUPABASE_URL`) y `service_role` key (→
  `SUPABASE_SERVICE_ROLE_KEY`).
- **Database** → connection string del rol `postgres` (→ `DATABASE_URL`).

## 2. Variables de entorno

```bash
cp .env.example .env
```

Llenar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`.
`APP_DATABASE_URL` se llena en el paso 4, después de crear el rol.

## 3. Instalar dependencias

```bash
npm install
```

## 4. Crear el rol de runtime (`app_backend`)

**Una sola vez por proyecto Supabase.** Abrir el SQL Editor de Supabase,
pegar el contenido de [`scripts/bootstrap-roles.sql`](scripts/bootstrap-roles.sql),
reemplazar `<PASSWORD>` por una contraseña propia (no la del rol
`postgres`) y ejecutar.

Por qué existe este paso manual y no lo hace Drizzle: el rol `postgres`
de Supabase puede saltarse RLS (`BYPASSRLS`). Si el servidor sirviera
requests con ese rol, las políticas de aislamiento por tenant no se
aplicarían y nadie lo notaría hasta un incidente. `app_backend` es un
rol sin privilegios especiales, así que Postgres sí evalúa las
políticas para él. Ver [ADR-005](../docs/adr/005-tenant-id-rls.md).

Con la contraseña elegida, completar `APP_DATABASE_URL` en `.env`.

## 5. Generar y aplicar las migraciones

```bash
npm run db:generate   # produce SQL en ./drizzle a partir de src/db/schema
npm run db:migrate    # lo aplica contra DATABASE_URL (rol postgres)
```

## 6. Levantar el servidor

```bash
npm run dev
```

## 7. Probar el flujo real

Necesitas un JWT de un usuario de Supabase Auth. La forma más rápida sin
tener frontend todavía: Authentication → Users → crear un usuario de
prueba en el dashboard de Supabase, y desde la consola del navegador en
cualquier página con el SDK de Supabase cargado (o con un script node
suelto usando `@supabase/supabase-js` y `signInWithPassword`), obtener
`data.session.access_token`.

```bash
curl http://localhost:3000/salud

curl http://localhost:3000/v1/me \
  -H "Authorization: Bearer <access_token>"
```

La primera llamada con un usuario nuevo crea su tenant y su usuario
interno (aprovisionamiento just-in-time, ver
`src/modulos/identidad/resolver-identidad.ts`). Llamadas siguientes con
el mismo token devuelven el mismo `usuarioId`/`tenantId`.

## Tests de integración (contra Postgres real)

`test/integracion/aislamiento-tenant.test.ts` prueba que un tenant no
puede leer filas de otro (regla derivada de ADR-005).
`test/integracion/ledger.test.ts` prueba las invariantes del ledger
(ver sección siguiente). Ambos corren en CI en cada push/PR que toque
`backend/` ([`.github/workflows/backend-ci.yml`](../.github/workflows/backend-ci.yml)),
contra un Postgres efímero levantado como servicio — no necesitan
credenciales de Supabase.

Para correrlo en local hace falta un Postgres desechable propio (no tu
proyecto Supabase: el test inserta tenants/usuarios de prueba de verdad
y no los borra). Con un Postgres local en el puerto 5432:

```bash
psql "postgresql://postgres:<tu_password>@localhost:5432/postgres" \
  -f scripts/bootstrap-roles-ci.sql

DATABASE_URL="postgresql://postgres:<tu_password>@localhost:5432/postgres" npm run db:migrate

APP_DATABASE_URL="postgresql://app_backend:app_backend_ci@localhost:5432/postgres" \
SUPABASE_URL="https://placeholder.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="placeholder" \
npm test
```

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` son placeholders: el test no
pasa por `auth.ts`, así que nunca llama a Supabase de verdad, pero
`src/shared/supabase-admin.ts` exige que las variables existan al
importarse.

El primer test del archivo (`corre con el rol sin privilegios`) falla
a propósito si `APP_DATABASE_URL` apunta al rol `postgres` en vez de a
`app_backend` — así el resto de las aserciones no puede pasar "por
accidente" contra un rol que se salta RLS.

## El ledger (partida doble)

`src/db/schema/ledger.ts` define `cuentas`, `movimientos` y `asientos`.
`src/modulos/ledger/registrar-movimiento.ts` es la única puerta de
entrada para escribir en ellas: `crearCuenta`, `registrarMovimiento`,
`obtenerSaldoCuenta`. Ningún otro módulo debería insertar en `asientos`
directamente.

Dos invariantes de ADR-001 no se pueden expresar como `CHECK` de una
sola fila (comparan varias filas entre sí), así que viven como
triggers en [`drizzle/0002_ledger_triggers_integridad.sql`](drizzle/0002_ledger_triggers_integridad.sql) —
una migración escrita a mano con `drizzle-kit generate --custom`, no
generada del schema:

- **Balance:** la suma de los asientos de un movimiento es cero y
  comparten moneda. Es un *constraint trigger* `DEFERRABLE INITIALLY
  DEFERRED` porque los asientos de un movimiento se insertan uno por
  uno dentro de la misma transacción; se valida hasta el `COMMIT`.
- **Inmutabilidad:** ningún `UPDATE`/`DELETE` sobre `asientos` o
  `movimientos` — ambos disparan una excepción.

`test/integracion/ledger.test.ts` prueba las dos cosas contra Postgres
real, incluyendo saltarse a propósito la validación de la aplicación
(insertando con SQL crudo) para confirmar que el trigger de la base de
datos es quien realmente lo impide, no solo el código de
`registrar-movimiento.ts`.

`cuentaId` en un asiento puede ser `NULL`: representa la contraparte
externa al sistema (de dónde viene un ingreso, a dónde va un gasto) en
el modo simple del MVP, que no rastrea cuentas bancarias reales
(documento-maestro-v2.md §7.2). Decidí no crear una fila real de
"cuenta externa" — su saldo nunca se consulta, así que hubiera sido
una entidad sin uso más allá de balancear el asiento. Si en algún
punto se necesita distinguir el origen de varias contrapartes externas
(por ejemplo, para reportes), esa es la señal de que sí hace falta una
cuenta real y este atajo debe revisarse.

**Pendiente explícito — reversión de movimientos.** `movimientos` tiene
la columna `movimientoRevertidoId` y el tipo `'reversion'` existe en el
vocabulario de `TIPOS_MOVIMIENTO`, pero es solo preparación de
estructura: **ningún código genera hoy un movimiento de reversión**.
No hay un `revertirMovimiento()` que lea los asientos de un movimiento
original y cree los inversos. Eso llega con el módulo que edite o
elimine gastos de un periodo cerrado (ADR-001, modelo-dominio.md §3),
que todavía no existe en el walking skeleton.

## Periodos (anclaje a calendario)

`src/db/schema/periodos.ts` define `periodos`.
`src/modulos/periodos/crear-periodo.ts` expone `crearPeriodo` y
`obtenerPeriodoActivo`. `src/modulos/periodos/calcular-quincena.ts` es
la función pura del anclaje a calendario (ADR-004: 1–15 y 16–fin de
mes, nunca "inicio + N días") — probada sin base de datos en
`test/unidad/calcular-quincena.test.ts` contra los casos frontera que
el ADR pide explícitamente (meses de 30/31 días, febrero bisiesto y
no bisiesto, fin de año).

**Alcance deliberadamente reducido:** ADR-004 define cuatro tipos de
periodo (quincenal, semanal, mensual, personalizado). Solo
**quincenal** está implementado — es el caso dominante y el default
del producto. El `CHECK` de la tabla y `crearPeriodo` rechazan
explícitamente cualquier otro tipo (`TipoPeriodoSoportado` en el
schema); ampliarlo es trabajo pendiente, no un bug.

**Invariante de un solo periodo activo (invariante 9).** Un índice
único parcial (`WHERE estado = 'activo'`) es la autoridad real, no
solo la comprobación en `crearPeriodo`: si dos requests de "crear
periodo" del mismo tenant compiten, el índice rechaza al segundo
intento de activarse y el código lo reintenta como `'borrador'` dentro
de un `SAVEPOINT` (así no se pierde la cuenta de ledger ya creada en la
misma transacción). `test/integracion/periodos.test.ts` prueba esto
con dos llamadas concurrentes reales, no solo secuenciales.

**Pendiente explícito.** Este punto solo cubre borrador → activo. La
transición activo → cerrado, el resumen inmutable y la decisión de
sobrante son del módulo de cierre (siguiente en el orden acordado): un
periodo puede quedar `'activo'` más allá de su `fechaFin` sin que nada
lo detecte todavía — no hay cron ni cálculo perezoso de cierre. Tampoco
existe resolución a la zona horaria IANA del usuario (CLAUDE.md): "hoy"
es la fecha de calendario UTC del servidor.

## Qué valida este punto

- El backend nunca usa el `id` de Supabase Auth como `usuario_id` de
  dominio (ADR-003) — lo resuelve vía `identidades_externas`.
- Toda tabla de dominio tiene `tenant_id` y RLS activo desde la primera
  migración (ADR-005), evaluado por un rol sin `BYPASSRLS`.
- El contexto de tenant se fija una vez por transacción (`set_config`),
  nunca se filtra a mano por consulta.
- El aislamiento entre tenants está probado contra Postgres real y esa
  prueba corre en CI (ver sección anterior).
- El aprovisionamiento de una identidad nueva es idempotente bajo
  concurrencia: un advisory lock por `(proveedor, id_en_proveedor)`
  evita que dos requests casi simultáneas del mismo usuario nuevo creen
  dos tenants (mismo patrón exigido para los jobs de cierre, ver
  ADR-004).
- El ledger no puede descuadrarse: un movimiento desbalanceado o con
  monedas mezcladas lo rechaza la base de datos, no solo la
  aplicación; ningún asiento se edita ni se borra (ADR-001).
- Un tenant nunca tiene dos periodos activos, ni siquiera bajo
  solicitudes concurrentes (invariante 9), y el anclaje a calendario
  quincenal no tiene drift ni bugs de fin de mes (ADR-004).

## Qué falta (siguientes puntos)

Ingresos, gastos, disponible, cierre — ver el orden de construcción
acordado en la conversación de diseño. Periodos y ledger todavía no
tienen endpoints HTTP: los expondrán esos módulos.
