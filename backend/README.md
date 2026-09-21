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

**Punto 7 — cierre:** transición activo → cerrado perezosa de verdad
(cierra la conexión con disponible del punto anterior), resumen
inmutable, y decisión del sobrante (positivo: `ahorrar`/`arrastrar`;
déficit: automático). No tocó el mecanismo de reversión de ADR-001 —
el arrastre es un movimiento hacia adelante, no una corrección.

**Punto 8 — arrastre:** materializa de verdad el sobrante/déficit
decidido como `arrastrar`, vía una cuenta `arrastre_pendiente` por
tenant. Cierra el compromiso explícito dejado en el punto 7.

**Punto 9 — promoción de borrador:** un periodo en `'borrador'` ahora
sí transiciona a `'activo'` cuando le toca (modelo-dominio.md §3), en
vez de quedar huérfano para siempre. Con la condición estricta
`fechaInicio <= hoy <= fechaFin`, no la literal "ya llegó su fecha de
inicio" — ver esa sección para por qué.

**Punto 10 — capa HTTP mínima:** los ocho endpoints necesarios para
ejercer el ciclo completo (crear periodo, ingresos, gastos, disponible,
cerrar, resumen, decidir sobrante, periodo siguiente) — no toda la API
de `docs/openapi.yaml` todavía. Probado de punta a punta contra el
servidor real y un proyecto Supabase real, no solo con los tests.

**Punto 11 — editar/eliminar gasto:** genera por fin el
`movimientoRevertidoId` que quedó pendiente desde el punto 2 (ADR-001).
Un solo mecanismo (reversión, nunca mutación) para ambos casos —
periodo activo o ya cerrado — que solo cambia a qué periodo va a parar
la corrección. De paso, corrigió un hallazgo real: `registrarIngreso`/
`registrarGasto` nunca habían expuesto `fechaReferencia`, lo que dejaba
buena parte de la suite de tests dependiente de la fecha real del
reloj (ver sección "Gastos").

**Punto 12 — listar ingresos y gastos:** `GET /periodos/:periodoId/ingresos`
y `GET /periodos/:periodoId/gastos` (este último paginado por keyset,
`?cursor&limite`) — lo mínimo para que un cliente pueda ver de vuelta
lo que ya capturó, no solo el resumen agregado. Un gasto editado o
eliminado sigue apareciendo tal cual en la lista (nunca hard delete).

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

Con la contraseña elegida, completar `APP_DATABASE_URL` en `.env` —
usando el **connection pooler** de Supabase, no la conexión directa
`db.TU-PROYECTO.supabase.co` (ver el comentario en `.env.example`):
hallazgo real, la conexión directa tuvo fallas intermitentes de DNS en
desarrollo mientras el dominio principal de Supabase seguía
resolviendo bien — el pooler es infraestructura separada y no las
compartió.

**`DATABASE_URL` también, en modo *session* (mismo host, puerto 5432,
no 6543) — ya no es "solo migraciones, uso ocasional".** Desde que
`shared/db-admin.ts` (modulos/notificaciones/) lo usa en cada corrida
del job de recordatorios, no solo drizzle-kit, la misma falla
intermitente de la conexión directa volvió a aparecer ahí — verificado
en vivo el mismo día que se corrigió `APP_DATABASE_URL`. Modo *session*
(no *transaction*) porque drizzle-kit sí necesita semántica de sesión
completa para las migraciones; el rol sigue siendo `postgres`, solo
cambia el host/puerto: `postgres.TU-PROYECTO@aws-0-TU-REGION.pooler.supabase.com:5432`.

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

## Cómo correr los tests localmente

```bash
npm run test:local
```

Un solo comando, sin pasos manuales previos. `npm test` a secas (el
`vitest run` crudo) **no alcanza por sí solo** — necesita un Postgres
real ya corriendo, con el rol `app_backend` creado y las migraciones
aplicadas; sin eso falla con `relation "periodos" does not exist` (o
la primera tabla que toque) en la mayoría de los archivos. `npm run
test:local` (`scripts/test-local.ts`) hace las cuatro cosas en una
sola invocación:

1. Levanta un Postgres efímero (`embedded-postgres`, sin Docker) en un
   puerto libre elegido dinámicamente — nunca choca con un Postgres
   real que ya esté corriendo en tu máquina, y el directorio de datos
   vive en el temp del sistema operativo, no en el repo.
2. Crea el rol `app_backend` ejecutando
   [`scripts/bootstrap-roles-ci.sql`](scripts/bootstrap-roles-ci.sql)
   directamente (sin pasar por `psql`, que no todos tienen instalado).
3. Aplica todas las migraciones (`drizzle-orm/postgres-js/migrator`,
   programático — mismo mecanismo que `npm run db:migrate`, sin
   depender de que la CLI de `drizzle-kit` esté en el `PATH`).
4. Corre `vitest run` con las variables de entorno correctas
   (`APP_DATABASE_URL` apuntando al Postgres efímero;
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` con placeholders, porque
   ningún test llama a Supabase de verdad, pero
   `src/shared/supabase-admin.ts` exige que existan).

Al terminar — pase o falle la suite — detiene Postgres y borra el
directorio de datos temporal (`persistent: false`); el código de
salida del comando es el mismo que el de `vitest` (`0` si todo pasó,
`1` si algo falló), así que sirve igual en un script que a mano.

**Resultado esperado:**

```
 Test Files  11 passed (11)
      Tests  86 passed (86)
```

Si ves menos archivos o tests que eso, probablemente sea una entrega
más nueva del backend con más módulos — no una señal de que algo esté
roto, mientras el resumen final diga "passed" y no "failed".

`test/integracion/aislamiento-tenant.test.ts` prueba que un tenant no
puede leer filas de otro (regla derivada de ADR-005).
`test/integracion/ledger.test.ts` prueba las invariantes del ledger
(ver sección siguiente). Todos los tests de integración corren en CI
en cada push/PR que toque `backend/`
([`.github/workflows/backend-ci.yml`](../.github/workflows/backend-ci.yml))
contra un Postgres efímero levantado como servicio de GitHub Actions
— un mecanismo distinto a `test:local` (ese usa Postgres embebido, sin
Docker), pero equivalente en espíritu: tampoco depende de pasos
manuales ni de credenciales de Supabase.

El frontend tiene su propio workflow
([`.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml),
agregado junto con la observabilidad — ver esa sección en este README):
lint + typecheck + build en cada push/PR que toque `frontend/`. No
corría en CI hasta ahora — un hueco real, no una omisión deliberada.

El primer test del archivo (`corre con el rol sin privilegios`) falla
a propósito si la conexión de los tests apunta al rol `postgres` en
vez de a `app_backend` — así el resto de las aserciones no puede pasar
"por accidente" contra un rol que se salta RLS.

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
`src/modulos/periodos/crear-periodo.ts` expone `crearPeriodo`,
`obtenerPeriodoActivo` y `obtenerPeriodoPorId`.
`src/modulos/periodos/calcular-quincena.ts` es la función pura del
anclaje a calendario (ADR-004: 1–15 y 16–fin de mes, nunca "inicio + N
días") — probada sin base de datos en
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

**Pendiente explícito, al escribir este punto (antes de que existiera
cierre).** Un periodo podía quedar `'activo'` más allá de su `fechaFin`
sin que nada lo detectara — no había cron ni cálculo perezoso de
cierre. Resuelto por el módulo de cierre (ver esa sección más abajo):
`obtenerPeriodoActivoTx`/`obtenerPeriodoPorIdTx` ahora resuelven eso
antes de devolver un periodo. Sigue sin existir un cron — el cierre es
puramente perezoso, se dispara al consultar, nunca en segundo plano —
y tampoco existe resolución a la zona horaria IANA del usuario
(CLAUDE.md): "hoy" sigue siendo la fecha de calendario UTC del
servidor en todo el código, no solo aquí.

**Resuelto en el punto 7 (cierre):** `obtenerPeriodoActivoTx` y
`obtenerPeriodoPorIdTx` ahora llaman a
`modulos/cierre/cerrar-periodo.ts` → `resolverPendientesTx` antes de
devolver un periodo — un periodo con `fechaFin` pasada se cierra ahí
mismo y deja de devolverse como `'activo'`. Ver la sección "Cierre"
más abajo para el detalle de cómo se evitó el ciclo de imports que
esto habría creado.

### Listar periodos (`listarPeriodos`)

`GET /periodos` — extensión sobre `openapi.yaml`, que solo define
`POST /periodos` y `GET /periodos/activo`, nunca un listado. Se agregó
para que el frontend pudiera enlazar el historial a periodos ya
cerrados: `GET /periodos/:id/{resumen,ingresos,gastos}` ya aceptaban
cualquier `periodoId` desde que se construyeron (nunca estuvieron
atados al periodo activo) — lo único que faltaba era una forma de
saber cuáles `periodoId` existen para poder enlazarlos.

Devuelve **todos** los estados, incluido `'borrador'` — decidir cuáles
mostrar como "periodos anteriores" es una decisión de presentación del
cliente, no algo que este endpoint deba filtrar por él. Mismo cierre
perezoso que el resto (`resolverPendientesTx` antes de leer), y mismo
orden por `fechaInicio` descendente con `creadoEn` como desempate — dos
periodos pueden compartir la misma `fechaInicio` (un borrador creado el
mismo día que el activo, misma quincena de calendario) y sin el
desempate el orden entre ellos quedaba a discreción de Postgres, no
"más reciente primero" — encontrado escribiendo el test, no en
producción.

## Ingresos

`src/db/schema/ingresos.ts` define `ingresos`.
`src/modulos/ingresos/registrar-ingreso.ts` expone `registrarIngreso`.

**Deliberadamente delgada:** la tabla `ingresos` solo guarda
`periodoId` + `movimientoId` — monto, moneda, fecha efectiva y nota
viven en `movimientos` (que el ingreso genera vía
`registrarMovimientoTx`), no se duplican. `listarIngresos` es el primer
consumidor que sí hace ese `JOIN` (`GET /periodos/:periodoId/ingresos`,
sin paginación — el contrato no la pide para ingresos, casi siempre
son pocos por periodo, invariante 12). El monto que devuelve viene de
la pata del asiento con `cuentaId` no nulo — siempre positiva para un
ingreso, por construcción, sin necesitar `abs()`.

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

### Editar y eliminar un ingreso (`editarIngreso`, `eliminarIngreso`)

Espejo exacto de "Editar y eliminar un gasto" (ver esa sección más
abajo, con la partida invertida): revertir es crear un movimiento
`tipo: 'reversion'` con las partidas invertidas, nunca tocar la fila
original de `ingresos` (`ingresos_inmutables` lo impide de cualquier
forma). La reversión (y, al editar, el ingreso nuevo con el monto
corregido) siempre se registra contra el **periodo activo actual**, sin
importar si el ingreso original seguía en ese mismo periodo o en uno
ya cerrado — `ajusteGenerado` en la respuesta distingue ambos casos.
Sin periodo activo para aterrizar la corrección: `SIN_PERIODO_ACTIVO`
(409). Corregir el mismo ingreso dos veces: `INGRESO_YA_REVERTIDO`
(409), detectado igual que en gastos (buscando un movimiento cuyo
`movimientoRevertidoId` apunte al de este ingreso).

**Extensión sobre `docs/openapi.yaml`, no solo sobre el código —
distinto de editar/eliminar gasto.** `openapi.yaml` sí define
`PATCH`/`DELETE /gastos/{gastoId}` (el contrato los contempló desde el
principio); para ingresos no define ningún endpoint de corrección, ni
siquiera lo menciona. `PATCH`/`DELETE /ingresos/{ingresoId}` son
enteramente una extensión de esta implementación, con el mismo
criterio que ya se usa para `GET /periodos` o el campo `revertido`:
completa una asimetría real (un usuario se equivoca capturando un
ingreso con la misma frecuencia que un gasto) sin la cual el punto
quedaría a medias. Sin `categoriaId` en el `PATCH` — a diferencia de
`EditarGastoRequest`, `CrearIngresoRequest` nunca tuvo ese campo.

`listarIngresos` gana el mismo campo `revertido: boolean` que
`listarGastos`, calculado igual (segunda consulta sobre
`movimientoRevertidoId`, no un `JOIN`) — un ingreso corregido sigue
apareciendo en el historial con su monto original, marcado para que el
cliente no vuelva a ofrecer editarlo/eliminarlo.

**Este punto rompió el motor de flujo de caja de forma sutil — ver
"Segundo hallazgo real" en la sección Disponible más abajo.** La
reversión que genera editar/eliminar un ingreso se contaba como gasto
del día; ya está corregido en `obtenerNetoCuentaEnFecha`, no aquí.

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

**`categoriaId` ya existe — ver "Categorías" más abajo.** Quedó
documentado aquí como pendiente mientras el módulo no existía; la
columna se agregó junto con el módulo, no antes.

### Editar y eliminar un gasto (`editarGasto`, `eliminarGasto`)

Genera por fin el `movimientoRevertidoId` que quedó pendiente desde
`db/schema/ledger.ts` (ADR-001): revertir es crear un movimiento
`tipo: 'reversion'` con las partidas invertidas, nunca tocar la fila
original — `gastos` sigue siendo inmutable, tal cual antes; lo único
nuevo es que ahora sí existe un camino para "corregir" sin violarlo.

**Hallazgo antes de escribir código:** `modelo-dominio.md` §3 describe
editar/borrar un gasto del periodo *activo* como "directo, sin
reversión" — pero los triggers de inmutabilidad (`ledger_bloquear_mutacion`
sobre `movimientos`/`asientos`, `gastos_inmutables` sobre `gastos`) ya
bloquean cualquier `UPDATE`/`DELETE` sin excepción por estado del
periodo. No hay, ni puede haber, un camino "directo". La lectura
consistente con ADR-001 (no negociable) y con la propia `openapi.yaml`
(que para `DELETE` sí dice "el asiento se revierte", incluso en periodo
activo) es que el mecanismo es siempre el mismo — reversión — y lo
único que cambia entre periodo activo y cerrado es **a qué periodo va
a parar la corrección**.

**Mecanismo único para ambos casos:** la reversión (y, al editar, el
movimiento nuevo con el monto corregido) siempre se registra contra el
**periodo activo actual** — nunca contra la cuenta del periodo
original. Si el gasto seguía en el periodo activo, ese "periodo activo
actual" resulta ser el mismo de siempre (edición "normal", sin cruce).
Si el periodo original ya cerró, su saldo congelado nunca se vuelve a
tocar (invariantes 5 y 15: un periodo cerrado no cambia de saldo, su
resumen es inmutable) y la corrección aparece en el disponible que el
usuario ve hoy — exactamente como pide la tabla de casos límite de
modelo-dominio.md §3. `ajusteGenerado` en la respuesta de `PATCH`
distingue ambos casos para el cliente.

Si no hay ningún periodo activo cuando se intenta corregir un gasto
viejo (nadie ha creado el periodo siguiente todavía), se rechaza con
`SIN_PERIODO_ACTIVO` (409) en vez de perder la corrección en silencio
o inventar un periodo. Corregir el mismo gasto dos veces (dos
`DELETE`, o `PATCH` después de `DELETE`) se rechaza con
`GASTO_YA_REVERTIDO` (409) — se detecta buscando si ya existe un
movimiento cuyo `movimientoRevertidoId` apunte al de este gasto, sin
necesitar una columna de estado nueva.

**`categoriaId` en `PATCH` ya funciona — ver "Categorías" más abajo.**
**`monto` se exige siempre en `PATCH`**, aunque `openapi.yaml` lo marca
opcional — como `movimientos` también es inmutable, hasta "solo
corregir la nota (o la categoría)" exige el mismo reverso + asiento
nuevo que corregir el monto; no hay un camino más barato para un
cambio parcial.

**Hallazgo aparte, encontrado al escribir las pruebas de este punto:**
`registrarIngreso` y `registrarGasto` nunca habían expuesto un
parámetro `fechaReferencia` para el cierre perezoso del periodo
destino — a diferencia de `crearPeriodo`, `cerrarPeriodoManualmente` y
`consultarDisponible`, que sí lo tenían desde su propio punto. Mientras
la fecha real de "hoy" quedó dentro de la ventana de los periodos de
prueba (agosto de 2026), pasó inadvertido; en cuanto el reloj real
avanzó más allá, casi toda la suite de integración empezó a fallar:
cada llamada sin `fechaReferencia` usaba `new Date()` real para decidir
si el periodo seguía activo, y encontraba el periodo de prueba ya
cerrado por el tiempo transcurrido. Se corrigió agregando el parámetro
opcional a ambas funciones (default `new Date()`, igual que el resto)
y pasándolo explícitamente en cada test que fija su propio "hoy" — ya
no depende de cuándo se ejecute la suite.

### Listar gastos (`listarGastos`)

`GET /periodos/:periodoId/gastos` — a diferencia de ingresos, sí pagina
(`?cursor=...&limite=...`, default 50, máximo 200): es el evento más
frecuente del sistema (modelo-dominio.md §4), un periodo activo puede
acumular muchos. Orden más reciente primero.

**Cursor por keyset, no por offset.** El cursor codifica en base64url
el par `(fechaRegistro, id)` del último elemento visto — no un número
de página. Un offset numérico se puede volver inconsistente si se
inserta un gasto nuevo entre una página y la siguiente (todo se
recorre o algo se salta); el keyset no tiene ese problema porque cada
página pide explícitamente "lo que sigue después de este punto exacto"
en vez de "la fila N". Un cursor mal formado responde `400 VALIDACION`,
no un 500 ni resultados silenciosamente vacíos.

**Un gasto editado o eliminado sigue apareciendo en la lista**, con su
monto original — nunca hard delete (Documento Maestro §7.6). La lista
es el historial honesto de lo que se capturó, no el estado económico
vigente (eso lo da el ledger, vía `disponible`/`resumen`).

**`revertido: boolean` en cada fila — extensión sobre `openapi.yaml`,
agregada al construir el frontend.** El usuario probando el historial
notó que una fila ya corregida se veía idéntica a una vigente y seguía
invitando a editarla/eliminarla — un click ahí siempre iba a fallar
con `GASTO_YA_REVERTIDO`, porque el cliente no tenía forma de saberlo
de antemano. Se resuelve con una segunda consulta (no un `JOIN`,
para no duplicar filas si algún día un movimiento admite más de una
reversión): "¿cuáles de los `movimientoId` de esta página ya tienen un
movimiento cuyo `movimientoRevertidoId` apunte a ellos?". Mismo
criterio que `NO_SOPORTADO`: el contrato no lo prohíbe, solo no lo
pedía todavía.

## Categorías

```
src/db/schema/categorias.ts            # categorias, NOMBRES_CATEGORIAS_PREDETERMINADAS
src/modulos/categorias/categorias.ts   # listarCategorias, crearCategoriaPersonalizada, obtenerCategoriaPorIdTx
src/modulos/categorias/rutas.ts        # GET/POST /categorias
```

**Solo aplica a gastos, nunca a ingresos** — así lo define
`docs/openapi.yaml` (`categoriaId` existe en `Gasto`/
`CrearGastoRequest`/`EditarGastoRequest`, nunca en `Ingreso`). Opcional
siempre, nunca obligatoria en la captura (CLAUDE.md, "Prioridades del
producto": "categorías opcionales, nunca obligatorias").

**Lista de predeterminadas — decisión que quedó pendiente en
`modelo-dominio.md` §6** ("estructura de categorías predeterminadas:
lista concreta pendiente para wireframes, no es una decisión de
dominio"). Se definió al construir este punto, confirmada con el
usuario: Comida, Transporte, Vivienda, Servicios, Salud,
Entretenimiento, Ropa, Educación, Ahorro, Otros.

**Predeterminadas sembradas por tenant, no una fila global
compartida.** `resolverOcrearIdentidad` (modulos/identidad/) inserta
las diez en la misma transacción donde ya crea el tenant nuevo — antes
de que exista ningún `GET /categorias` que las necesite. La alternativa
considerada — una tabla de predeterminadas sin `tenant_id`, visible a
todos — habría sido la primera excepción al patrón estricto de "toda
tabla de dominio tiene `tenant_id` + RLS sin excepciones" (ADR-005) y
habría exigido una política de RLS especial (`tenant_id IS NULL OR ...`)
solo para esta tabla. Sembrar por tenant mantiene el mismo patrón de
RLS + llave foránea real que ya usa todo el resto del schema, a costa
de diez filas duplicadas por tenant — un costo de almacenamiento
irrelevante frente a la complejidad que evita.

**Límite de categorías personalizadas: 30, aplicado sin sistema de
planes.** Documento Maestro §9.1 propone "categorías personalizadas
gratis para todos (límite alto, ~30)" — no existe ningún módulo de
planes/suscripciones todavía (Fase 3), así que el límite se aplica
igual para todos: es el único número que aparece en los docs, y sin él
no habría ningún límite real hoy. Comprobado por conteo antes de
insertar, no con un índice único de la base de datos — a diferencia de
"un solo periodo activo por tenant" (invariante 9, protegida con un
índice porque violarla corrompe el dominio), pasarse por una bajo una
carrera rarísima no tiene ninguna consecuencia real.

**Nombre único por tenant** (`categorias_nombre_unico_por_tenant`) —
crear una categoría con un nombre que ya existe para ese tenant (
predeterminada o personalizada) se rechaza con `VALIDACION`, detectado
vía el mismo patrón de `esViolacionDeIndiceUnico` que ya usan
`crearPeriodo`/`materializar-arrastre.ts` para sus propios índices
únicos.

**Editar la categoría de un gasto es exactamente "editar el gasto",
sin caso especial.** `gastos_inmutables` bloquea cualquier `UPDATE`
sin excepción — no hay forma de "solo cambiar la categoría" con un
`UPDATE` directo, ni siquiera para eso. `editarGasto` ya recreaba la
fila completa para corregir monto o nota; `categoriaId` es un campo
más de esa misma fila nueva. Como consecuencia, **omitir `categoriaId`
al editar no conserva la categoría anterior** — la fila nueva queda
sin categoría, exactamente el mismo comportamiento que ya tenía `nota`
al omitirse. No es una inconsistencia nueva de categorías, es el
comportamiento ya existente de cualquier campo que no se reenvíe en un
`PATCH` — documentado aquí explícitamente para que no sorprenda.

**`CATEGORIA_NO_ENCONTRADA` (404) al registrar o editar un gasto con
un `categoriaId` inválido o de otro tenant** — validado explícitamente
antes de insertar (`obtenerCategoriaPorIdTx`, mismo criterio BOLA que
`obtenerPeriodoPorIdTx`/`obtenerMetaPorIdTx`: la política RLS de
`categorias` es la defensa real, el `tenantId` en el `WHERE` es
cinturón y tirantes), no solo dejado para que la llave foránea lo
rechace con un error genérico de Postgres.

Validado de punta a punta contra el servidor real y Supabase real:
un tenant nuevo ya tiene las diez predeterminadas sin llamar a ningún
endpoint; crear una personalizada, registrar un gasto con ella,
editarlo cambiando a otra categoría, y una categoría inexistente
rechazada con 404 — ver `http/ciclo-completo.http`, pasos 36-41.

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
y ya resuelta, no solo documentada.** Si "hoy" ya pasó `fechaFin`,
`calcularDiasRestantes` no deja que el resultado baje de 1 en vez de
dividir entre cero o un negativo. Cuando se escribió este punto, el
módulo de cierre no existía todavía — ver la sección "Cierre" más
abajo para lo que cambió: `obtenerPeriodoActivo` ya resuelve el cierre
perezoso de un periodo vencido **antes** de que `disponible` lo vea,
así que este tope ya no debería activarse en el camino normal. Queda
como salvaguarda defensiva (cinturón y tirantes, mismo espíritu que el
`tenantId` redundante en `obtenerPeriodoPorIdTx`), no como el
mecanismo que evita la división por cero en la práctica — y
`test/integracion/cierre.test.ts` prueba justamente eso: un periodo
vencido se cierra solo al consultarlo, sin que `disponible` tenga que
intervenir.

### Rediseño posterior: el objetivo de "hoy" es fijo, no se redistribuye a mitad del día

**Hallazgo real, del usuario probando la app ya con el frontend
construido, no un bug encontrado por mí.** La fórmula original era
literalmente `piso(disponible / díasRestantes)`, recalculada en cada
consulta tal como pide modelo-dominio.md §5. El problema: como "hoy"
cuenta dentro de `díasRestantes`, gastar exactamente la cifra sugerida
bajaba la cifra de **hoy mismo** en la misma consulta (el gasto se
"repartía" también hacia atrás), y un sobregiro grande el mismo día
podía dejar un residuo positivo pequeño en vez de mostrar el tamaño
real del exceso — el usuario reportó ver "puedes gastar hoy $49.38"
después de haberse pasado por $4,000, con el disponible total todavía
en $444.45. Esto además contradecía la propia frase siguiente de §5:
*"si un día se gasta de más, la cifra del día siguiente baja sola"* —
la implementación compensaba el mismo día, no el día siguiente.

**Fórmula corregida** (`consultar-disponible.ts`):

```
gastadoHoy        = max(0, −Σ asientos de tipo 'gasto'/'reversion' de HOY)
disponibleBaseHoy = disponible + gastadoHoy   [deshace el efecto de hoy]
objetivoHoy       = piso(disponibleBaseHoy / díasRestantes)
cifraDiaria       = objetivoHoy − gastadoHoy  [puede ser negativa: te pasaste hoy]
```

`disponible` (el total) no cambió en absoluto — nunca fue el problema.
Al día siguiente, `disponible` ya incluye lo real de hoy (de más o de
menos) y `díasRestantes` bajó uno: ahí es donde ocurre la
redistribución, nunca a mitad del mismo día — probado explícitamente
(`test/integracion/disponible.test.ts`, "gastar de más hoy sí baja la
cifra del día siguiente").

**Por qué el corte usa `obtenerNetoCuentaEnFecha(..., tipos)` filtrado
por tipo, y no el neto simple de "todo lo de hoy".** Se probó primero
con el neto de TODOS los asientos de hoy — y falla en el caso más
común: el día 1, con el ingreso y el primer gasto fechados el mismo
día. Un ingreso de 5000 y un gasto de 555 el mismo día dan un neto de
+4445 (positivo), así que "gastado hoy" habría salido en 0 — el gasto
real quedó escondido detrás del ingreso, más grande. `tipos:
['gasto', 'reversion']` evita que un ingreso del mismo día tape un
gasto real, y sigue dejando que revertir un gasto el mismo día que se
registró (editar/eliminar, ver "Gastos" arriba) cancele exactamente su
propio efecto, porque la reversión también es de un tipo de esa lista
— probado explícitamente.

**`gastadoHoy` se agrega como campo nuevo en la respuesta de
`/disponible`** (extensión sobre `openapi.yaml`, mismo criterio que
`NO_SOPORTADO`/`revertido`): sin él, el cliente no puede mostrar "ya
gastaste $X de tu objetivo de $Y", solo el resultado final.

### Segundo hallazgo real: editar un ingreso se veía como si se hubiera gastado

**Reportado por el usuario con una captura real de la app, al agregar
"editar y eliminar un ingreso" (ver esa sección más arriba).** Editó un
ingreso de $5,000 a $6,000 y la pantalla mostró "Te excediste hoy por
$4,354.62" — como si hubiera gastado de más, sin haber registrado
ningún gasto.

**Causa:** el corte de `gastadoHoy` filtraba por `tipos: ['gasto',
'reversion']` (ver más arriba) — pensado para que revertir un gasto el
mismo día cancelara su propio efecto. Pero `editarIngreso`/
`eliminarIngreso` (agregados en el mismo punto) también generan un
movimiento `tipo: 'reversion'`, exactamente el mismo mecanismo que usa
`editarGasto`/`eliminarGasto` — el filtro no distinguía **qué**
revertía cada reversión, así que la reversión de un ingreso (una resta
contra la cuenta, igual que un gasto real) se contaba como gasto de
hoy.

**Corregido en `obtenerNetoCuentaEnFecha`
(modulos/ledger/registrar-movimiento.ts), no en `consultarDisponible`:**
la función ahora resuelve, vía `LEFT JOIN` contra el movimiento
original (`movimientoRevertidoId`), el **tipo efectivo** de cada
asiento — el tipo del movimiento que revierte si es una reversión, o
su propio tipo si no lo es. Con esto, `consultarDisponible` solo
necesita pedir `tipos: ['gasto']`: una reversión de un gasto sigue
contando (su tipo efectivo es `'gasto'`), y una reversión de un
ingreso ya no (su tipo efectivo es `'ingreso'`). Arreglar esto en la
función del ledger, no con un caso especial en disponible, es
deliberado: cualquier otro consumidor futuro de este corte hereda la
distinción correcta automáticamente.

Tres tests nuevos en `test/integracion/disponible.test.ts` reproducen
el bug exacto antes del fix (confirmado fallando) y prueban la
corrección: editar un ingreso el mismo día dejaba `gastadoHoy` en
`5000n` en vez de `0n`; eliminar un ingreso, igual; y un gasto real el
mismo día que una edición de ingreso sigue contando solo por el gasto
real, sin que la corrección del ingreso lo tape ni lo infle.

### Tercer hallazgo real: un pago automático materializado hoy se contaba como gasto discrecional de hoy

**Reportado por el usuario contra su cuenta real**, justo al verificar
en vivo el fix de "Gastos recurrentes" de arriba: creó un recurrente
mensual (`diaMes: 17`) mientras el periodo 16-fin ya estaba activo, la
materialización inmediata generó el gasto de $2,000 fechado hoy, y la
pantalla pasó de "puedes gastar hoy $486.66" a "te excediste hoy por
$1,513.34" — como si el usuario hubiera elegido gastarse la renta
completa en un solo día. El disponible total bajó correctamente; lo
que estaba mal era tratar ese gasto como si fuera una decisión
discrecional de hoy.

**Causa:** el corte de `gastadoHoy` (`tipos: ['gasto', 'aporte_meta',
'pago_tarjeta']`) no distinguía un gasto manual de uno materializado
automáticamente — un recurrente o una mensualidad de tarjeta que
vencen a materializarse el mismo día en que el periodo se activa caen
en el corte igual que si el usuario los hubiera registrado a mano.

**Corregido:** `'pago_tarjeta'` sale por completo del corte (en V1 solo
existe la vía automática — nunca hay un pago de tarjeta manual, ver
`## Tarjetas de crédito y MSI`). Para `'gasto'`, que sí comparten tipo
un gasto manual y uno de un recurrente, `obtenerNetoCuentaEnFecha`
gana una opción `excluirGastosRecurrentes` que hace `LEFT JOIN` contra
`gastos` (resolviendo primero, igual que con las reversiones, al
movimiento "efectivo") y descarta las filas con `origenRecurrenteId`
no nulo. Un gasto manual, con o sin una reversión de por medio, sigue
contando exactamente igual que antes.

Tres tests nuevos en `test/integracion/disponible.test.ts`: el caso
exacto reportado (recurrente materializado el mismo día no cuenta como
gastado hoy pero sí baja el disponible), un gasto manual el mismo día
que el recurrente sigue contando (el recurrente no lo tapa), y el caso
equivalente con una mensualidad de tarjeta materializada al activarse
el periodo.

### Cuarto hallazgo real: "hoy" saltaba al día siguiente desde las 6pm hora de México

**Reportado por el usuario contra su cuenta real:** registró un gasto
de $108 fechado hoy y "puedes gastar hoy" no se movió — como si el
gasto se hubiera repartido entre todos los días restantes de la
quincena en vez de descontarse del objetivo de hoy. Ocurría solo por
la tarde/noche.

**Causa:** todo default de `fechaReferencia: Date = new Date()` (o
`?? new Date()`) en el código usaba la hora real en UTC. `fechaISO`
(`shared/fechas.ts`) extrae el día calendario con `getUTC*()` — sin
ninguna resolución a la zona horaria del usuario, tal como quedó
documentado desde el inicio en este README pero nunca implementado
(CLAUDE.md ya pedía "todo en UTC, resuelto a la zona IANA del usuario
al leer"). México no tiene horario de verano desde 2022 (offset fijo
-6h, excepto Baja California y la franja fronteriza, no cubierta
aquí) — así que desde las 6pm hora de México (18:00 CST = 00:00 UTC),
"hoy" en UTC ya es mañana para México. Un gasto capturado a las 9pm
con fecha correcta (hoy) dejaba de coincidir con lo que
`consultarDisponible` consideraba "hoy": el gasto bajaba el
disponible total bien, pero nunca se restaba del objetivo del día.

**Corregido:** `shared/fechas.ts` gana `ahoraEnMexico()`, que devuelve
`new Date(Date.now() - 6h)` — un `Date` cuyo día calendario extraído
vía `getUTC*()` coincide con el día calendario real de México.
Deliberadamente **no se tocó `fechaISO`** (sigue siendo una extracción
UTC pura y determinista, sin sorpresas — así se mantienen intactas
todas las fechas de referencia explícitas que ya usan los 331 tests
existentes) — en cambio, cada default `new Date()` que de verdad
significaba "ahora mismo, en México" se reemplazó por
`ahoraEnMexico()`, en `cerrar-periodo.ts`, `decidir-sobrante.ts`,
`consultar-disponible.ts`, `importar.ts`, `registrar-gasto.ts`,
`registrar-ingreso.ts`, `crear-periodo.ts`, `metas.ts`,
`recurrentes.ts`, `tarjetas/registrar-cargo.ts` y
`scripts/enviar-recordatorios.ts`. El `Date` que devuelve **no es un
instante real** — nunca se usa como timestamp (`creadoEn`,
`decisionSobranteFecha`, etc. siguen siendo `new Date()` de verdad).
En el frontend, `hoyISO()` (`FormularioGasto.tsx`,
`FormularioIngreso.tsx`) tenía el mismo problema por la vía opuesta:
usaba `new Date().toISOString().slice(0, 10)`, que también extrae en
UTC. Se cambió a getters locales del navegador
(`getFullYear`/`getMonth`/`getDate`), que sí reflejan la zona horaria
real del dispositivo — a diferencia del backend, aquí no hace falta
un offset fijo: el navegador ya sabe la zona horaria real del usuario.

## Cierre

```
src/db/schema/cierre.ts                  # resumenes
src/modulos/cierre/generar-resumen.ts    # generarResumenTx, obtenerResumenTx — núcleo compartido, solo Tx
src/modulos/cierre/cerrar-periodo.ts     # cerrarPeriodoManualmente (top-level) + resolverPendientesTx (Tx)
src/modulos/cierre/decidir-sobrante.ts   # decidirSobrante (top-level) + resolverDecisionesVencidasTx (Tx)
```

**El ciclo de imports que esto podía crear, y cómo se evitó.**
`modulos/periodos/crear-periodo.ts` llama a `resolverPendientesTx` de
este módulo para el cierre perezoso — así que `cierre` no puede
importar el módulo de periodos de vuelta sin crear un ciclo. Donde
`cierre` necesita leer o escribir la tabla `periodos` (marcar
`estado='cerrado'`, verificar que un periodo existe), lee
`db/schema/periodos.ts` directamente, no `modulos/periodos/crear-periodo.ts`
— mismo patrón que ya usa `ingresos` con el schema del ledger. Esto
cuesta una pequeña duplicación (la consulta de "¿existe este periodo
de este tenant?" está escrita tanto en `cierre` como en `periodos`, en
vez de compartir una función), a cambio de un grafo de dependencias
sin ciclos. Es una decisión de arquitectura explícita, no un descuido.

**Cierre perezoso real (no solo el tope de disponible).**
`obtenerPeriodoActivoTx`/`obtenerPeriodoPorIdTx` en periodos llaman a
`resolverPendientesTx` antes de devolver cualquier periodo. Si el que
iban a devolver está `'activo'` pero su `fechaFin` ya pasó, se cierra
ahí mismo — genera el resumen y pasa a `'cerrado'` — y ya no se
devuelve como activo. Como esto vive en el único punto de entrada que
usan disponible, ingresos, gastos y el propio `crearPeriodo`, lo
heredan gratis sin que cada módulo tenga que acordarse de resolverlo
por separado (mismo principio que centralizar `app.tenant_id`,
ADR-005). Consecuencia con test propio: si el periodo activo de un
tenant ya venció, `crearPeriodo` lo cierra primero y el periodo nuevo
nace `'activo'` directo, no en `'borrador'`.

**Cierre manual, necesario para poder ejercer el ciclo del walking
skeleton sin esperar 15 días reales.** `cerrarPeriodoManualmente`
fuerza el cierre de un periodo activo antes de su `fechaFin` —
equivalente a `POST /periodos/{id}/cerrar` de openapi.yaml. Idempotente
(invariante 8): cerrar un periodo ya cerrado devuelve su resumen
existente en vez de generar uno nuevo.

**Déficit vs. sobrante positivo (modelo-dominio.md §3, regla agregada
en revisión).** `generarResumenTx` decide solo: si `sobrante < 0`,
`decisionSobrante` queda `'arrastrado'` de inmediato, sin pedir nada
al usuario — no existe "ahorrar" una deuda. Si es positivo, queda
`'pendiente'` hasta que `decidirSobrante` (decisión explícita) o
`resolverDecisionesVencidasTx` (el barrido de N días) lo resuelvan.

**`'ahorrar'` ya está implementado — ver "Metas de ahorro" más abajo.**
Quedó documentado aquí como rechazado (`NO_SOPORTADO`) mientras el
módulo de Metas no existía; el tipo `DecisionSobranteEntrada` ya tenía
la forma correcta desde entonces (mismo patrón que `crearPeriodo` con
tipos de periodo no-quincenales), así que activarlo de verdad no
requirió cambiar la firma pública, solo implementar el caso.

**N = 7 días para el default de arrastre — propuesta propia, no un
dato.** No está en ningún documento. Es una intuición razonable
(suficiente para decidir con calma, corto para no dejarlo pendiente
hasta que la *siguiente* quincena también cierre) — **debe revisarse
con evidencia real de comportamiento de usuarios cuando exista**, no
tratarse como definitivo. `generadoEn` en `resumenes` se fija con
`fechaReferencia` explícito (nunca `new Date()` interno) por la misma
razón que el resto del código evita el reloj real dentro de una
operación — mismo principio que ADR-004 exige para los jobs de cierre
("fecha objetivo pasada como parámetro") — y es lo que hace posible
probar el barrido de N días sin esperar tiempo real.

**Transición controlada, no bloqueo total.** A diferencia de
asientos/movimientos/ingresos/gastos (`UPDATE`/`DELETE` bloqueados sin
excepción), un resumen tiene un campo que sí debe poder escribirse una
vez después del `INSERT`: `decisionSobrante`, de `'pendiente'` a
`'ahorrado'`/`'arrastrado'`. El trigger en
[`drizzle/0009_resumenes_transicion_controlada.sql`](drizzle/0009_resumenes_transicion_controlada.sql)
permite exactamente esa transición y bloquea cualquier otra —
incluyendo un `UPDATE` que deje `decisionSobrante` sin tocar (todavía
`'pendiente'`): un bug real que encontré escribiendo los tests, porque
comparar solo `new <> old` no distingue "sigue pendiente" de "volvió a
pendiente" cuando ninguna de las dos cambió el valor.

**Materialización del arrastre: resuelta en el punto 8.**
`decisionSobrante='arrastrado'` solo registraba la decisión; el dinero
no se movía todavía a ninguna cuenta. Ver la sección "Arrastre" más
abajo para el mecanismo completo.

### Bug real: un periodo que hereda un arrastre calculaba mal su propio sobrante

**Encontrado antes de construir Metas, no por Metas — es el ciclo de
vida normal de dos o más periodos consecutivos con arrastre.**
`calcularTotalesTx` sumaba solo `tipo = 'ingreso'`/`'gasto'` desde
`movimientos`/`asientos` directo. Un periodo que **hereda** un arrastre
al crearse (`reclamarArrastresTx` lo acredita con
`tipo = 'arrastre_sobrante'`) y luego cierra con su propia actividad
normal calculaba un sobrante que **ignoraba por completo ese crédito
heredado** — `totalIngresos - totalGastado` y el saldo real de la
cuenta divergían.

**Consecuencia real, no solo un número mal reportado:** al drenar, el
periodo cerrado quedaba con el arrastre heredado **atorado para
siempre** dentro de una cuenta que la invariante 5 prohíbe volver a
tocar — ese dinero nunca llegaba al periodo siguiente. Confirmado con
un test antes del fix: periodo 1 con sobrante $1,000 (arrastrado);
periodo 2 lo hereda (saldo real $1,000), registra ingreso $500 y gasto
$200 (saldo real $1,300); al cerrar, el resumen decía sobrante `$300`
y el drenado dejaba el periodo cerrado con `$1,000` fantasma en vez de
`$0`.

**Corregido con `obtenerNetoPorTipoEfectivoTx`
(modulos/ledger/registrar-movimiento.ts):** agrupa TODOS los asientos
de la cuenta por su tipo efectivo (mismo concepto que ya resolvía el
bug de `gastadoHoy` — una reversión cuenta como el tipo de lo que
revierte), sin restringir a una lista fija de tipos. `calcularTotalesTx`
ahora clasifica cada tipo que aparezca como ingreso o gasto vía dos
`Set` exhaustivos sobre `TIPOS_MOVIMIENTO` (`'arrastre_sobrante'` y
`'retiro_meta'` cuentan como ingreso; `'gasto'` y `'aporte_meta'` como
gasto) y **lanza un error explícito si aparece un tipo sin clasificar**
— en vez de ignorarlo en silencio, que es exactamente como se coló
este bug. Esto garantiza, por construcción, que
`totalIngresos - totalGastado` sea siempre el saldo real de la cuenta,
así que drenar SIEMPRE deja el periodo cerrado en exactamente 0 —
probado explícitamente reproduciendo el escenario de arriba
(`test/integracion/arrastre.test.ts`).

**Por qué se adelantó la clasificación de `'aporte_meta'`/`'retiro_meta'`
sin que Metas existiera todavía:** son exactamente el mismo tipo de
bug — un movimiento nuevo tocando la cuenta de un periodo sin que
`calcularTotalesTx` supiera clasificarlo — así que se corrigió de raíz
para los dos tipos reservados que Metas va a usar, no solo para
`'arrastre_sobrante'`. Ver la sección "Metas de ahorro" más abajo.

## Arrastre (cuenta `arrastre_pendiente`)

```
src/db/schema/arrastres.ts                       # arrastres: rastrea cada arrastre desde que se drena hasta que se reclama
src/modulos/cierre/materializar-arrastre.ts       # drenarACuentaPuenteTx, reclamarArrastresTx
```

**El problema que resuelve, en una frase:** la invariante 5 ("un
periodo cerrado no cambia de saldo nunca") es literal — si se espera a
que exista el periodo siguiente para recién ahí sacar el dinero de la
cuenta del periodo que cerró, eso *es* modificar el saldo de un
periodo cerrado, sin importar cuánto tiempo haya pasado. La única
forma de cumplirla es drenar esa cuenta **en el mismo instante de
cerrar**, como parte de esa transacción — hacia una cuenta puente por
tenant (`'arrastre_pendiente'`, nuevo valor en `TIPOS_CUENTA` de
`db/schema/ledger.ts`; a diferencia de la contraparte "externa",
modelada como `cuentaId NULL`, esta cuenta sí tiene saldo real y
consultable, así que necesita existir como fila). `drenarACuentaPuenteTx`
se llama desde `cerrarYGenerarResumenTx` (`cierre/cerrar-periodo.ts`),
en la misma transacción que marca `estado='cerrado'` y genera el
resumen — no en una operación aparte.

**Dónde está el dinero en cada momento, sin ventana de "en ningún
lado":** son dos transacciones atómicas independientes, no una que
cruce ambos periodos. Antes de cerrar, el dinero está en la cuenta del
periodo que cierra. Al cerrar (una transacción), se mueve a la cuenta
`arrastre_pendiente` del tenant. Ahí puede quedarse indefinidamente —
no tiene fecha límite, a diferencia del default de 7 días de la
*decisión* de sobrante, que es un asunto de UX, no de dónde vive el
dinero. Al crear el periodo siguiente (otra transacción, independiente
de la primera), se mueve de ahí a la cuenta del periodo nuevo. Si el
proceso se interrumpe a mitad de cualquiera de las dos transacciones,
Postgres la revierte completa — no hay estado parcial posible. Si se
interrumpe *entre* las dos, el dinero sigue en la cuenta puente,
contabilizado, esperando.

**Por qué no basta con que el periodo nuevo reclame todo el saldo de
la cuenta puente sin más.** Esto casi se coló en el diseño: si
`crearPeriodo` reclamara *todo* el saldo puente sin condición, eso
adelantaría la decisión de sobrante — un sobrante todavía `'pendiente'`
aparecería ya disponible en el periodo nuevo, y si el usuario luego
elige `'ahorrar'` (cuando exista Metas), ese dinero nunca debió estar
ahí. Por eso existe la tabla `arrastres`: cada arrastre se rastrea
individualmente (de qué resumen viene, si ya se reclamó), y
`reclamarArrastresTx` solo reclama los que su resumen ya tiene
decididos como `'arrastrado'` — nunca los `'pendiente'`. Reclama todos
los elegibles, no solo el más reciente: si el usuario se saltó crear
un periodo por un tiempo, o decidió el sobrante de un periodo viejo
después de que ya existía uno nuevo, pueden acumularse varios;
`test/integracion/arrastre.test.ts` prueba exactamente ese caso.

**Filtro explícito por tenant, no solo RLS (mismo criterio que
`periodoId` en ingresos/gastos).** La consulta de arrastres elegibles
en `reclamarArrastresTx` lleva `tenantId` en el `WHERE`, y el `UPDATE`
que reserva cada arrastre (evita que dos transacciones concurrentes lo
reclamen dos veces) también. Probado con un caso concreto, no
asumido: un tenant con un déficit arrastrado, y otro tenant creando su
propio periodo — el saldo del periodo nuevo del segundo tenant nunca
incluye el déficit del primero.

**Reutilización, no invención.** El find-or-create de la cuenta puente
usa el mismo `SAVEPOINT` + reintento que `crearPeriodo` ya usaba para
"un periodo activo por tenant" (mismo índice único parcial, esta vez
`cuentas_una_arrastre_pendiente_por_tenant`). El reclamo usa el mismo
patrón de `UPDATE ... WHERE ... IS NULL` con chequeo de fila afectada
que ya usaba `decidirSobrante`. `esViolacionDeIndiceUnico` y
`fechaISO`, usadas por tercera vez entre módulos, se promovieron a
`shared/errores.ts` y `shared/fechas.ts` en vez de duplicarse otra vez.

**Promoción de borrador a activo: resuelta, ver la siguiente
sección.** Este punto detectó el hueco (si el periodo B se crea en
`'borrador'` porque A seguía activo, y luego A cierra, nada promovía a
B); se resolvió aparte porque tocaba tanto a periodos como a cierre.

## Promoción de borrador a activo

`modulos/cierre/cerrar-periodo.ts` → `promoverBorradorSiExisteTx`,
llamada desde `resolverPendientesTx` cada vez que el tenant se queda
sin periodo activo — tanto justo después de cerrar uno vencido en la
misma operación, como cuando ya no había ninguno activo por otra razón
(por ejemplo, tras `cerrarPeriodoManualmente`, que no promueve nada
por sí mismo: sigue el mismo principio perezoso de todo lo demás,
`test/integracion/promocion-borrador.test.ts` prueba ese orden
explícitamente).

**La condición es más estricta que "ya llegó su fecha de inicio".**
Promueve solo si `fechaInicio <= hoy <= fechaFin` — la ventana del
borrador contiene genuinamente hoy, no solo "ya empezó". Razón: con el
mecanismo actual de `crearPeriodo` (deriva la quincena de `hoy`, y
`openapi.yaml` prohíbe que el cliente especifique `fechaInicio` para
quincenal), un borrador creado mientras otro periodo está activo
**siempre termina con el mismo rango de fechas que ese activo** — no
hay forma, bajo el contrato actual, de pedir "el periodo siguiente"
mientras el actual sigue vigente. Si el chequeo fuera solo
`fechaInicio <= hoy`, en el momento en que el periodo activo cierra
(porque su `fechaFin` ya pasó), cualquier borrador duplicado suyo
**también** tendría el `fechaFin` ya vencido — promoverlo lo activaría
ya muerto, y el siguiente toque lo cerraría de inmediato generando un
resumen sin actividad real. La condición estricta evita ese churn:
promueve cuando genuinamente le toca, deja huérfano (sin tocar) cuando
su ventana completa ya pasó sin haber sido usado.

**El borrador promovido reclama arrastres pendientes**, igual que un
periodo recién creado — si no lo hiciera, un usuario cuyo borrador se
promueve no recibiría su arrastre decidido hasta que por casualidad se
creara otro periodo después.

**Más de un borrador candidato:** no hay restricción única sobre
`estado = 'borrador'` (a diferencia de `'activo'`), así que pueden
acumularse varios. Se promueve el de `fechaInicio` más próxima y, en
empate, el más antiguo (`creadoEn`); los demás quedan como estaban —
ver "Higiene de borradores" más abajo.

**Cómo se probó una condición que hoy casi nunca se cumple en la
práctica:** ya que `crearPeriodo` no puede producir un borrador con
ventana futura genuina, los tests de este punto insertan el borrador
directamente con las fechas que quieren ejercitar (bypaseando
`crearPeriodo`), en vez de depender de que el mecanismo actual llegue
a producir esa condición por sí solo.

## Aviso de sobrante pendiente

`GET /resumenes/pendiente` — extensión sobre `openapi.yaml`, agregada
tras un reporte real de un usuario probando la app: cerró un periodo
manualmente, creó el siguiente sin haber decidido "arrastrar" o
"ahorrar" el sobrante del primero, y al no ver ninguna pantalla que se
lo recordara, el dinero le pareció simplemente desaparecido. No era un
bug de pérdida de datos — el resumen seguía `'pendiente'` exactamente
donde debía, recuperable desde "Periodos anteriores" — pero nada
avisaba de forma proactiva que quedaba algo por decidir, hueco que ya
documentaba este README ("Qué falta" del punto original del frontend).

`obtenerResumenPendiente(tenantId)` (`modulos/cierre/generar-resumen.ts`)
devuelve el resumen `'pendiente'` más antiguo del tenant, o `null` si no
hay ninguno — `null` es la respuesta normal (la mayoría del tiempo no
hay nada pendiente), no un error, así que el endpoint responde `200`
en ambos casos, no `404`. El más antiguo, no cualquiera: si llegaran a
acumularse varios (cerrar periodos repetidamente sin decidir ninguno),
es el que menos le queda antes de que `resolverDecisionesVencidasTx`
(el barrido de N días) lo decida por el usuario — el más urgente de
mostrar primero.

Probado explícitamente: sin nada pendiente devuelve `null`; con un
sobrante sin decidir lo encuentra aunque ya exista un periodo siguiente
activo (reproduce el reporte real); deja de aparecer en cuanto se
decide (arrastrar o ahorrar); con varios pendientes acumulados,
devuelve el más antiguo; y nunca cruza de un tenant a otro (BOLA).

## Metas de ahorro

```
src/db/schema/metas.ts                # metas
src/modulos/metas/metas.ts            # crearMeta, listarMetas, aportarAMeta, retirarDeMeta
src/modulos/metas/rutas.ts            # POST/GET /metas, POST /metas/:id/{aportes,retiros}
```

**El contrato ya existía completo desde antes — nunca se había
implementado.** `docs/openapi.yaml` define `POST/GET /metas`,
`POST /metas/{id}/aportes` y `POST /metas/{id}/retiros` desde el
diseño original, y el ledger ya reservaba `'meta'` como tipo de cuenta
y `'aporte_meta'`/`'retiro_meta'` como tipos de movimiento — ninguno se
había usado hasta este punto. `crearMeta` crea la meta y su cuenta de
ledger (tipo `'meta'`) en una sola transacción, mismo patrón que
`crearPeriodo`. `montoAcumulado`/`porcentajeAvance` nunca se guardan:
se calculan en cada `listarMetas` desde el saldo real de la cuenta (una
sola consulta agrupada, no una por meta) — mismo principio de "nunca
cacheado, siempre recalculado" que `disponible`. `porcentajeAvance` no
se recorta en 100 si se aportó de más: es información real, no un
error de presentación.

**Sin tablas `aportes`/`retiros`.** El contrato no define ningún `GET`
para listarlos — solo `POST` — así que `movimientos`/`asientos` ya
alcanzan para todo lo que se pide hoy; el `id` que devuelve un
`POST .../aportes` o `.../retiros` es el `movimientoId` del ledger, no
una fila propia. Si algún día se agrega un `GET` para listarlos, ahí sí
hace falta la tabla — no antes (mismo criterio que ya se aplicó a
`categoriaId` en gastos: no construir para un requisito que no existe
todavía).

**Aportar reduce el disponible "como un gasto" — confirmado, no
inventado.** modelo-dominio.md §6 lo dice explícito. Mismas partidas
que un gasto (negativa contra el periodo activo), solo que la
contraparte es una cuenta real (la meta) en vez de externa. Requiere
periodo activo — `409 SIN_PERIODO_ACTIVO`, documentado en
`openapi.yaml` para este endpoint — y cuenta en el filtro de
`gastadoHoy` de `consultarDisponible` (`['gasto', 'aporte_meta']`):
sin esto, aportar el mismo día no bajaría "puedes gastar hoy" aunque sí
bajara `disponible`, la misma inconsistencia que ya se corrigió para
`gastadoHoy` con la reversión de un ingreso.

**Retirar es simétrico de aportar — decisión propia, no documentada en
ningún lado.** `modelo-dominio.md` solo confirma el caso de aportar; el
catálogo de eventos dice apenas "Retiro de meta | Cuenta ← meta", sin
precisar cuál cuenta. Se decidió que un retiro **aumenta el disponible
del periodo activo, tratado como un ingreso más** — mismo requisito de
periodo activo que aportar (aunque `openapi.yaml` no documenta un 409
para este endpoint), porque el dinero retirado tiene que aterrizar en
una cuenta real que exista, y la única "tuya" que hay hoy es la del
periodo activo. La alternativa considerada — que saliera a una
contraparte externa, sin rastro en ningún disponible — se descartó por
menos útil: el usuario retira dinero de una meta específicamente para
poder gastarlo, y dejarlo fuera del disponible habría hecho el retiro
invisible para el propio producto.

**Sin validar `monto <= montoAcumulado` en un retiro.** Mismo criterio
que el sobregiro permitido en gastos (modelo-dominio.md §5): ninguna
otra cuenta del sistema tiene guardarraíles artificiales sobre su
saldo, y una meta no es distinta. Probado explícitamente: una meta
puede quedar con saldo negativo tras un retiro que exceda lo
acumulado.

**Bug real, encontrado al construir este punto — no exclusivo de
Metas, ver "Cierre" más arriba.** Antes de escribir código de Metas se
encontró que `calcularTotalesTx` (el cálculo del sobrante al cerrar)
solo sabía sumar `'ingreso'`/`'gasto'` — un periodo que hereda un
arrastre calculaba mal su propio sobrante, con dinero heredado
quedando atorado para siempre. Se corrigió de raíz (clasificación
exhaustiva y explícita de todos los `TIPOS_MOVIMIENTO`, lanzando error
si aparece uno sin clasificar) ANTES de agregar `'aporte_meta'`/
`'retiro_meta'` a esa clasificación — así, cuando Metas empezó a tocar
la cuenta de un periodo, ya había un mecanismo correcto esperándola en
vez de repetir el mismo bug con un tipo nuevo.

**Decidir "ahorrar" el sobrante: reclamo inmediato, no perezoso — a
propósito, diferente del mecanismo de arrastre.** `decidirSobrante`
(`modulos/cierre/decidir-sobrante.ts`) ya no rechaza `'ahorrar'` con
`NO_SOPORTADO`: valida `metaId` (obligatorio para esta decisión,
`404 META_NO_ENCONTRADA` si no existe o no es de este tenant) y, en la
MISMA transacción que marca `decisionSobrante = 'ahorrado'`, reclama el
arrastre que `drenarACuentaPuenteTx` ya dejó esperando en la cuenta
`arrastre_pendiente` — directo hacia la cuenta de la meta
(`reclamarArrastreComoAporteMetaTx`, `modulos/cierre/materializar-arrastre.ts`).
A diferencia de `'arrastrar'` (perezoso: espera a que exista el
periodo siguiente, porque ese destino no existe todavía al momento de
decidir), una meta ya existe en el momento de decidir — no hay nada
que esperar, y dejarlo pendiente solo agregaría un estado intermedio
sin ningún beneficio. `arrastres.metaDestinoId` es la contraparte de
`periodoDestinoId` para este caso (`CHECK` que exige que a lo sumo uno
de los dos esté lleno, nunca ambos).

**Por qué `decidir-sobrante.ts` lee `db/schema/metas.ts` directo, no
`modulos/metas/metas.ts`.** Mismo motivo, exactamente, que ya documenta
este README para `cierre`/`periodos`: `modulos/metas/metas.ts` importa
`obtenerPeriodoActivoTx` de `modulos/periodos/crear-periodo.ts`, que a
su vez importa `resolverPendientesTx`/`reclamarArrastresTx` de este
mismo módulo `cierre` — importar el módulo completo de metas desde
`decidir-sobrante.ts` habría cerrado ese ciclo. Se detectó ANTES de que
`tsc`/los tests lo sufrieran, razonando el grafo de imports a mano.

**Validado de punta a punta contra el servidor real y Supabase real**
(no solo con los tests): crear meta → aportar (`gastadoHoy` reflejado
en `/disponible`) → listar (`montoAcumulado`/`porcentajeAvance`
correctos) → retirar (con y sin motivo) → cerrar periodo → decidir
"ahorrar" → la meta recibe el sobrante de inmediato, sin crear ningún
periodo siguiente — ver `http/ciclo-completo.http`, pasos 26-35.

## Gastos recurrentes

Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md §12,
"gastos recurrentes/suscripciones" — brecha de Fase 2, adelantada por
ser la de mejor RICE entre las brechas documentadas). Tabla nueva
`gastos_recurrentes`: es una **plantilla**, no un hecho del ledger —
mismo estatus que `metas`/`categorias` (mutable, se puede editar
libremente). `activo=false` (pausar) es el "eliminar" de esta tabla:
nunca hard delete, porque los gastos ya materializados guardan
`gastos.origenRecurrenteId` apuntando aquí y perderían su procedencia.

**Frecuencias:** `'quincenal'` (se materializa en cada periodo) o
`'mensual'` con un `diaMes` (1-31) fijo. Como los periodos son
quincenas ancladas a calendario (1-15, 16-fin — ADR-004), un cargo
mensual con día fijo cae siempre en la misma mitad del mes, nunca en
las dos: `diaMes<=15` → primera mitad, `diaMes>=16` → segunda. Esto
resuelve sin caso especial el "día 31 no existe en abril": ese cargo
simplemente se materializa en la segunda mitad de abril, igual que
cualquier cobro real de fin de mes.

**Materialización:** `materializarRecurrentesTx` se llama exactamente
en los dos puntos donde un periodo se vuelve genuinamente `'activo'`
(nunca para uno que se crea en `'borrador'`, que todavía no es "el
periodo siguiente" — ver "Higiene de borradores" arriba): justo al
lado de `reclamarArrastresTx` en `crearPeriodo` y en
`promoverBorradorSiExisteTx`. Genera un gasto real (mismas partidas
que `registrarGasto`) por cada recurrente activo que le toque a ese
periodo, con `origenRecurrenteId` para trazabilidad — expuesto en
`GET /periodos/{id}/gastos` como `esRecurrente`, para que el cliente
distinga un cargo automático de uno capturado a mano.

Un índice único parcial `(origenRecurrenteId, periodoId)` en `gastos`
impide duplicar la materialización de un mismo recurrente para el
mismo periodo — existe como invariante de base de datos (defensa en
profundidad), aunque en el camino real no hay ningún escenario que lo
dispare: `materializarRecurrentesTx` corre una sola vez, dentro de la
misma transacción que crea o promueve el periodo, nunca dos veces para
el mismo `periodo.id`.

**Endpoints:** `GET/POST /gastos-recurrentes`, `PATCH
/gastos-recurrentes/{id}` (edita cualquier campo, incluido `activo`
para pausar/reanudar — no hay `DELETE`). Editar el monto o la
frecuencia de un recurrente solo afecta materializaciones futuras: los
gastos ya generados son filas de `gastos` independientes e inmutables,
igual que cualquier otro gasto.

Validado contra Postgres real (`test/integracion/recurrentes.test.ts`):
validaciones de entrada, BOLA en categoría y en el propio recurrente,
pausar sin borrar, cambiar de frecuencia sin arrastrar un `diaMes` que
ya no aplica, las tres reglas de materialización (quincenal, mensual
primera/segunda mitad, el caso de día 31), que un recurrente pausado
no se materialice, que un periodo en `'borrador'` no materialice
todavía, aislamiento entre tenants, propagación de categoría, y el
índice único parcial.

### Bug real: un recurrente creado con el periodo ya activo no se materializaba hasta el periodo siguiente

Reportado por el usuario con el caso exacto: creó un periodo nuevo el
día 16, y un recurrente `'mensual'` con `diaMes: 17` — que por regla
(`diaMes>=16` → segunda mitad) le tocaba exactamente a ese periodo,
pero no aparecía. Causa: `materializarRecurrentesTx` solo corre en los
dos momentos en que un periodo se vuelve `'activo'` (`crearPeriodo` y
la promoción de borrador) — un recurrente creado **después**, mientras
ese periodo ya está activo, nunca tenía otra oportunidad de
materializarse en él, aunque su fecha le tocara exactamente a ese
periodo. El caso "un recurrente creado después de que un periodo ya
está activo no se materializa retroactivamente" incluso estaba probado
así deliberadamente — era el comportamiento documentado, solo que
resultó ser el comportamiento equivocado para este caso concreto.

**Corregido** extrayendo la lógica de "¿le toca este recurrente a este
periodo?" + la escritura del ledger a una función compartida
(`materializarUnRecurrenteTx`, en `recurrentes.ts` — vive ahí, no en
`materializar-recurrentes.ts`, para que `crearGastoRecurrente` pueda
reusarla sin crear un ciclo de imports, ya que
`materializar-recurrentes.ts` importa de `recurrentes.ts`, nunca al
revés). Ahora `crearGastoRecurrente` comprueba, en la misma
transacción, si hay un periodo activo al que le toque de inmediato
(`estado = 'activo' AND fechaFin >= hoy` — el filtro de fecha evita
materializar contra un periodo vencido que técnicamente sigue
marcado `'activo'` porque nadie disparó el cierre perezoso) y lo
materializa ahí mismo si corresponde. Sin riesgo de doble
materialización: un periodo que ya está activo nunca vuelve a pasar
por `crearPeriodo`/la promoción de borrador, así que este camino nuevo
y el original nunca compiten por el mismo periodo.

Validado con 4 tests nuevos: el caso exacto reportado (periodo del 16,
recurrente `diaMes: 17`), un recurrente `'mensual'` creado cuando el
periodo activo NO le toca (no debe materializarse), sin ningún periodo
activo (no debe fallar), y contra un periodo cuya fila sigue diciendo
`'activo'` pero ya venció en la realidad (no debe materializarse ahí).

Verificado en vivo contra la cuenta real, una vez resuelto el problema
de DNS de la máquina de desarrollo: el recurrente original de la
cuenta del usuario era anterior a este fix, así que quedó "huérfano" —
nunca iba a materializarse retroactivamente. Se corrigió pausándolo y
recreándolo idéntico, lo que sí disparó la materialización inmediata
del código nuevo. Esa misma verificación destapó un segundo bug real,
ver "Bug real: un pago automático materializado hoy se contaba como
gasto discrecional de hoy" en `## Disponible (el motor de flujo de
caja)`.

## Exportación

Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md §12,
"importación/exportación"). Solo exportación por ahora — importación
queda pendiente de una conversación de diseño aparte: un CSV externo
trae gastos con fechas pasadas, y la invariante 10 (un gasto solo se
registra contra un periodo `'activo'`) choca con eso de una forma que
todavía no está resuelta (¿se generan como "ajustes", igual que editar
un gasto de un periodo cerrado? ¿se crea un periodo retroactivo?).

**`GET /exportar/gastos.csv`** y **`GET /exportar/ingresos.csv`**: todo
el historial del tenant de una vez (a diferencia de `listarGastos`/
`listarIngresos`, que son por periodo, y de `listarGastos` en
particular, que pagina) — un respaldo completo es justo el punto.
Filtros opcionales `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` sobre
`fechaEfectiva`. Un gasto/ingreso revertido aparece igual que en el
listado normal, con `revertido=true` — nunca se oculta (mismo criterio
de "nunca hard delete" que el resto del sistema).

Los montos se formatean como decimal exacto (`shared/csv.ts`,
`centavosADecimalCsv`) directo desde el `bigint`, sin pasar por
`Number` — a diferencia de `montoADto` en la capa HTTP normal, que sí
lo hace porque el contrato de openapi.yaml pide `integer` en JSON; un
CSV no tiene esa restricción, así que no hace falta arriesgar
precisión para montos grandes.

Frontend: dos botones en Historial ("Exportar gastos/ingresos CSV").
Como el archivo necesita el header `Authorization` (que un `<a href>`
normal no puede mandar), se pide con `fetch` directo y se dispara la
descarga con un `<a download>` sintético armado sobre un blob
(`lib/api.ts`, `descargarArchivo`) — el patrón estándar para descargar
un archivo autenticado desde una SPA.

Validado contra Postgres real (`test/integracion/exportar.test.ts` +
`test/unidad/csv.test.ts`): formato exacto de cada fila, categoría/nota
vacías cuando no aplican, un gasto/ingreso editado aparece dos veces
(original revertido=true, corregido revertido=false), escapado de
comas/comillas en la nota, filtro de fechas, aislamiento entre
tenants, y el formateo de centavos a decimal (incluido negativo y
cero). Probado en vivo contra el servidor y la cuenta de prueba reales:
ambos botones descargan un CSV con los datos correctos.

## Pase de QA/UX

Revisión manual de todo el frontend contra el servidor y la cuenta de
prueba reales (escritorio y móvil) — no atada a ningún feature puntual.
Tres hallazgos corregidos:

**IDs malformados devolvían 500 en vez de un 404/400 limpio.** Cualquier
lookup que compara una columna `uuid` contra un valor externo (de la
URL o del body) sin pasar por una validación de formato antes: si el
valor no tiene forma de UUID, Postgres rechaza la consulta entera con
`invalid input syntax for type uuid` — un error que no es
`ErrorDominio`, así que caía al manejador genérico de 500. Confirmado
en `GET /periodos/:id`, `PATCH /gastos-recurrentes/:id` y
`POST /metas/:id/aportes`; el resto de rutas con id comparten el mismo
punto de lookup, así que estaban igual de expuestas. Corregido con
`shared/validacion.ts` (`esUuidValido`), agregado como guarda al
principio de cada función central de lookup por id
(`obtenerPeriodoPorIdTx`, `cargarGastoParaCorreccionTx`,
`cargarIngresoParaCorreccionTx`, `obtenerMetaPorIdTx`,
`obtenerGastoRecurrentePorIdTx`, `obtenerCategoriaPorIdTx`,
`obtenerResumenTx`, `obtenerMetaParaReclamoTx`, y el chequeo inicial de
`cerrarPeriodoManualmente`) — mismo criterio que ya aplica el resto del
sistema para BOLA: "malformado" y "no existe" deben verse exactamente
igual desde afuera, nunca un 500. Validado con
`test/unidad/validacion.test.ts` y
`test/integracion/ids-malformados.test.ts` (un id malformado en cada
uno de esos puntos de entrada, confirmando el código de error correcto
en vez de un error crudo de Postgres).

**Historial no mostraba ningún estado de error para Ingresos/Gastos.**
Si la consulta fallaba (el bug de arriba, o cualquier error real), la
pantalla se quedaba en "Cargando…" y después en blanco, sin mensaje —
inconsistente con el resto de la app. Corregido exponiendo el `error`
de `useIngresos`/`useGastos` en `Historial.tsx`, mismo patrón que ya
usan Home/Metas/Recurrentes/Resumen.

**No había página 404.** Una URL no reconocida (typo, marcador viejo,
enlace roto) no coincidía con ninguna `<Route>`, y `<Routes>` no
renderiza nada en ese caso — pantalla en blanco sin mensaje ni forma de
volver. Corregido con `routes/NoEncontrado.tsx` + `<Route path="*">` al
final de `App.tsx`, fuera de `ProtectedRoute` para que cubra cualquier
ruta no declarada sin importar si hay sesión.

Dos hallazgos menores, corregidos en una segunda pasada a pedido del
usuario:

**Periodos duplicados sin distinguir.** Cuando hay varios periodos
`'cerrado'` con el mismo rango de fechas (cerrar manualmente antes de
tiempo y crear otro dentro de la misma quincena calendario —
reproducible, no solo teórico), "Periodos anteriores" los listaba con
la etiqueta idéntica repetida, sin forma de saber cuál es cuál.
Corregido exponiendo `creadoEn` en `Periodo` (extensión sobre
`docs/openapi.yaml` — serializado a ISO string por el `JSON.stringify`
default de Fastify, igual que `fechaRegistro` en `GastoDetallado`);
`Historial.tsx` solo lo muestra cuando de verdad hace falta (dos o más
periodos comparten el mismo `fechaInicio`/`fechaFin`), nunca para el
caso normal de un único periodo por rango.

**Ediciones rápidas en línea validaban en silencio.** Aportar/retirar
en metas y editar el monto de un gasto/ingreso (`FilaMeta.tsx`,
`FilaGasto.tsx`, `FilaIngreso.tsx`) usan `useState` simple, no RHF+Zod
como los formularios principales — un valor inválido hacía que el
botón no hiciera nada, sin explicar por qué. Corregido agregando un
mensaje de validación armado a mano en cada uno, limpiado en cuanto el
usuario vuelve a escribir.

## Importación

Extensión sobre `docs/openapi.yaml` (documento-maestro-v2.md §12,
"importación/exportación" — complemento de "Exportación", arriba).

**Alcance deliberadamente acotado, decidido con el usuario:** una fila
del CSV cuya fecha no cae dentro del periodo activo actual se rechaza
y se reporta como error, sin tocar ningún periodo cerrado. La
alternativa (generarla como ajuste contra el periodo activo, igual que
editar/eliminar un gasto de un periodo cerrado) habría mezclado en el
periodo activo gastos que en realidad no le pertenecen — se descartó a
propósito. Esto evita cualquier tensión con la invariante 10 (un gasto
solo se registra contra un periodo `'activo'`): importar es, para el
dominio, exactamente lo mismo que capturar esas filas a mano una por
una, nunca un camino especial.

**`POST /periodos/{periodoId}/gastos/importar`** y su espejo para
ingresos: reciben el CSV como `text/csv` en el body (no
`multipart/form-data` — el frontend ya lo lee con `FileReader` antes de
mandarlo, así que es texto plano de principio a fin; requirió registrar
un `addContentTypeParser` en `app.ts`, ya que Fastify solo trae
`application/json` de fábrica). Columnas por nombre, no por posición
(`fecha` y `monto` obligatorias; `moneda` opcional con default `MXN`;
`categoria` opcional, buscada por nombre sin distinguir mayúsculas
contra las categorías del tenant — si no coincide ninguna, la fila se
importa sin categoría, no es un error; `nota` opcional).

**Validación por fila, no todo-o-nada:** cada fila se valida (fecha
real con formato `YYYY-MM-DD` y dentro del rango del periodo activo,
monto positivo) antes de insertar nada; las filas válidas se registran
y las inválidas se reportan con su número de línea y el motivo —
`{ creados, errores: [{ fila, mensaje }] }`. Un typo en una fila no
bloquea las demás.

**Parser de CSV escrito a mano** (`shared/csv.ts`, `parsearFilasCsv`) —
sin dependencia nueva, deliberado: es la operación inversa de
`escaparCsv`/`filaCsv` que ya existían para exportar, mismo nivel de
rigor. Máquina de estados carácter por carácter (RFC 4180): respeta
comillas, comas y saltos de línea reales dentro de un campo
entrecomillado, `""` como comilla literal, quita un BOM inicial (común
en CSVs de Excel), y acepta tanto `\r\n` como `\n`. Un `split(',')`
ingenuo habría partido en silencio una fila con un campo como
`"Cena, con amigos"`, produciendo columnas corridas en vez de fallar
claramente.

`parsearMontoDecimalCsv` (mismo archivo) y `esFechaIsoValida`
(`shared/fechas.ts`) completan la validación: el primero acepta
`"150"`/`"150.5"`/`"150.50"` sin pasar por `Number` (mismo motivo que
`centavosADecimalCsv`); el segundo rechaza fechas con la forma correcta
pero que no existen en el calendario (`2026-02-30`), algo que una
regex de formato por sí sola no detecta porque `Date.UTC` las
normaliza en silencio en vez de fallar.

Validado contra Postgres real (`test/integracion/importar.test.ts` +
`test/unidad/csv.test.ts` + `test/unidad/fechas.test.ts`): columnas
obligatorias faltantes, filas válidas e inválidas mezcladas en el mismo
archivo, fecha fuera de rango, monto inválido, fecha con formato
inválido, coincidencia de categoría sin distinguir mayúsculas, una
categoría que no coincide con ninguna (no es error), un campo de nota
entrecomillado con una coma adentro, un periodo cerrado o de otro
tenant, y el parser de CSV en aislamiento (comillas, `""`, saltos de
línea reales, CRLF, BOM, líneas en blanco). Probado en vivo contra el
servidor y la cuenta de prueba reales, incluida una fila con un monto
como `"1,234.00"` (coma real dentro del campo entrecomillado) para
confirmar que el parser no la parte en dos columnas.

## Observabilidad

documento-maestro-v2.md, F0 "Fundaciones" y §15.1 (Must: "métricas
instrumentadas") — pendiente desde el inicio del proyecto, cerrado
junto con el hueco de CI del frontend (ver "Cómo correr los tests
localmente", arriba) al analizar qué era lo más viable después de
agotar el backlog de features rápidas.

**Backend** (`shared/observabilidad.ts`, `@sentry/node`):
`inicializarObservabilidad()` se llama una sola vez en `server.ts` —
nunca dentro de `crearApp()`, para que `test:local`/CI (que importan
`crearApp` directo) no dependan de esto. Sin `SENTRY_DSN` en el
entorno, `Sentry.init` nunca se ejecuta y cualquier
`Sentry.captureException` posterior es un no-op seguro (comportamiento
documentado del SDK) — nada se rompe en desarrollo ni en CI, donde la
variable nunca está definida. `reportarErrorInesperado` se llama en un
único punto: el 500 genuino de `registrarManejadorErroresDominio`
(`shared/http.ts`), nunca para un `ErrorDominio` (respuestas de
negocio esperadas, no bugs) ni para los 4xx que ya reenvía Fastify.

**Frontend** (`lib/observabilidad.ts`, `@sentry/react`): mismo
criterio con `VITE_SENTRY_DSN` opcional. Viene acompañado de un
`<Sentry.ErrorBoundary>` envolviendo `<App />` en `main.tsx` —
hallazgo relacionado con el pase de QA/UX (mismo espíritu que
`routes/NoEncontrado.tsx` para una URL no reconocida): sin esto, un
error de render en cualquier componente dejaba a React desmontar el
árbol entero y el usuario se quedaba viendo una pantalla en blanco,
sin mensaje ni forma de recuperarse. Verificado en vivo forzando un
throw real durante el render (no dentro de un `onClick` — React no
captura errores de manejadores de evento con un ErrorBoundary, solo
los de render/lifecycle) y confirmando que aparece el fallback
("Algo salió mal" + botón "Reintentar") en vez de la pantalla en
blanco.

Ninguna de las dos integraciones manda nada a ningún lado hasta que se
agregue un DSN real a `.env` — ver `.env.example` en ambos proyectos.

## Tarjetas de crédito y MSI

documento-maestro-v2.md, diferenciador #3: "tarjetas de crédito y MSI
modelados nativamente". **Deliberadamente sin conexión bancaria** —
mismo criterio que el resto del producto (tesis de valor, §1.3: "sin
conexión bancaria, resuelve el ciclo quincenal mexicano"; §20 explica
por qué: la CNBV nunca emitió las reglas secundarias de Open Finance
transaccional en México). El usuario captura cada compra a mano, igual
que un gasto en efectivo — la diferencia está en el modelo de datos.

**`'tarjeta'` ya existía en `TIPOS_CUENTA` desde el primer commit**,
reservado sin usarse. Tabla `tarjetas` (mismo patrón que `metas`):
`cuentaId`, `limiteCreditoValorMinimo`, `diaCorte`, `diasParaPago` (el
plazo de pago mexicano real es "N días después del corte", no un día
fijo del mes). Una tarjeta es un pasivo: saldo negativo = deuda, un
cargo la vuelve más negativa, un pago la acerca a cero.

**Dos movimientos nuevos en el ledger, nunca uno solo** — esto es lo
que permite que una compra a 12 MSI no golpee el disponible de la
quincena de un jalón:

- **`cargo_tarjeta`** (la compra): `tarjeta -> externo`. Sube la deuda
  de inmediato, no toca ningún periodo. En la misma transacción se
  calculan y guardan las `numeroPlazos` mensualidades futuras
  (`pagos_tarjeta`), con sus fechas de vencimiento reales
  (`calcular-ciclo.ts`: antes del corte → ese ciclo, después → el
  siguiente; cada mensualidad subsecuente, un corte más adelante).
  `repartirEnMensualidades` (registrar-cargo.ts) carga el residuo del
  redondeo a la última mensualidad, para que la suma cierre exacto en
  centavos.
- **`pago_tarjeta`** (cada mensualidad al vencer): `periodo -> tarjeta`,
  transferencia interna — mismo patrón que `arrastre_sobrante` entre
  periodo y periodo. Baja el disponible de esa quincena y la deuda de
  la tarjeta en la misma operación.

**Materialización:** `materializarPagosTarjetaTx` se llama en los
mismos dos puntos exactos que `materializarRecurrentesTx`
(`crearPeriodo` y la promoción de borrador) — al activarse un periodo,
cualquier mensualidad pendiente que venza en su ventana se materializa
sola. El usuario solo interactúa una vez, al registrar la compra;
todas las quincenas futuras ya "saben" lo que les toca. Misma
limitación conocida que recurrentes: si el periodo al que le tocaba
una mensualidad nunca se activa, queda pendiente hasta que sí se
active uno cuya ventana la cubra.

**Encaje con el resto del sistema, todo verificado, no supuesto:**
`obtenerSaldoCuenta` ya suma TODOS los asientos de una cuenta sin
importar el tipo, así que `disponible` refleja un `pago_tarjeta`
automáticamente, sin tocar `consultar-disponible.ts` para el cálculo
principal — solo el corte de `gastadoHoy` (restringido a tipos
específicos) necesitó agregar `'pago_tarjeta'` junto a `'gasto'`/
`'aporte_meta'`. La clasificación exhaustiva de `generar-resumen.ts`
(que revienta a propósito ante un tipo no clasificado — el mismo
mecanismo que ya atrapó el bug de "arrastre heredado") obligó a sumar
`'pago_tarjeta'` a `TIPOS_GASTO`; `'cargo_tarjeta'` no necesita
clasificarse ahí porque nunca postea contra `periodo.cuentaId`.

**Dos decisiones de producto, tomadas explícitamente con el usuario al
diseñar esto** (a diferencia del resto del sistema, donde "presupuesto
excedido" nunca bloquea): un cargo que excede el crédito disponible
**se bloquea** (`LIMITE_CREDITO_EXCEDIDO`, 403) — un límite de tarjeta
es un tope físico real, no una guía. Y el alcance de esta primera
versión es **solo mensualidades automáticas**: no hay abonos extra ni
adelantados todavía (quedaría como extensión futura, igual que aportar
a una meta) — el modelo asume que se paga exactamente lo calculado al
momento de la compra.

Validado contra Postgres real (`test/integracion/tarjetas.test.ts` +
`test/unidad/tarjetas.test.ts`): validaciones de entrada, BOLA en
tarjeta y categoría, bloqueo del límite de crédito (incluido el caso
límite exacto), reparto de mensualidades con residuo, matemática de
fechas de corte/vencimiento (antes/después/exacto del corte, cruce de
año, día de corte que no existe en el mes), materialización correcta
al activar un periodo, un periodo en borrador que no materializa
todavía, clasificación correcta en el resumen de cierre, y aislamiento
entre tenants. Probado en vivo contra el servidor y la cuenta de
prueba reales: alta de tarjeta, cargo a 12 MSI con las mensualidades
correctas, y el bloqueo real del límite de crédito.

### Aviso de pagos de tarjeta aplicados

Hallazgo real (el usuario preguntó explícitamente: "¿se descuenta
automático o hay que agregarlo a mano?"): el pago de una mensualidad sí
se descuenta solo del disponible, pero un `'pago_tarjeta'` nunca
aparece en `GET /periodos/:id/gastos` (es un tipo de movimiento
distinto, no una fila de `gastos`) — así que no había ninguna forma de
enterarse de que había pasado, más allá de notar a mano que una
mensualidad cambió a "Pagado" en Tarjetas → Ver compras.

**`listarPagosTarjetaDePeriodo`** (`registrar-cargo.ts`) + **`GET
/periodos/{periodoId}/pagos-tarjeta`**: para cualquier periodo, lista
qué mensualidades ya se le aplicaron (tarjeta, descripción del cargo,
número de pago/plazos, monto). Frontend: una tarjeta de aviso en Home
cuando el periodo activo tiene pagos aplicados (mismo estilo que el
aviso de sobrante pendiente), y una sección "Pagos de tarjeta" en
Historial para cualquier periodo — llenando el hueco de visibilidad
que dejaba que `pago_tarjeta` nunca apareciera junto a los gastos
normales.

Validado con una extensión de `test/integracion/tarjetas.test.ts`: el
periodo que recibe la mensualidad la ve en la consulta, el periodo
donde solo se hizo la compra (antes de que venza nada) no ve nada.
**Intento de verificación en vivo contra la cuenta real, con la
tarjeta BBVA que ya existe ahí:** no se pudo completar — la
materialización de `pago_tarjeta` solo ocurre en el momento en que un
periodo se activa (limitación conocida, ver el comentario en
`materializar-pagos-tarjeta.ts`), y el periodo activo actual (16-30 de
septiembre) ya estaba activo desde antes de que existiera cualquier
cargo de prueba — no hay forma de retriggerar esa activación sin
cerrar el periodo real antes de tiempo, algo que no vale la pena hacer
solo para ver un aviso en pantalla. La primera mensualidad real de BBVA
vence el 10 de octubre, dentro del periodo del 1-15 de octubre — se
verá en vivo cuando ese periodo se active de forma natural. Mientras
tanto, el mecanismo completo (materialización al activarse un periodo +
el endpoint `GET /periodos/:id/pagos-tarjeta`) sigue cubierto por
`test/integracion/tarjetas.test.ts` contra Postgres real, incluyendo el
caso exacto de "una mensualidad que vence dentro del periodo activo".

## Eliminar tarjetas/categorías/metas

Hallazgo real del usuario: creaba una tarjeta por error (o quería una
categoría/meta que ya no le servía) y no había ninguna forma de
quitarla — los tres módulos solo tenían crear + listar. No es un
`DELETE` genérico: cada uno se bloquea distinto según qué tan "en uso"
está.

- **Tarjetas** (`eliminarTarjeta`, `tarjetas.ts`): solo si nunca tuvo
  ningún cargo. Un cargo ya generó un movimiento `'cargo_tarjeta'` real
  (inmutable, ADR-001) contra la cuenta de la tarjeta; sin cargos, esa
  cuenta nunca recibió ni un solo asiento, así que sí se borra de
  verdad (fila de `tarjetas` + su `cuenta`) — a diferencia de
  gastos/ingresos, que nunca se borran de verdad. `TARJETA_CON_HISTORIAL`
  (409) si ya tiene cargos.
- **Categorías** (`eliminarCategoria`, `categorias.ts`): las
  predeterminadas nunca se pueden eliminar (`CATEGORIA_PREDETERMINADA`,
  409) — las siembra `resolverOcrearIdentidad` para todo tenant nuevo,
  no son un dato del usuario. Una personalizada solo se borra si nadie
  la usó todavía: `categoriaId` es nullable en tres tablas distintas
  (`gastos`, `gastos_recurrentes`, `cargos_tarjeta`), así que Postgres
  no lo bloquearía con una FK — se comprueban las tres a mano
  (`CATEGORIA_EN_USO`, 409) para no dejar un gasto ya registrado
  apuntando a una categoría que ya no existe.
- **Metas** (`eliminarMeta`, `metas.ts`): solo si su cuenta nunca
  recibió ningún asiento — no "saldo en cero", que un aporte seguido de
  un retiro idéntico también deja en cero pero con historial real
  detrás (`aportarAMeta`, `retirarDeMeta`, y `decidirSobrante` cuando
  el usuario elige "ahorrar" también escriben contra esta cuenta).
  `META_CON_HISTORIAL` (409) si ya tiene algo.

Extensión sobre `docs/openapi.yaml` (que no define `DELETE` para
ninguno de los tres todavía), mismo criterio que el resto de
extensiones documentadas en este README.

Frontend: botón "Eliminar" en la fila de cada tarjeta/meta (siempre
visible — el backend decide si aplica, el frontend no adivina
consultando cargos/aportes por adelantado solo para eso). Categorías no
tenía ninguna pantalla propia (solo el selector inline al capturar un
gasto, con "+ Nueva categoría…") — se agregó `routes/Categorias.tsx`
(mismo patrón que Tarjetas.tsx/Metas.tsx) con el listado completo y
"Eliminar" únicamente en las personalizadas.

16 tests nuevos entre los tres módulos (BOLA, predeterminada, en uso
por cada una de las tres tablas para categorías, aporte+retiro
idénticos para metas), contra Postgres real. Verificado en vivo contra
la cuenta real: bloqueo real de una tarjeta con cargos y de una
categoría en uso, y borrado real de una tarjeta/categoría/meta de
prueba sin historial.

## Recordatorios por correo

Primer canal real de los recordatorios contextuales
(documento-maestro-v2.md §13.4, "núcleo, no accesorio"): hasta ahora
`RecordatorioContextual.tsx` solo avisaba dentro de la app — inútil si
el usuario ya dejó de abrirla, que es justo el riesgo #1 que el
documento cita (las apps de finanzas retienen ~4% de usuarios a 30
días). Esta primera iteración cubre el **recordatorio diario**
(reglas 1, 2, 3 y 5 de §13.4); la **alerta de ritmo** (regla 4,
"vas gastando más rápido de lo sostenible") queda para después — es un
disparador distinto (comportamiento, no inactividad), no vale la pena
mezclar los dos de una vez.

**Proveedor: Resend**, no el buzón de correo del hosting — un buzón
normal (`hola@dominio`) está pensado para que una persona reciba/mande
correo a mano, con límites de envío bajos y reputación de IP
compartida; nada de eso sirve para que una aplicación le mande un
correo automático a cada usuario. `shared/email.ts` es un wrapper
delgado, mismo criterio que `observabilidad.ts` con Sentry: sin
`RESEND_API_KEY` no manda nada y no truena (desarrollo/CI seguros).

**Despliegue: Cron Job de Railway**, no un endpoint HTTP — un segundo
servicio en el mismo proyecto, `scripts/enviar-recordatorios.ts`
(`npm run recordatorios`), corriendo `0 2 * * *` UTC (8pm hora de
México, fija sin DST). Nunca vive dentro del servidor Fastify — sigue
siendo "puro request/response".

**Una excepción de arquitectura, documentada en `shared/db-admin.ts`:**
el script necesita enumerar TODOS los tenants antes de saber a cuáles
procesar — algo que ningún otro módulo hace (todo lo demás vive dentro
de una request ya scoped a un tenant). Para eso usa una conexión
aparte con el rol `postgres` (el mismo de las migraciones,
`BYPASSRLS`), **solo** para `listarTenantIdsConRecordatoriosActivos` —
el resto del trabajo, tenant por tenant, sigue pasando por
`conTenant`/`app_backend`/RLS de siempre (`consultarDisponible`, etc.).
No es el mismo riesgo que "el servidor sirviendo requests con ese rol"
(la razón de ser de `app_backend`): un script de cron sin superficie
HTTP no es alcanzable por un tenant atacante.

**Cómo decide si le toca hoy a un tenant** (`enviar-recordatorios.ts`,
en orden): periodo activo + ingreso registrado (regla 5, nunca con
datos incompletos) → `gastadoHoy === 0` (regla 2, se silencia sola si
ya hubo actividad) → no se le mandó ya hoy (`recordatorios_enviados`,
índice único — protege contra que el cron corra dos veces, CLAUDE.md)
→ **frecuencia decreciente** (regla 3): si en las 24h después de cada
uno de sus últimos 3 recordatorios no hubo ningún gasto/ingreso, entra
en "backoff" — cadencia baja a cada 3 días hasta que uno sí tenga
actividad después, ahí vuelve a diario solo, sin bandera que resetear
a mano (se recalcula desde cero en cada corrida). Si pasa los filtros,
calcula la cifra con la misma `consultarDisponible` que usa la app y
manda: *"Te quedan N días con $X disponible — hoy puedes gastar hasta
$Y."* — mismo texto que la tarjeta dentro de la app.

**El correo del usuario no vive en la base propia** (ADR-003: el
proveedor de auth es desacoplado) — se resuelve preguntándole a
Supabase Auth (`supabaseAdmin.auth.admin.getUserById`) por el usuario
detrás de la identidad `'supabase'` del tenant.

**Por qué `resolverCorreo` es un parámetro inyectable, no una llamada
directa:** es la única función de todo este módulo que hace una
llamada de red real a un proveedor externo, y `scripts/test-local.ts`
documenta como invariante que "los tests nunca llaman a Supabase de
verdad" (no pasan por `auth.ts`). El valor por defecto
(`resolverCorreoViaSupabase`) es lo único que usa el script en
producción; los tests pasan un stub. Por el mismo motivo,
`scripts/test-local.ts` ahora también fuerza `DATABASE_URL` al
Postgres efímero y `RESEND_API_KEY` vacío en el proceso de la suite —
sin esto, un `backend/.env` real en la máquina de desarrollo (que sí
tiene `DATABASE_URL`/`RESEND_API_KEY` reales) se habría filtrado hacia
los tests vía `dotenv/config`, apuntando `dbAdmin` a producción o
mandando correos reales durante `npm run test:local`.

**Preferencia de opt-out:** `tenants.recibir_recordatorios` (booleano,
default `true`) — vive en `tenants`, no en una tabla de preferencias
aparte, porque hoy es la única que existe y un tenant es de un solo
miembro. `GET`/`PATCH /preferencias`. Necesitó una política RLS de
`update` que `tenants` nunca había tenido (solo `select`/`insert`) —
sin ella el `PATCH` habría fallado en silencio (RLS bloquea el UPDATE,
cero filas afectadas, mismo hallazgo ya documentado para otras tablas).

13 tests nuevos en `test/integracion/notificaciones.test.ts` (sin
periodo activo, sin ingreso, ya hubo actividad hoy, ya se mandó hoy,
backoff activo, backoff termina tras los días de espera, backoff se
resetea con actividad real, sin correo resuelto, preferencias) contra
Postgres real — el envío en sí queda mockeado vía `resolverCorreo`,
nunca una llamada real.

**Verificado en vivo contra la cuenta real, de punta a punta:** el
ajuste de "Recibir recordatorios por correo" se apagó y se volvió a
prender (persiste contra la base real), y se corrió
`scripts/enviar-recordatorios.ts` de verdad contra las 115 filas reales
de `tenants` — 2 calificaron ese día, el correo a la cuenta real llegó
(a spam, ver abajo), y el índice único de `recordatorios_enviados`
protegió correctamente una segunda corrida el mismo día (`enviados: 0`
la segunda vez).

**Dos hallazgos reales de esa corrida:**

1. **El SDK de Resend no lanza en un error de la API** (límite del
   modo de prueba: solo entrega al correo dueño de la cuenta) — devuelve
   `{ data, error }` y solo lo loguea a consola por su cuenta.
   `enviarCorreo` no revisaba ese campo, así que un correo que Resend
   rechazó de verdad se contaba como `enviado: true` en el resumen del
   job. Corregido: ahora lanza si `error` viene presente, y el `catch`
   por tenant en el script lo cuenta como `fallido`, no como enviado.
2. **Llega a spam en modo de prueba** — esperado, no un bug: el
   remitente (`onboarding@resend.dev`) es un dominio compartido por
   miles de cuentas de Resend, sin reputación propia, y "Korly" como
   nombre con un dominio ajeno es justo el patrón que los filtros
   asocian con suplantación. El mecanismo completo (disparo, contenido,
   entrega) ya quedó probado; solo faltaba el dominio propio.

**Dominio propio: resuelto.** `korly.com.mx` comprado en Cloudflare
Registrar (precio al costo, $16.75/año, sin margen de reventa —
verificado contra GoDaddy, que cobra $36.99/año real detrás de un
"$0.01" del primer año, y Namecheap, que ni siquiera vende `.com.mx`)
y verificado en Resend vía los registros DNS que Resend pide (DKIM TXT
+ dos CNAME de SPF + TXT de DMARC opcional), todos con proxy de
Cloudflare **apagado** — un CNAME/TXT de verificación de correo tiene
que resolver al valor real, no a la IP del proxy de Cloudflare.
`RESEND_REMITENTE` ya apunta a `hola@korly.com.mx`. Probado con un
envío real directo contra la API de Resend (sin pasar por la app,
para aislar la variable): llegó a la bandeja principal, no a spam —
confirma que SPF/DKIM/DMARC quedaron bien configurados.

**Nota del registro `.com.mx`:** no admite privacidad de WHOIS por
política del registro (no es específico de Cloudflare) — los datos de
contacto del registrante quedan públicamente visibles en cualquier
búsqueda de WHOIS, sin opción de ocultarlos en ningún registrador.

## Planes Free/Pro

`documento-maestro-v2.md §9.2` define la matriz de qué va en cada plan.
`tenants.plan` (`'free' | 'pro'`, default `'free'`) es el único campo
nuevo — `modulos/planes/planes.ts` es el punto único donde el resto de
los módulos preguntan "¿este tenant es Pro?" (`obtenerPlanTenantTx`) o
exigen que lo sea (`requerirPlanProTx`, para funciones exclusivas de
Pro como exportar).

**Sin cobro real todavía a propósito.** Stripe+PAC (documento-maestro-v2.md
§6.9) requiere que el usuario resuelva primero su alta fiscal (RFC,
régimen) — no es un bloqueo técnico, es una decisión de negocio
pendiente. Por eso **no existe ningún endpoint de autoservicio para
subir de plan**: un "actualízate a Pro" sin nada real que cobre de por
medio sería un gate falso, código a medio construir que habría que
rehacer entero cuando exista el webhook de Stripe. Hasta entonces,
subir un tenant a `'pro'` es un `UPDATE` manual (Supabase SQL Editor o
Table Editor) — los tests lo hacen igual, escribiendo directo a
`tenants` (ver `establecerPlan` en `test/integracion/metas.test.ts`,
mismo criterio que `insertarBorrador` en `tarjetas.test.ts`).

**Los tres gates construidos** (los otros dos de la matriz — categorías
personalizadas y recordatorios básicos — el documento mismo dice que
deben quedarse gratis para todos, así que no llevan gate):

- **Metas de ahorro** (`crearMeta`, `metas.ts`): límite de 2 en Free
  (el documento dice "1–2"; se eligió 2 por permitir un caso de uso
  real — p. ej. "vacaciones" + "fondo de emergencia" — sin ser tan
  restrictivo como una sola). `LIMITE_METAS_ALCANZADO` (403). Contando
  el total de filas de `metas`, no "activas" — no existe el concepto de
  meta inactiva; `eliminarMeta` (ya construido) es la forma de liberar
  un cupo.
- **Historial de reportes** (`listarPeriodos`, `crear-periodo.ts`):
  Free ve solo los últimos 12 meses. A diferencia de los otros dos
  (bloquean una escritura), este recorta una lectura — el corte se
  calcula contra `fechaReferencia` en cada consulta, nunca una fecha
  fija guardada: un periodo que hoy tiene 11 meses debe seguir viéndose
  el mes que entra, no desaparecer de golpe en una fecha ya decidida
  hoy.
- **Exportación CSV** (`exportarGastosCsv`/`exportarIngresosCsv`,
  `exportar.ts`): bloqueada por completo en Free. Hallazgo real al
  revisar la matriz contra lo ya construido: la exportación llevaba
  semanas funcionando **sin ningún gate** — cualquier tenant free podía
  usarla gratis. `FUNCION_PRO` (403).

**Sin cambios de frontend** — los tres gates devuelven su mensaje vía
`ErrorDominio`, y los componentes ya existentes (`FormularioMeta.tsx`,
`Historial.tsx`) ya renderizan `error.message` tal cual desde antes;
el corte de historial es un filtro silencioso, no un error, así que
tampoco necesita nada nuevo en pantalla.

6 tests nuevos (2 por gate: bloquea en Free, permite en Pro) contra
Postgres real.

## CORS

`@fastify/cors` se registra en `src/app.ts`, con origen configurable
vía `CORS_ORIGIN` (lista separada por comas; default
`http://localhost:5173`, el puerto de Vite en desarrollo).

**Hallazgo real, no hipotético:** ningún test, ni `curl`, ni Postman,
ni el archivo `.http` necesitaron esto nunca — ninguno pasa por un
navegador. En cuanto el frontend (`frontend/`) intentó su primer
`GET /me` real, Fastify respondía 404 al preflight `OPTIONS` (sin CORS
no hay ninguna ruta para ese método) y el navegador nunca llegaba a
mandar el request real. Si el frontend corre en un puerto distinto al
default, `CORS_ORIGIN` tiene que incluirlo.

Los métodos permitidos se declaran explícitos
(`['GET', 'POST', 'PATCH', 'DELETE']`) — el default de
`@fastify/cors` no incluye `PATCH`/`DELETE` (comprobado contra el
servidor real con `curl -X OPTIONS`), lo que habría bloqueado editar y
eliminar ingreso o gasto desde el navegador aunque el preflight
respondiera 204.

## Capa HTTP

```
src/shared/http.ts                     # registrarManejadorErroresDominio, montoADto/montoDesdeDto
src/modulos/periodos/rutas.ts          # POST /periodos, GET /periodos/activo, GET /periodos, GET /periodos/:id
src/modulos/ingresos/rutas.ts          # POST/GET /periodos/:periodoId/ingresos, PATCH/DELETE /ingresos/:ingresoId
src/modulos/gastos/rutas.ts            # POST/GET /periodos/:periodoId/gastos, PATCH/DELETE /gastos/:gastoId
src/modulos/disponible/rutas.ts        # GET /periodos/activo/disponible
src/modulos/cierre/rutas.ts            # POST .../cerrar, GET .../resumen, POST .../sobrante/decision, GET /resumenes/pendiente
src/modulos/metas/rutas.ts             # POST/GET /metas, POST /metas/:id/aportes, POST /metas/:id/retiros
src/modulos/categorias/rutas.ts        # GET/POST /categorias
```

Veintitrés endpoints para ejercer el ciclo central, corregir un
ingreso o un gasto, categorizar un gasto, ahorrar hacia una meta, y ver
de vuelta lo que se capturó (incluidos periodos ya cerrados y
sobrantes sin decidir) — ya toda la API de `docs/openapi.yaml`, incluido
`GET /periodos/{periodoId}`, definido desde el diseño original pero
nunca expuesto hasta esta revisión. Todos viven bajo `/v1` y detrás del
mismo `authPlugin` que ya protege `/v1/me` desde el punto
1 — nada nuevo en autenticación, solo se extiende.

**Cada ruta llama directo a la función de dominio que ya existía y
estaba probada.** No hay lógica de negocio nueva en `rutas.ts` — son
handlers finos que deserializan el body, llaman, y serializan la
respuesta. La validación real (¿el periodo está activo? ¿el monto es
positivo?) sigue viviendo en las funciones de dominio, no se duplicó
aquí.

**Mapeo de errores, centralizado.** `registrarManejadorErroresDominio`
es un `setErrorHandler` global: traduce cualquier `ErrorDominio` a
`{codigo, mensaje}` con el status correcto
(`PERIODO_NO_ENCONTRADO`→404, `GASTO_NO_ENCONTRADO`→404,
`INGRESO_NO_ENCONTRADO`→404, `META_NO_ENCONTRADA`→404,
`CATEGORIA_NO_ENCONTRADA`→404, `LIMITE_CATEGORIAS_ALCANZADO`→403,
`PERIODO_NO_ACTIVO`→409, `SOBRANTE_YA_DECIDIDO`→409,
`SIN_PERIODO_ACTIVO`→409, `GASTO_YA_REVERTIDO`→409,
`INGRESO_YA_REVERTIDO`→409, `VALIDACION`→400,
`NO_SOPORTADO`→501 — no 400: el valor es válido según el contrato,
simplemente no está implementado, mismo criterio que ya se usaba en
`decidirSobrante`).
También respeta el `statusCode` que Fastify ya trae en sus propios
errores de framework (body JSON vacío o mal formado, ruta inexistente)
en vez de aplastarlos a 500 — **bug real, no hipotético**, encontrado
probando el ciclo completo contra el servidor real: un
`POST /cerrar` sin body pero con `Content-Type: application/json` es
un 400 de Fastify (`FST_ERR_CTP_EMPTY_JSON_BODY`), y la primera
versión de este manejador lo devolvía como 500.

**`bigint` ↔ `integer` en el límite HTTP — decisión consciente, con su
límite documentado (no solo mencionada de pasada).** Internamente todo
monto es `bigint` (ADR-002). `docs/openapi.yaml` define
`Monto.valorMinimo` como `integer` — un número JSON, no un `string`.
`montoADto`/`montoDesdeDto` (`shared/http.ts`) son el único lugar que
convierte entre ambos, tal como exige ADR-002 ("un solo lugar en el
código convierte entre entero y presentación"). La conversión no
pierde precisión para ningún monto real: `Number.MAX_SAFE_INTEGER`
(2^53 − 1) equivale a ~90 billones de pesos en centavos. Más allá de
eso, `Number(bigint)` pierde precisión en silencio — un límite teórico
real, pero ya implícito en que el propio contrato eligió `integer` y
no `string` para este campo; no es una laxitud introducida por esta
implementación, hereda la del contrato.

**Simplificaciones conscientes frente al contrato completo:**
- `POST /periodos/:id/ingresos` y `.../gastos` devuelven `{id,
  movimientoId, periodoId}`, no el `Ingreso`/`Gasto` completo de
  `docs/openapi.yaml` (que ecoa monto/fecha) — esos campos viven en
  `movimientos`, no en `ingresos`/`gastos` (deliberadamente delgadas,
  ver esas secciones arriba), y reconstruirlos pediría una consulta
  nueva que nada más necesita todavía.
- `GET /periodos/:id/resumen` devuelve 404 tanto si el periodo no
  existe como si existe pero no está cerrado — `docs/openapi.yaml`
  distingue esos dos casos (404 vs. 409) y distinguirlos aquí pediría
  una consulta extra a `periodos` que hoy nada más necesita.
- `disponible`/`cifraDiaria`/`montoAplicado` en las respuestas de
  disponible y de decidir sobrante asumen `moneda: 'MXN'` a la fuerza
  — ni `consultarDisponible` ni `decidirSobrante` rastrean moneda
  internamente (multi-moneda está fuera del MVP), mismo default que ya
  usa `generar-resumen.ts` cuando no hay de dónde derivarla.

## Probar el ciclo completo (REST Client)

[`http/ciclo-completo.http`](http/ciclo-completo.http) ejercita el
ciclo entero contra el servidor local apuntando a tu Supabase real:
autenticación → crear periodo → ingreso → disponible → dos gastos
(consultando disponible entre cada uno, para ver el sobregiro) →
cerrar → resumen → decidir sobrante → crear el periodo siguiente →
confirmar que heredó el arrastre (pasos 1-17) — y a partir de ahí,
listar ingresos/gastos del primer periodo (con paginación), editar y
eliminar dos de esos gastos ya en un periodo cerrado (para ver el
ajuste cruzar al periodo activo de hoy), y confirmar que siguen
apareciendo en la lista aunque ya estén corregidos (pasos 18-25); y
crear una meta, aportar (con su efecto en `gastadoHoy`), retirar (con
motivo obligatorio), cerrar el periodo y decidir "ahorrar" el sobrante
— confirmando que la meta lo recibe de inmediato, sin esperar a un
periodo siguiente (pasos 26-35). El archivo se sigue extendiendo así,
en el mismo orden en que se van agregando módulos — no hace falta un
archivo nuevo por cada punto.

**Cómo correrlo:**

1. Instala la extensión **REST Client** (`humao.rest-client`) en VS
   Code. No hace falta Postman ni una cuenta externa — el archivo vive
   en el repo, versionado junto con el código.
2. Levanta el servidor real (`npm run dev`, con tu `.env` ya
   configurado — ver pasos 1-6 arriba) y aplica las migraciones
   pendientes si no lo has hecho (`npm run db:migrate`).
3. Consigue un `access_token` real de Supabase Auth: la forma más
   rápida sin frontend todavía es la misma del paso 7 de arriba
   (crear un usuario de prueba en el dashboard de Supabase, obtener
   `data.session.access_token` vía el SDK o `signInWithPassword`).
4. Abre `http/ciclo-completo.http`, pega el token en `@authToken`
   (arriba del archivo), y confirma que `@baseUrl` apunta a tu
   servidor local (`http://localhost:3000/v1` por defecto).
5. Corre cada bloque con **Send Request** (aparece arriba de cada
   `###`), uno por uno, en el orden del archivo. Los `@periodoId`/
   `@periodoSiguienteId` se llenan solos con el `id` de la respuesta
   del bloque anterior — no hay que copiar UUIDs a mano.

**Qué esperar, paso por paso:** cada bloque del archivo trae un
comentario explicando qué debería devolver y por qué — incluidos dos
resultados que parecen errores pero no lo son: el paso 12
(`POST .../sobrante/decision`) da `409 SOBRANTE_YA_DECIDIDO` si el
déficit del paso 8 ya se arrastró solo al cerrar, y el paso 15
(`GET .../disponible` del periodo siguiente, antes de su primer
ingreso) da `estado: 'sin_ingreso'` aunque el arrastre ya esté en el
ledger — modelo-dominio.md §5 no muestra la cifra como cierta hasta
que hay un ingreso real de ese periodo. Más adelante, el paso 25
(`DELETE` sobre un gasto que el paso 22 ya eliminó) da `409
GASTO_YA_REVERTIDO` a propósito — es la prueba de que no se puede
corregir el mismo gasto dos veces.

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
- El objetivo de "hoy" es fijo dentro del propio día: gastar
  exactamente lo sugerido deja la cifra en 0 (no la redistribuye a otro
  número), un sobregiro grande el mismo día se ve como negativo
  completo (nunca como un residuo positivo que lo esconde), y revertir
  un gasto el mismo día regresa la cifra a su objetivo íntegro. La
  redistribución real —compensar lo gastado de más— solo ocurre al día
  siguiente, nunca a mitad del mismo día. Editar o eliminar un
  **ingreso** el mismo día nunca se confunde con un gasto (bug real,
  ver "Segundo hallazgo real" en Disponible) — solo la actividad cuyo
  tipo efectivo es `'gasto'` cuenta para `gastadoHoy`.
- Un periodo vencido se cierra solo, sin cron, la primera vez que algo
  lo consulta — y ese cierre genera un resumen inmutable que nadie
  puede alterar salvo la única transición permitida (decidir el
  sobrante, una vez). Un déficit se arrastra sin pedir permiso; un
  sobrante positivo se resuelve por decisión explícita o, en su
  ausencia, por el default de 7 días.
- El sobrante o déficit de un periodo cerrado nunca queda "en ningún
  lado": se drena a la cuenta `arrastre_pendiente` del tenant en el
  mismo instante de cerrar, y el periodo siguiente solo reclama lo que
  ya está decidido como `arrastrar` — nunca adelanta una decisión
  pendiente, y nunca cruza al periodo nuevo de otro tenant.
- Un periodo que hereda un arrastre y luego cierra con su propia
  actividad calcula su sobrante correctamente, incluyendo lo heredado
  (bug real, ver "Cierre") — el drenado siempre deja el periodo cerrado
  en exactamente 0, nunca con un residuo atorado para siempre.
- Un periodo en borrador transiciona a activo cuando le toca de verdad
  (su ventana contiene hoy), tanto al cerrarse perezosamente el que lo
  bloqueaba como al tocar el tenant después de un cierre manual — sin
  activar uno cuya ventana ya quedó completamente atrás.
- Los trece endpoints exponen el ciclo completo sobre HTTP real,
  con el mismo `authPlugin` y las mismas funciones de dominio ya
  probadas — no hay lógica nueva en las rutas. Validado de punta a
  punta contra el servidor real y un proyecto Supabase real (no solo
  con los tests), incluido el archivo `.http` versionado en el repo.
- Editar o eliminar un gasto o un ingreso nunca muta ni borra su fila,
  ni la del movimiento original (los triggers de inmutabilidad lo
  impiden sin excepción) — siempre generan una reversión, que aterriza
  en el periodo activo actual sin importar si el gasto/ingreso era de
  ese mismo periodo o de uno ya cerrado. Un periodo cerrado nunca
  vuelve a cambiar de saldo por esta vía (invariantes 5 y 15), y
  corregir el mismo gasto o ingreso dos veces se rechaza
  explícitamente. Un `ingresoId`/`gastoId` de otro tenant se rechaza
  como si no existiera (BOLA, probado explícitamente contra Postgres
  real para ambos).
- Listar ingresos o gastos de un periodo respeta el mismo aislamiento
  por tenant que el resto (un `periodoId` ajeno no distingue "no
  existe" de "no es tuyo"); la paginación de gastos por keyset no
  pierde ni repite filas si se inserta un gasto nuevo entre una página
  y la siguiente, y un cursor mal formado se rechaza explícitamente en
  vez de fallar en silencio.
- `revertido` marca correctamente una fila editada o eliminada
  (`true`) frente a una vigente (`false`), tanto en gastos como en
  ingresos, y al editar, la fila original queda `revertido: true`
  mientras la nueva corrección aparece `false` — probado
  explícitamente contra Postgres real.
- `listarPeriodos` respeta el mismo aislamiento por tenant que el
  resto (probado explícitamente contra Postgres real), incluye
  borradores, y ordena de forma determinista incluso cuando dos
  periodos comparten `fechaInicio` (desempate por `creadoEn`).
- `crearPeriodo` nunca acumula borradores redundantes (reutiliza el
  vigente) ni deja uno huérfano para siempre (lo reemplaza al llegar la
  quincena que le toca) — y el único hard delete del sistema se aborta,
  en vez de ejecutarse, si el borrador a borrar tuviera actividad
  financiera (ver "Higiene de borradores").
- Aportar a una meta reduce el disponible del periodo activo (y cuenta
  para `gastadoHoy`, igual que un gasto); retirar lo aumenta (igual que
  un ingreso) — ambos exigen un periodo activo, y una meta de otro
  tenant se rechaza como si no existiera (BOLA, probado explícitamente).
  `montoAcumulado`/`porcentajeAvance` siempre reflejan el saldo real de
  la cuenta de la meta, nunca un valor cacheado.
- Decidir "ahorrar" el sobrante reclama la cuenta puente hacia la meta
  de inmediato, en la misma transacción de la decisión — sin esperar a
  que exista un periodo siguiente, a diferencia de "arrastrar". Decidir
  dos veces el mismo sobrante (con cualquier combinación de
  ahorrar/arrastrar) se rechaza explícitamente.
- Un sobrante `'pendiente'` de un periodo cerrado siempre se puede
  encontrar (`GET /resumenes/pendiente`), incluso si ya existe un
  periodo siguiente activo — reproduce y corrige el reporte real de un
  usuario que creyó que su dinero había desaparecido. Con varios
  pendientes acumulados, siempre devuelve el más antiguo, y nunca
  cruza de un tenant a otro.
- Un tenant nuevo ya tiene las diez categorías predeterminadas sin
  llamar a ningún endpoint; una categoría personalizada respeta el
  límite (30) y el nombre único por tenant; y un `categoriaId` inválido
  o de otro tenant se rechaza explícitamente, tanto al registrar como
  al editar un gasto, en vez de dejar que la llave foránea falle con un
  error genérico.

## Higiene de borradores

Resuelve, en el origen (`crearPeriodo`), los dos huecos que quedaban
tras la promoción de borrador a activo (ver esa sección arriba):
duplicados sin control y borradores que quedan huérfanos para
siempre. Antes de crear una cuenta y una fila nuevas, `crearPeriodo`
busca si el tenant ya tiene un `'borrador'` y compara su ventana con
la que le tocaría a uno creado ahora mismo
(`calcularQuincenaDeCalendario` es determinista sobre la fecha real):

- **Representa la misma quincena → se reutiliza tal cual**, sin crear
  nada (idempotente, mismo criterio que `cerrarPeriodoManualmente` con
  un periodo ya cerrado). Es el caso normal: mientras el periodo activo
  que bloquea sigue vigente, cualquier borrador creado ese tiempo
  comparte su rango exacto (`crearPeriodo` no puede producir todavía
  una ventana futura genuina — ver "Promoción de borrador a activo").
  Sin esto, cada llamada repetida a `crearPeriodo` mientras el activo
  bloquea generaba una cuenta y una fila `'borrador'` nuevas, todas con
  el mismo rango, acumulándose sin límite.
- **Representa una quincena distinta → quedó huérfano y se elimina.**
  Un borrador y el activo que lo bloqueaba comparten siempre la misma
  `fechaFin` (ambos derivan de la misma fecha real de creación), así
  que cuando la ventana del borrador ya no coincide con "hoy", el
  activo que lo bloqueaba también venció — y como la promoción exige
  que la ventana del borrador contenga genuinamente hoy (no solo que
  ya haya empezado), no lo promovió. Este es el **único hard delete de
  todo el sistema**, justificado porque un borrador nunca puede tener
  actividad financiera real (invariante 10: un ingreso o gasto solo se
  registra contra un periodo `'activo'`) — borrar su fila y su cuenta
  no destruye ningún dato de negocio. Por seguridad, antes de borrar se
  comprueba que la cuenta del borrador no tenga ningún asiento; si
  llegara a tenerlo (no debería, pero la comprobación no es
  decorativa), la operación entera aborta con un error en vez de
  borrar datos financieros.

Las tres rutas están probadas contra Postgres real
(`test/integracion/periodos.test.ts`, describe `'higiene de
borradores'`): reutilización cuando sigue vigente, borrado y reemplazo
al llegar la siguiente quincena, y el aborto si el borrador tuviera
asientos (forzado a mano contra el ledger, ya que la API pública no
puede producir esa condición).

## Seguridad

Pase de hardening manual sobre todo el proyecto (backend + frontend),
no atado a un diff puntual. Se revisó y confirmó seguro, sin cambios
de código: RLS en las nueve tablas de dominio (comparado el schema de
Drizzle contra el SQL ya aplicado en `drizzle/*.sql` — coinciden);
verificación de JWT contra Supabase (`supabaseAdmin.auth.getUser`, no
un decode local); que ninguna ruta confía en un `tenantId` que venga
del cliente (todas usan `request.identidad.tenantId`); parametrización
real en `set_config` (`shared/db.ts`, sin interpolación de string);
roles Postgres `nosuperuser`/`nobypassrls` en `app_backend`
(`scripts/bootstrap-roles.sql`); el handler global de errores nunca
filtra stack traces ni errores de base de datos en un 500; el logger
de Fastify no registra headers ni body por default; CORS por whitelist
explícita (ver arriba); cero `dangerouslySetInnerHTML`/`eval` en el
frontend; solo la anon key de Supabase se usa en cliente, la
`service_role` nunca se expone; `.env` correctamente fuera de git.

**Corregido en esta pasada** (`npm audit --omit=dev`, dependencias de
producción):

- `fast-uri` (HIGH, vía `ajv`) — confusión de host en el parseo de
  URIs (IDN, IPv6, percent-decoding). Fijado con
  `overrides: { "fast-uri": "^4.1.4" }` en `package.json`, ya que
  `npm audit fix` falla en este proyecto con un bug interno del CLI de
  npm (`Cannot read properties of null (reading 'edgesOut')`) —
  workaround verificado, no hace falta reintentarlo.
- `fastify` <=5.12.0 (MODERATE) — bypass de validación de schema y
  spoofing de `X-Forwarded-*` bajo `trustProxy`. Corregido con el bump
  a `fastify@5.12.4`. Contexto real: ninguna ruta de este proyecto usa
  la opción `schema:` de Fastify ni activa `trustProxy`, así que
  ninguna de las dos rutas de explotación estaba disponible — se
  corrigió de todas formas porque el fix no rompe nada.

Después del bump: `npm run typecheck` limpio y `npm run test:local`
con la suite completa en verde contra Postgres real.

**Deliberadamente sin corregir** — dos hallazgos MODERATE, ambos solo
en `devDependencies` (nunca llegan a producción) y ambos con fix
disponible solo vía cambio breaking:

- `@vitest/mocker` (path traversal) — requiere subir Vitest 4 → 5.
- `esbuild` <=0.24.2, vía la cadena `@esbuild-kit` de `drizzle-kit` —
  requiere bajar a `drizzle-kit@0.18.1`.

Ambos solo son explotables con el servidor de desarrollo corriendo en
la máquina de un desarrollador, nunca en producción. Se dejan así a
propósito hasta que una migración de Vitest o Drizzle-kit por otra
razón absorba el fix sin costo extra.

## Qué falta

Toda la API de `docs/openapi.yaml` está cubierta (veintitrés
endpoints). Lo que sigue es explícitamente Fase 3 / fuera del MVP
(documento-maestro-v2.md, CLAUDE.md "Fuera de alcance del MVP"): plan
Business (multi-tenant completo, roles, aprobaciones), agregación
bancaria, multi-moneda avanzada, y el resto de funcionalidades de
reportes/exportación que §4.1 marca como "parcial" o fuera del núcleo.
