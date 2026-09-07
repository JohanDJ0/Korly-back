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

**`categoriaId` en `PATCH` responde `NO_SOPORTADO` (501)**, mismo
criterio que en cierre: el campo es válido según el contrato, no está
implementado. **`monto` se exige siempre en `PATCH`**, aunque
`openapi.yaml` lo marca opcional — como `movimientos` también es
inmutable, hasta "solo corregir la nota" exige el mismo reverso +
asiento nuevo que corregir el monto; no hay un camino más barato para
un cambio parcial.

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

**`'ahorrar'` declarado pero rechazado, a propósito.** El tipo
`DecisionSobranteEntrada` incluye `'ahorrar'` (coincide con
`openapi.yaml`), pero `decidirSobrante` lanza
`ErrorDominio('NO_SOPORTADO', ...)` si se elige — el módulo de Metas no
existe todavía. Mismo patrón que `crearPeriodo` con tipos de periodo
no-quincenales: la firma pública ya tiene la forma correcta, activarlo
de verdad no debería requerir cambiarla.

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
eliminar gasto desde el navegador aunque el preflight respondiera 204.

## Capa HTTP

```
src/shared/http.ts                     # registrarManejadorErroresDominio, montoADto/montoDesdeDto
src/modulos/periodos/rutas.ts          # POST /periodos, GET /periodos/activo
src/modulos/ingresos/rutas.ts          # POST/GET /periodos/:periodoId/ingresos
src/modulos/gastos/rutas.ts            # POST/GET /periodos/:periodoId/gastos, PATCH/DELETE /gastos/:gastoId
src/modulos/disponible/rutas.ts        # GET /periodos/activo/disponible
src/modulos/cierre/rutas.ts            # POST .../cerrar, GET .../resumen, POST .../sobrante/decision
```

Doce endpoints para ejercer el ciclo central, corregir un gasto y ver
de vuelta lo que se capturó — no la API completa de
`docs/openapi.yaml` (sin metas, sin categorías). Todos viven bajo `/v1`
y detrás del mismo `authPlugin` que ya protege `/v1/me` desde el punto
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
`PERIODO_NO_ACTIVO`→409, `SOBRANTE_YA_DECIDIDO`→409,
`SIN_PERIODO_ACTIVO`→409, `GASTO_YA_REVERTIDO`→409, `VALIDACION`→400,
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
apareciendo en la lista aunque ya estén corregidos (pasos 18-25). El
archivo se sigue extendiendo así, en el mismo orden en que se van
agregando módulos — no hace falta un archivo nuevo por cada punto.

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
- Un periodo en borrador transiciona a activo cuando le toca de verdad
  (su ventana contiene hoy), tanto al cerrarse perezosamente el que lo
  bloqueaba como al tocar el tenant después de un cierre manual — sin
  activar uno cuya ventana ya quedó completamente atrás.
- Los doce endpoints exponen el ciclo completo sobre HTTP real,
  con el mismo `authPlugin` y las mismas funciones de dominio ya
  probadas — no hay lógica nueva en las rutas. Validado de punta a
  punta contra el servidor real y un proyecto Supabase real (no solo
  con los tests), incluido el archivo `.http` versionado en el repo.
- Editar o eliminar un gasto nunca muta ni borra su fila, ni la del
  movimiento original (los triggers de inmutabilidad lo impiden sin
  excepción) — siempre generan una reversión, que aterriza en el
  periodo activo actual sin importar si el gasto era de ese mismo
  periodo o de uno ya cerrado. Un periodo cerrado nunca vuelve a
  cambiar de saldo por esta vía (invariantes 5 y 15), y corregir el
  mismo gasto dos veces se rechaza explícitamente.
- Listar ingresos o gastos de un periodo respeta el mismo aislamiento
  por tenant que el resto (un `periodoId` ajeno no distingue "no
  existe" de "no es tuyo"); la paginación de gastos por keyset no
  pierde ni repite filas si se inserta un gasto nuevo entre una página
  y la siguiente, y un cursor mal formado se rechaza explícitamente en
  vez de fallar en silencio.
- `revertido` marca correctamente una fila editada o eliminada
  (`true`) frente a una vigente (`false`), y al editar, la fila
  original queda `revertido: true` mientras la nueva corrección
  aparece `false` — probado explícitamente contra Postgres real.

## Qué falta

### Higiene de borradores, pendiente

Dos huecos de la misma familia (acumulación sin limpieza), agrupados
a propósito para decidirlos juntos:

- **Borradores huérfanos.** Un borrador cuya ventana completa ya pasó
  sin haber sido promovido (ver "Promoción de borrador a activo")
  queda así para siempre — nada lo limpia ni lo marca de otra forma.
  No es peor que antes de este punto (donde ningún borrador se
  promovía nunca), pero tampoco se resolvió.
- **Sin prevención de duplicados en el origen.** `crearPeriodo` puede
  seguir generando varios `'borrador'` para el mismo tenant (no hay
  restricción única sobre ese estado, a diferencia de `'activo'`); la
  promoción elige uno de forma determinista, pero no evita que se sigan
  acumulando. Resolverlo en el origen (¿rechazar? ¿devolver el
  borrador existente?) es una decisión de diseño aparte de "cómo
  promuevo el que ya existe".

### Después de eso

Editar/eliminar un **ingreso** (openapi.yaml no define ese endpoint
todavía — solo gastos lo tienen), metas de ahorro (para activar
`'ahorrar'` en la decisión de sobrante — hoy `NO_SOPORTADO` — y para
que `reclamarArrastresTx` sepa qué hacer con un arrastre decidido como
`'ahorrado'`), y el resto de la API de `docs/openapi.yaml` que los doce
endpoints actuales no cubren (categorías, y la propia entidad de
categorías).
