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

**Sin materializar el arrastre — próximo paso explícito, no un "algún
día".** `decisionSobrante='arrastrado'` registra la decisión; el
dinero no se mueve todavía a ninguna cuenta. El ciclo declarado
termina en "...cerrar periodo → decidir sobrante", no en "crear el
periodo siguiente y confirmar que heredó el arrastre". Moverlo de
verdad sin violar la invariante 5 ("un periodo cerrado no cambia de
saldo nunca") requiere una **cuenta puente por tenant** que reciba el
arrastre al cerrar y lo entregue al periodo siguiente cuando se cree —
pieza de arquitectura nueva, deliberadamente no diseñada todavía.
**La siguiente entrega después de este punto es exactamente esa
conexión, no otra parte del skeleton.**

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

## Qué falta

**Próximo paso inmediato (comprometido explícitamente, no un "algún
día"): conectar cierre con la creación del siguiente periodo.**
Diseñar e implementar la cuenta puente que materializa el arrastre
(ver "Cierre" arriba) — antes de avanzar a cualquier otra parte del
skeleton.

Después de eso: ingresos/gastos retroactivos y edición sobre periodo
cerrado (requiere el mecanismo de reversión de ADR-001, todavía sin
tocar), metas de ahorro (para activar `'ahorrar'` en la decisión de
sobrante), y finalmente la capa HTTP que expone todo esto como la API
de openapi.yaml — ningún módulo tiene endpoints todavía.
