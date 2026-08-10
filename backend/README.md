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

**Punto 4 — ingresos:** registrar un ingreso contra el periodo activo,
generando su asiento de ledger. Primer módulo que compone periodos +
ledger en una sola transacción.

**Punto 5 — gastos:** mismo patrón que ingresos con el signo
invertido. No requirió ningún cambio en el ledger — las variantes `Tx`
que forzó ingresos ya alcanzaban.

**Punto 6 — disponible:** el motor de flujo de caja (modelo-dominio.md
§5), puramente de lectura. No agrega tablas ni requirió variantes `Tx`
nuevas — compone `obtenerPeriodoActivo`, `existeIngresoParaPeriodo` y
`obtenerSaldoCuenta` tal cual ya existían.

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

**Dónde debe vivir la resolución perezoso del cierre (importante para
cuando se construya el módulo de cierre):** según ADR-004, el cálculo
perezoso significa que al consultar el periodo activo y encontrar que
su `fechaFin` ya pasó, el sistema debe reconocerlo y cerrarlo en ese
momento — no seguir sirviendo cifras de un periodo que ya terminó en
la realidad. Esa lógica pertenece a **este módulo** (probablemente
dentro de `obtenerPeriodoActivo`/`obtenerPeriodoActivoTx`: un periodo
con `fechaFin` pasada nunca debería devolverse como `'activo'`), no al
módulo de disponible. Ver la nota correspondiente en la sección
"Disponible" más abajo: el tope de "mínimo 1 día" que vive ahí hoy es
un parche temporal exactamente por esta ausencia, y debería volverse
redundante (defensa en profundidad, no el mecanismo principal) una vez
que este módulo resuelva el cierre perezoso de verdad.

## Ingresos

`src/db/schema/ingresos.ts` define `ingresos`.
`src/modulos/ingresos/registrar-ingreso.ts` expone `registrarIngreso`.

**Deliberadamente delgada:** la tabla `ingresos` solo guarda
`periodoId` + `movimientoId` — monto, moneda, fecha efectiva y nota
viven en `movimientos` (que el ingreso genera vía
`registrarMovimientoTx`), no se duplican. Leer un ingreso completo
implica un `JOIN` a `movimientos`; no hay una consulta así todavía
porque no hay endpoint que la necesite.

**Refactor que esto forzó en el ledger.** `registrarMovimiento` (y
`crearCuenta`, desde periodos) abrían su propia transacción, lo que
hacía imposible que otro módulo los compusiera atómicamente con su
propia lógica. Ambos ahora tienen una variante `*Tx` que recibe una
transacción ya abierta — `registrarIngreso` valida el periodo,
registra el movimiento y crea la fila de `ingresos` en una sola
transacción real, no en tres esperando que ninguna falle a la mitad.

**BOLA por `periodoId`, verificado, no solo asumido.**
`obtenerPeriodoPorId` filtra por `tenantId` en el `WHERE`, pero la
defensa real es la política RLS de `periodos`: pedir el periodo activo
de otro tenant por id devuelve `null` — el mismo resultado que un id
inexistente — porque RLS oculta la fila antes de que el código de
aplicación la vea. `test/integracion/ingresos.test.ts` prueba
exactamente ese caso (el periodo de otro tenant, no solo un UUID al
azar) contra `PERIODO_NO_ENCONTRADO`.

`ingresos` reutiliza el trigger de inmutabilidad del ledger
(`ledger_bloquear_mutacion`, migración 0002) en vez de definir uno
nuevo — ver
[`drizzle/0005_ingresos_inmutable.sql`](drizzle/0005_ingresos_inmutable.sql).

## Gastos

`src/db/schema/gastos.ts` define `gastos`.
`src/modulos/gastos/registrar-gasto.ts` expone `registrarGasto`. Es
prácticamente un espejo de `registrarIngreso` con la partida invertida
(`-monto` en la cuenta del periodo en vez de `+monto`) — mismas
validaciones (`VALIDACION`, `PERIODO_NO_ENCONTRADO`,
`PERIODO_NO_ACTIVO`), mismo patrón de RLS para BOLA vía `periodoId`,
misma inmutabilidad reutilizando `ledger_bloquear_mutacion`.

**No forzó ningún cambio en el ledger.** Este módulo reutiliza
`registrarMovimientoTx` y `obtenerPeriodoPorIdTx` sin modificarlos —
las variantes `Tx` que ingresos ya había forzado alcanzaron para
gastos. No hizo falta agregar una tercera de forma reactiva.

**Sobregiro permitido, sin suavizar** (modelo-dominio.md §5): un gasto
puede dejar el saldo de la cuenta del periodo en negativo y se
registra igual — no hay validación de "saldo suficiente". Probado
explícitamente en `test/integracion/gastos.test.ts`.

**Sin `categoriaId`.** La tabla no tiene columna de categoría: el
módulo de categorías no existe todavía y agregar una columna sin tabla
real a la que apuntar sería peor que omitirla. Se agrega cuando ese
módulo exista.

## Disponible (el motor de flujo de caja)

`src/modulos/disponible/motor-flujo-caja.ts` tiene la matemática pura
de modelo-dominio.md §5 (`calcularDiasRestantes`, `pisoDivisionBigInt`)
— sin base de datos, probada en `test/unidad/motor-flujo-caja.test.ts`.
`src/modulos/disponible/consultar-disponible.ts` la junta con periodos
e ingresos/ledger: `consultarDisponible(tenantId, fechaReferencia?)`.

No agrega tablas ni columnas — es puramente de lectura sobre lo que ya
existe, y **no persiste nada en ningún lado**: cada llamada vuelve a
leer el periodo activo, vuelve a comprobar si hay al menos un ingreso,
y vuelve a sumar los asientos del ledger para el saldo. No corre dentro
de una única transacción a propósito (a diferencia de
`registrarIngreso`/`registrarGasto`, donde la atomicidad protege una
escritura real): una pequeña discrepancia entre lecturas si algo se
escribe a mitad de la consulta no es un bug para un número que el
propio modelo de dominio define como recalculado en cada consulta.
`test/integracion/disponible.test.ts` lo prueba en vivo: dos consultas
con la misma fecha y sin escrituras de por medio dan el mismo
resultado; una consulta después de registrar un gasto nuevo cambia de
inmediato, sin que nada quede cacheado entre medio.

Cuatro puntos que pedían verificación explícita, no solo "no truena":

- **`sin_ingreso` no es un `$0` disfrazado.** Si el periodo activo no
  tiene ningún ingreso registrado (aunque ya tenga gastos), la función
  devuelve `{ estado: 'sin_ingreso', periodoId, calculadoEn }` — sin
  `disponibleValorMinimo` ni `cifraDiariaValorMinimo` en absoluto (el
  tipo `Disponible` es una unión discriminada que los excluye a nivel
  de TypeScript, no solo los deja en `0`). Dos tests: sin ningún
  movimiento, y con un gasto ya registrado pero sin ingreso.
- **El piso (floor), no un truncado hacia cero.** El operador `/` de
  `bigint` en JS trunca hacia cero, que **no es lo mismo** que el piso
  matemático para negativos: `-5000n / 7n` da `-714n` truncado, pero el
  piso real de `-714.285...` es `-715n`. Si hubiera usado el operador
  nativo sin corrección, un sobregiro se habría **subestimado**.
  `pisoDivisionBigInt` corrige explícitamente ese caso, probado en
  unidad (`3000n/7n` → `428n`, no `429n`; `-5000n/7n` → `-715n`, no
  `-714n`) y en integración con montos reales vía `consultarDisponible`.
- **El `+1` en el último día, probado con el caso exacto.** No "no
  truena en el último día" — un test crea un periodo, registra un
  ingreso, y consulta exactamente con `fechaReferencia = fechaFin`,
  afirmando `diasRestantes === 1`.
- **Nunca almacenado, confirmado por código y por comportamiento.** Por
  código: `grep -i "disponible\|saldo" src/db/schema/` no encuentra
  ninguna columna, solo comentarios — no hay dónde guardarlo aunque
  quisiera. Por comportamiento: los dos tests de la sección anterior.

**Extensión propia, fuera de lo que especifica el modelo de dominio —
y con fecha de caducidad conocida.** Si "hoy" ya pasó `fechaFin`
(el periodo debería estar cerrado, pero el módulo de cierre no existe
todavía), `calcularDiasRestantes` no deja que el resultado baje de 1 en
vez de dividir entre cero o un negativo. Es la lectura más conservadora
mientras no exista cierre automático — documentado y probado como lo
que es: una decisión mía llenando un hueco, no algo que ADR-004 o
modelo-dominio.md resuelvan directamente.

**Por qué el parche está aquí y no en periodos, y qué debe pasar
después (revisado explícitamente):** el lugar correcto para resolver
un periodo vencido no cerrado es la capa de **periodos**, no esta. Por
ADR-004, el cálculo perezoso significa que al consultar el periodo
activo y encontrar que su `fechaFin` ya pasó, el sistema debe
reconocerlo y cerrarlo ahí mismo — no seguir sirviendo cifras de un
periodo que ya terminó en la realidad. Esa lógica no existe todavía en
`obtenerPeriodoActivo` (solo cubre borrador → activo, ver la sección
"Periodos" de arriba), así que este tope de 1 día es el parche correcto
**mientras tanto**, no la solución. Cuando se construya el módulo de
cierre y la resolución perezosa viva en `obtenerPeriodoActivo` (un
periodo con `fechaFin` pasada nunca debería devolverse como
`'activo'`), este tope **debería volverse redundante en el camino
normal** — `disponible` nunca debería recibir un periodo vencido de
`obtenerPeriodoActivo` una vez que eso exista. En ese punto el tope
puede quedarse como salvaguarda defensiva (cinturón y tirantes, mismo
espíritu que el `tenantId` redundante en `obtenerPeriodoPorIdTx`), pero
ya no como el mecanismo que evita la división por cero en la práctica.
Si al construir cierre este tope sigue siendo necesario para que algo
pase las pruebas, es una señal de que la resolución perezosa de
periodos no quedó bien resuelta ahí.

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
- Un ingreso solo se registra contra un periodo Activo del mismo
  tenant; intentarlo contra un periodo ajeno falla igual que contra
  uno que no existe (RLS, no una comprobación aparte), y el registro
  es atómico (periodo validado + asiento + vínculo, todo o nada).
- Un gasto se comporta igual que un ingreso en validación y
  aislamiento, con el efecto contrario en el saldo, y sin bloquear el
  sobregiro (modelo-dominio.md §5).
- El motor de flujo de caja nunca inventa una cifra sobre datos
  incompletos (`sin_ingreso` es un estado real, no un `$0`), redondea
  siempre hacia el piso matemático incluso en sobregiro, cuenta el
  último día del periodo como 1 día y no 0, y no almacena ni cachea
  nada — cada consulta es un recálculo completo.

## Qué falta (siguientes puntos)

Cierre de periodo (transición activo → cerrado, resumen inmutable,
decisión de sobrante, incluyendo el arrastre automático de déficit
documentado en modelo-dominio.md §3) — ver el orden de construcción
acordado en la conversación de diseño. Ningún módulo tiene endpoints
HTTP todavía: eso llega en el último punto del walking skeleton.
