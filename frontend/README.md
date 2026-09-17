# Frontend — Korly (walking skeleton)

**Punto 1 — setup + login:** Vite + React + TS + Tailwind + shadcn/ui
(componentes escritos a mano, ver "Nota sobre shadcn/ui" abajo) + cliente
de Supabase Auth + pantalla de login real, contra el backend real. Sin
registro público todavía — ver "Qué falta".

**Punto 2 — pantalla de "disponible":** el aha moment del producto
(documento-maestro-v2.md §13.3) — sin periodo activo → botón para
crearlo; con periodo pero sin ingreso → formulario mínimo; con ingreso
→ la cifra real. Probado de punta a punta contra el backend real, con
un usuario nuevo (sin datos) para ejercer los tres estados.

**Punto 3 — captura de gasto:** el evento de mayor frecuencia del
sistema (modelo-dominio.md §4), en la misma pantalla — un botón
"Registrar gasto" despliega un formulario de un solo campo obligatorio
(monto), disponible con o sin ingreso registrado todavía (modelo-
dominio.md §5: "captura de gastos no se bloquea" en `sin_ingreso`). Se
colapsa solo tras registrar con éxito. Probado de punta a punta contra
el backend real, incluida la actualización inmediata de la cifra.

**Punto 4 — historial:** lista los ingresos y gastos del periodo
activo (`/historial`, enlazada desde "Disponible"). Editar/eliminar un
gasto desde ahí genera la reversión correspondiente (ver backend
README, "Editar y eliminar un gasto") — la fila original nunca cambia
ni desaparece, la corrección aparece como una fila nueva. Eliminar
pide confirmación nativa (`window.confirm`) antes de mandar el
request. Probado de punta a punta contra el backend real, incluida la
edición (fila nueva + original intacta) y la actualización de la
cifra de disponible.

**Hallazgo de UX, encontrado por el usuario probando el historial:**
una fila ya corregida (editada o eliminada) se veía idéntica a una
vigente y seguía invitando a Editar/Eliminar — un click ahí siempre
iba a fallar con `GASTO_YA_REVERTIDO`. Se agregó `revertido: boolean`
a `GET /periodos/:periodoId/gastos` (extensión sobre `openapi.yaml`,
mismo criterio que `NO_SOPORTADO`: el contrato no lo prohíbe, solo no
lo pedía todavía) y el frontend ahora muestra esas filas atenuadas y
tachadas, sin botones — "nunca hard delete" sigue siendo una garantía
de datos, no una obligación de que la pantalla invite a repetir una
acción que ya no aplica.

**Punto 5 — cierre, resumen y decisión de sobrante:** un botón "Cerrar
periodo" en "Disponible" (cierre manual — modelo-dominio.md §3 lo
describe como automático al pasar `fechaFin`, pero cerrar antes no
rompe ninguna invariante, y es como el propio backend se prueba desde
el punto 7) navega a `/resumen/:periodoId` con el resultado. Un
déficit ya viene auto-decidido (`arrastrado`, sin pedir nada — §3: "no
existe la opción 'ahorrar' para un déficit"); un sobrante positivo
`pendiente` muestra "Arrastrar al periodo siguiente" (real) y "Ahorrar"
(deshabilitado — `501 NO_SOPORTADO`, no existen las metas todavía).
"Crear periodo siguiente" desde ahí reclama el arrastre ya decidido en
la misma operación (`materializar-arrastre.ts`, backend).

Probado de punta a punta contra el backend real, dos ciclos completos:
un déficit (cierre → resumen auto-decidido → periodo siguiente ya
descontado) y un sobrante positivo (cierre → decidir arrastrar →
periodo siguiente con el sobrante ya sumado) — la aritmética de
`disponible` coincidió exactamente en ambos casos.

**Punto 6 — registro público (`/registro`):** `supabase.auth.signUp`
directo — no toca el backend en absoluto, la identidad se aprovisiona
sola en el primer request autenticado (`resolverOcrearIdentidad`,
backend, desde el punto 1). Maneja los dos casos reales de Supabase
Auth: si el proyecto no exige confirmar correo, `signUp` ya devuelve
sesión y entra directo; si la exige (el caso de este proyecto,
comprobado en vivo), muestra "revisa tu correo" en vez de asumir que
ya hay sesión. Probado de punta a punta: cuenta nueva → confirmación
(vía Admin API, sin acceso al correo real) → login → identidad
aprovisionada sola, con "Empecemos" para un tenant genuinamente nuevo.

**Punto 7 — rediseño del motor de flujo de caja + rango de fechas de
la quincena:** dos hallazgos reales del usuario probando la app.
(1) Al crear un periodo que no coincide con el inicio real de una
quincena de calendario (ADR-004), "9 días más" en vez de "15" es
correcto pero confuso sin contexto — `Home.tsx` ahora muestra "Quincena
del 1 de septiembre – 15 de septiembre" (`lib/fechas.ts`,
`usePeriodoActivo`) para que quede claro por qué. (2) El backend
cambió cómo calcula `cifraDiaria` — ver `backend/README.md`, "Rediseño
posterior" — y ahora expone `gastadoHoy`; `CifraDisponible.tsx` separa
el color de "hoy" del de "total" (pueden ser negativos por razones
distintas: excederse hoy con el total todavía en positivo, o al
revés) y muestra "Ya gastaste $X de tu objetivo de hoy de $Y" cuando
aplica. Probado de punta a punta reproduciendo el caso real reportado:
gastar exactamente lo sugerido da "$0.00" (no un número redistribuido),
y un sobregiro de $4,000 sobre un objetivo de $555.55 muestra "Te
excediste hoy por $4,000.00" en rojo, con el disponible total
($444.45) en negro por separado.

**Punto 8 — periodos anteriores:** `/historial/:periodoId` (parámetro
opcional) reusa exactamente los mismos endpoints y componentes que ya
existían — `GET /periodos/:id/{ingresos,gastos}` nunca estuvieron
atados al periodo activo, solo faltaba una forma de saber qué
`periodoId` existen. `GET /periodos` (extensión sobre `openapi.yaml`,
ver backend/README.md) resuelve eso: una sección "Periodos anteriores"
en el historial enlaza a cada uno (excluyendo el que se está viendo),
con un link directo a su resumen si ya cerró. `Resumen.tsx` no
necesitó ningún cambio — ya aceptaba cualquier `periodoId` por diseño
desde el punto 5. Probado de punta a punta contra el backend real
navegando a un periodo cerrado real y a su resumen.

**Punto 9 — editar y eliminar un ingreso:** `FilaIngreso.tsx`, espejo
exacto de `FilaGasto.tsx` (mismo mecanismo de reversión — ver backend
README, "Editar y eliminar un ingreso" — misma confirmación nativa
antes de eliminar, mismo atenuado + tachado para una fila ya
`revertido`). Resuelve la asimetría que quedaba en "Qué falta": el
backend nunca soportó corregir un ingreso ya capturado, así que
tampoco había nada que exponer aquí. Probado de punta a punta contra
el backend real: editar un ingreso deja la fila original tachada como
"Corregido" y la nueva con el monto correcto, y el disponible total se
actualiza de inmediato en ambos casos (edición y eliminación).

**Punto 10 — metas de ahorro:** pantalla nueva (`/metas`, enlazada
desde "Disponible") con `Metas.tsx` + `FormularioMeta.tsx` (crear,
React Hook Form + Zod, mismo patrón que `FormularioGasto.tsx`) +
`FilaMeta.tsx` (aportar/retirar inline, un `<select>` de modo en vez de
dos formularios separados — retirar además exige un motivo, requisito
del backend). `montoAcumulado`/`porcentajeAvance` de cada meta vienen
del backend ya calculados en vivo, nunca cacheados aquí tampoco.

El botón "Ahorrar" en `Resumen.tsx` (antes deshabilitado, "próximamente")
ahora despliega un selector nativo con las metas del tenant; confirmar
llama a `decidirSobrante` con el `metaId` elegido — el backend reclama
el sobrante de inmediato hacia esa meta, así que `['metas']` se
invalida junto con el resumen (ver `use-decidir-sobrante.ts`).

Probado de punta a punta contra el backend real: crear una meta,
aportar (confirmando que `gastadoHoy` en Disponible refleja el aporte,
igual que un gasto), retirar sin motivo (rechazado sin llegar a
mandarse) y con motivo (aumenta el disponible), cerrar un periodo y
decidir "ahorrar" — la meta recibe el sobrante de inmediato, visible
al volver a `/metas` sin haber creado ningún periodo nuevo.

**Punto 11 — aviso de sobrante pendiente:** resuelve un hueco de "Qué
falta" de la mano dura — reportado por un usuario real probando la
app. Cerró un periodo manualmente, creó el siguiente sin decidir qué
hacer con el sobrante del primero, y al no ver ningún aviso pensó que
el dinero simplemente había desaparecido (no era así: el resumen
seguía `'pendiente'`, recuperable desde "Periodos anteriores" — solo
que nada se lo recordaba). `use-resumen-pendiente.ts` consulta
`GET /resumenes/pendiente` (extensión sobre `openapi.yaml`, ver
backend/README.md) y `Home.tsx` muestra una tarjeta de aviso —
"Tienes un sobrante de $X sin decidir de un periodo anterior" con un
botón directo a su resumen — cada vez que exista uno. Se invalida
junto con `['resumen']` al cerrar un periodo y al decidir un sobrante,
para que aparezca y desaparezca sin que el usuario tenga que refrescar
nada.

Probado de punta a punta contra el backend real reproduciendo el
reporte exacto: cerrar un periodo, crear el siguiente sin decidir, ver
el aviso en Home con el monto correcto, seguir el link a su resumen,
decidir "arrastrar", y confirmar que el aviso desaparece de Home.

**Punto 12 — categorías:** `SelectorCategoria.tsx`, un combobox nativo
reutilizado en dos lugares — `FormularioGasto.tsx` (opcional, "Sin
categoría" por defecto, cero fricción para quien no quiere usarlo:
CLAUDE.md, "categorías opcionales, nunca obligatorias en la captura")
y `FilaGasto.tsx` (modo edición, precargado con la categoría actual —
ver más abajo por qué). Incluye "+ Nueva categoría…" como última
opción: crear una personalizada nunca manda al usuario a una pantalla
aparte, queda seleccionada de inmediato en el mismo selector al
confirmarla.

**Precargar la categoría actual al editar no es cosmético — evita una
pérdida de datos silenciosa.** El backend trata `categoriaId` igual
que `nota`: la fila se recrea entera en cada `PATCH`
(`gastos_inmutables`), así que omitir el campo no "conserva" la
categoría anterior, la deja sin categoría (ver backend/README.md,
"Categorías"). Sin precargar el selector con el valor actual, corregir
solo el monto de un gasto ya categorizado se lo habría quitado sin que
el usuario lo pidiera ni se diera cuenta.

Probado de punta a punta contra el backend real: un gasto sin
categoría (selector en "Sin categoría", cero toques extra); crear una
categoría nueva desde el formulario de captura y verla aparecer
seleccionada; el nombre de la categoría visible en el historial; y
editar el monto de un gasto ya categorizado sin tocar el selector —
confirmando que la categoría se conserva en la fila nueva en vez de
perderse.

**Punto 13 — recordatorios contextuales (alcance acotado con el
usuario a "solo aviso dentro de la app"):** documento-maestro-v2.md
§13.4 marca esto como "núcleo, no accesorio", pero pide email + web
push para el MVP web — ninguno de los dos existe en este proyecto
(sin proveedor de email, sin VAPID/service worker, sin ningún cron:
el backend es puro request/response). En vez de fingir soporte a
medias, se acotó el alcance explícitamente a un aviso in-app,
`RecordatorioContextual.tsx`, sin ningún endpoint nuevo — reutiliza
los mismos campos que `/disponible` ya expone.

**Solo dos de las cinco reglas obligatorias del documento aplican a un
aviso in-app; las otras tres son de cadencia de *envío*, sin sentido
sin un historial de notificaciones que todavía no existe** (frecuencia
decreciente ante ignorancia repetida, ventana adaptada al patrón del
usuario). Las que sí aplican y ya están implementadas:
- **Regla 1 (entrega valor por sí sola):** siempre trae la cifra
  accionable — días restantes, disponible, y el límite de hoy — nunca
  solo "te falta registrar".
- **Regla 2 (se silencia sola):** solo aparece si `gastadoHoy` es 0;
  en cuanto se registra un gasto hoy, desaparece sin que nadie la
  cierre a mano.

**Deliberadamente no duplica la alerta de ritmo (regla 4).** Cuando
`cifraDiaria` ya es negativa, `CifraDisponible.tsx` lo muestra como el
titular principal en rojo ("Te excediste hoy por $X") — agregar otra
tarjeta para el mismo hecho habría sido "regañar" dos veces por lo
mismo, contra el principio rector del propio documento ("informa, no
regaña"). `RecordatorioContextual` se oculta explícitamente en ese
caso.

Probado de punta a punta contra el backend real: con un periodo recién
creado y sin ningún gasto hoy, el aviso aparece con la cifra correcta;
al registrar un gasto, desaparece de inmediato sin recargar la página.

**Punto 14 — diseño y marca:** la paleta neutral quedó pospuesta a
propósito hasta tener las pantallas clave funcionando (ver "Qué falta"
de puntos anteriores) — ya las hay todas. El usuario aportó el logo
real de la marca (cuatro variantes SVG, en `public/logo/`: `full`/`icon`
con fondo claro, `full-dark`/`icon-dark` con fondo oscuro) y confirmó
la dirección de color propuesta (verde-azulado, tono fintech calmado)
al verla junto al logo. La paleta de `src/index.css` se reconstruyó
extrayendo los colores exactos del propio logo, no inventándolos
aparte:

- `--primary` = `#167f6c` (el teal del logo) — botones y enlaces
  principales en toda la app, sin tocar componente por componente:
  como `Button`/`Input`/`Link` ya usaban las clases semánticas de
  shadcn (`bg-primary`, `text-primary`, `ring-ring`), cambiar las
  variables en un solo archivo bastó para todo.
- `--secondary`/`--accent` = un tinte claro del mismo teal (`#eaf5f1`)
  con `#146155` (el verde oscuro del logo) como texto — reemplaza el
  gris neutro de hover/fondos secundarios sin introducir un color
  nuevo que no viniera del logo.
- `--brand-gold` (`#feb816`, el dorado del logo) — token nuevo,
  registrado en `@theme inline` junto a los semánticos de shadcn, para
  la tarjeta de "sobrante pendiente" en `Home.tsx` (antes
  `amber-500`/`amber-50` genéricos de Tailwind, sin relación con la
  marca).
- El aviso de `RecordatorioContextual.tsx` (antes `blue-500`/`blue-50`,
  un azul que no aparece en ningún lado de la marca) pasó a usar
  `border-primary/40 bg-primary/5` — el mismo teal, no un color
  aparte, ya que semánticamente es "información calmada", el mismo
  tono que ya transmite el primario.
- `--destructive` no cambió — el rojo de error es una convención
  universal, no una decisión de marca.

**Logo integrado en las pantallas de entrada, no en las de trabajo.**
`Login.tsx`, `Registro.tsx` y `Home.tsx` muestran el wordmark completo
(`full.svg`) reemplazando el texto plano "Korly"; `Historial.tsx`,
`Metas.tsx` y `Resumen.tsx` mantienen su título funcional sin logo —
decisión deliberada para no repetir la marca en pantallas de tarea
donde compite con la información accionable. El favicon (`favicon.svg`)
también se reemplazó — antes era el logo por defecto de Vite/React, sin
relación con Korly.

Verificado visualmente contra el servidor real en Login, Home (los
tres estados de disponible), Metas, Historial y Resumen — colores,
contraste y legibilidad correctos en cada uno; sin errores de consola
nuevos.

## 1. Variables de entorno

```bash
cp .env.example .env
```

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — el **mismo** proyecto
  de Supabase que usa el backend (`backend/.env`, `SUPABASE_URL`). La
  anon key (no la `service_role`) se obtiene en el dashboard de
  Supabase → Project Settings → API Keys → `anon public`. **Nunca** la
  `service_role` aquí — esa es solo del backend, nunca debe llegar al
  navegador.
- `VITE_API_BASE_URL` — la URL del backend, incluyendo `/v1`
  (`http://localhost:3000/v1` para desarrollo local).

**El backend necesita saber de este origen.** `backend/.env` debe
tener `CORS_ORIGIN` incluyendo el puerto de este dev server
(`http://localhost:5173` ya es el valor por defecto si se omite la
variable — ver `backend/README.md`, sección "CORS"). Sin esto, el
navegador bloquea todo request real con un preflight `OPTIONS`
fallido — se ve en los logs del backend como `"Route OPTIONS:/v1/...
not found"`.

## 2. Instalar y correr

```bash
npm install
npm run dev
```

Con el backend corriendo (`npm run dev` en `backend/`, ver su README) y
un usuario de prueba ya creado en el dashboard de Supabase (mismo que
usa `backend/http/ciclo-completo.http`), inicia sesión con ese
email/password.

## Arquitectura

```
src/
  lib/
    supabase.ts     # cliente de Supabase — SOLO Auth (login, sesión)
    api.ts          # cliente HTTP hacia el backend propio, con el Bearer token adjunto
    query-client.ts # instancia única de QueryClient — compartida con auth-store.ts
    dinero.ts       # formatearMonto() — único lugar que convierte centavos a texto
    fechas.ts       # formatearRangoFechas() — formatea en UTC a propósito, ver el comentario ahí
    utils.ts        # cn() de shadcn/ui
  stores/
    auth-store.ts # Zustand — la sesión de Supabase, sincronizada vía onAuthStateChange
  hooks/
    use-disponible.ts, use-periodo-activo.ts, use-crear-periodo.ts,
    use-ingresos.ts, use-gastos.ts (paginado, useInfiniteQuery),
    use-registrar-ingreso.ts, use-registrar-gasto.ts,
    use-editar-gasto.ts, use-eliminar-gasto.ts,
    use-cerrar-periodo.ts, use-resumen.ts, use-decidir-sobrante.ts,
    use-periodos.ts  # un hook de TanStack Query por endpoint
  routes/
    Login.tsx
    Registro.tsx      # registro público (punto 6)
    Home.tsx          # "disponible" (punto 2) + captura de gasto (punto 3) + cerrar periodo (punto 5)
    Historial.tsx     # ingresos/gastos de cualquier periodo (punto 4, extendido en el punto 8) + "Periodos anteriores"
    Resumen.tsx       # resumen + decisión de sobrante (punto 5)
    ProtectedRoute.tsx
  components/
    CifraDisponible.tsx, FormularioIngreso.tsx, FormularioGasto.tsx, FilaGasto.tsx
    ui/  # primitivos de shadcn/ui
```

**El frontend nunca lee datos de negocio directo de Supabase.** Solo
Auth pasa por `lib/supabase.ts`; todo lo demás (periodos, ingresos,
gastos, disponible) viaja por `lib/api.ts` hacia el backend propio, que
es el único que toca Postgres. `ApiError` en `api.ts` espeja la forma
`{codigo, mensaje}` de `ErrorDominio` del backend (ver
`backend/src/shared/errores.ts`) — el mismo contrato de errores en
ambos lados.

**Hallazgo real, encontrado por el usuario probando "Eliminar" en el
historial:** `apiFetch` mandaba `Content-Type: application/json` en
TODA request, incluidas las que no llevan body (`DELETE`) — Fastify
rechaza eso (`FST_ERR_CTP_EMPTY_JSON_BODY`, "Body cannot be empty when
content-type is set to..."), el mismo hallazgo que ya se había
documentado del lado del backend (ver `backend/README.md`, "Capa
HTTP") pero que no se había aplicado aquí, en el cliente. Se corrigió
poniendo el header solo cuando `init.body` existe. De paso apareció un
segundo bug, más sutil: el error de un `Eliminar` fallido se quedaba
visible en la fila aunque el usuario después editara con éxito — el
estado de error de una mutation de TanStack Query no se limpia solo
hasta que esa misma mutation se vuelve a invocar. `FilaGasto.tsx` ahora
llama `.reset()` en la mutation contraria al cambiar de modo (editar
↔ ver ↔ eliminar), para que un error de una acción nunca sobreviva a
una acción distinta que sí funcionó.

**Sesión como estado de Zustand, no como contexto de React.** La
sesión de Supabase es estado global de cliente (`CLAUDE.md` ya reparte
"TanStack Query para servidor, Zustand para cliente"), y el propio SDK
de Supabase ya expone un patrón de suscripción
(`onAuthStateChange`) — `auth-store.ts` simplemente lo conecta a un
store de Zustand una sola vez al cargar el módulo, sin duplicar el
mecanismo con Context.

**Hallazgo real, encontrado probando el cambio de usuario en el
navegador (no hipotético):** la caché de TanStack Query vive por
`queryKey`, no por usuario — `['disponible']` es la misma key sin
importar quién esté logueado. Cerrar sesión e iniciar con OTRA cuenta
dejaba la cifra del usuario anterior en caché, y se alcanzaba a
renderizar mezclada con el estado del usuario nuevo (p. ej. "Empecemos"
y la cifra vieja al mismo tiempo) hasta que el primer refetch
completaba. `auth-store.ts` ahora vacía toda la caché
(`queryClient.clear()`) cada vez que el `id` del usuario autenticado
cambia — más simple y más seguro que invalidar selectivamente, porque
cualquier query nueva que se agregue después queda cubierta
automáticamente. `query-client.ts` existe como módulo aparte
precisamente para que `auth-store.ts` (que no es un componente React)
pueda importar la misma instancia que usa el `Provider` en `App.tsx`.

## Nota sobre shadcn/ui: componentes escritos a mano

El CLI de `shadcn` (`npx shadcn@latest init`) resolvió mal el alias
`@/` en este entorno (Windows + Git Bash): en vez de escribir en
`src/components/ui/`, creó una carpeta literal `./@/components/ui/` en
la raíz del proyecto. `npx shadcn@latest add <componente>` reprodujo el
mismo problema. Los componentes base (`button`, `input`, `label`,
`card`) están escritos a mano en `src/components/ui/`, con el mismo
código fuente que generaría el CLI (Tailwind v4 vía `@theme inline`
en `src/index.css`) — el resultado es idéntico, solo cambió cómo llegó
ahí. Las variables CSS de esa base sí cambiaron desde entonces: en el
scaffold inicial era la paleta `neutral` por defecto; ver "Diseño y
marca" más abajo para la paleta real que la reemplazó. Si el CLI se
vuelve a intentar más adelante y falla igual, agregar componentes
nuevos a mano siguiendo el mismo patrón es la vía confiable en este
entorno.

## Qué valida este punto

- Un login real (`supabase.auth.signInWithPassword`) contra el
  proyecto Supabase real produce una sesión cuyo `access_token` el
  backend acepta — probado en el punto 1 contra `GET /me`, la misma
  prueba vertical que el punto 1 del backend, ahora desde el navegador
  (`Home.tsx` ya es la pantalla real de disponible, no ese placeholder).
- Sin sesión, cualquier ruta protegida redirige a `/login`
  (`ProtectedRoute.tsx`) — probado navegando directo a `/` sin haber
  iniciado sesión.
- Validación de formulario (Zod + React Hook Form) antes de tocar la
  red: campos vacíos o un correo mal formado se rechazan sin llamar a
  Supabase.
- Los tres estados de la pantalla de "disponible" — sin periodo activo,
  con periodo pero sin ingreso, y con la cifra real, incluido un caso
  de sobregiro real (negativo, sin suavizar, en rojo) — probados contra
  el backend real, con un usuario nuevo para los dos primeros estados
  (evita depender de datos ya sembrados por pruebas anteriores).
- Cambiar de usuario (cerrar sesión + iniciar con otra cuenta) nunca
  deja datos del usuario anterior visibles, ni mezclados con los del
  nuevo — ver el hallazgo de `queryClient.clear()` arriba.
- Registrar un gasto actualiza la cifra de inmediato (invalidación de
  `['disponible']`) y el formulario se colapsa solo — probado con un
  gasto real contra un periodo con sobregiro, confirmando que el
  disponible total y la cifra diaria bajan exactamente lo esperado.
- Editar un gasto desde el historial deja la fila original intacta y
  agrega una nueva con el monto corregido — probado contra el backend
  real, confirmando que ninguna fila se sobrescribe (ver backend
  README, "Editar y eliminar un gasto") — y que el disponible total
  refleja el neto de la corrección.
- Eliminar un gasto pide confirmación nativa antes de mandar el
  request — probado cancelando el diálogo: sin confirmar, no se manda
  ningún `DELETE` y la lista no cambia. Confirmando el diálogo (probado
  sobreescribiendo `window.confirm` para la prueba), el `DELETE` real
  funciona y no manda `Content-Type` sin body — ver el hallazgo arriba.
- Intentar corregir el mismo gasto dos veces muestra
  `GASTO_YA_REVERTIDO` con su mensaje real del backend, y ese error
  desaparece de la fila al entrar a modo edición o al cancelar — no se
  queda "pegado" tras una acción distinta que sí funcionó.
- Ciclo de cierre completo probado dos veces contra el backend real:
  un déficit (auto-decidido, sin pedir nada) y un sobrante positivo
  (decidido explícitamente como "arrastrar") — en ambos casos, el
  periodo siguiente nace con el monto ya reflejado en su disponible,
  con la aritmética exacta.
- Registro público probado de punta a punta con una cuenta real: el
  proyecto exige confirmar correo (comprobado en vivo, no asumido) y
  la pantalla lo maneja sin intentar entrar sin sesión; tras confirmar
  y entrar, el backend aprovisiona la identidad sola, sin ningún
  cambio de código ahí — mismo mecanismo que ya prueba el punto 1.
- El rango de fechas de la quincena se muestra correctamente en UTC
  (`1 de septiembre – 15 de septiembre`) — sin forzar la zona horaria,
  el navegador en México (UTC-6) lo habría corrido un día hacia atrás.
- Reproducido el caso real reportado por el usuario: gastar
  exactamente el objetivo sugerido de hoy da "$0.00" (nunca un número
  redistribuido); un sobregiro de $4,000 sobre un objetivo de $555.55
  muestra "Te excediste hoy por $4,000.00" en rojo mientras el
  disponible total ($444.45, todavía positivo) se muestra en negro por
  separado — las dos cifras se colorean por su propio signo, nunca por
  el signo de la otra.
- Navegar a `/historial/:periodoId` de un periodo cerrado real muestra
  sus propios ingresos/gastos (no los del periodo activo), su estado
  ("cerrado") junto al rango de fechas, y un link a "ver periodo
  activo"; "Periodos anteriores" excluye correctamente el periodo que
  se está viendo. `/resumen/:periodoId` no necesitó ningún cambio para
  funcionar con un periodo pasado — ya estaba diseñado así.
- Editar un ingreso desde el historial deja la fila original tachada
  como "Corregido" y agrega una nueva con el monto corregido — probado
  contra el backend real, confirmando que el disponible total refleja
  el neto de la corrección. Eliminar un ingreso se probó directamente
  contra `DELETE /v1/ingresos/:id` del servidor real (el diálogo nativo
  de confirmación se auto-cancela en el navegador automatizado usado
  para probar, igual que ya pasaba con gastos): la fila queda
  `revertido: true` sin desaparecer, y el disponible total baja
  exactamente el monto eliminado.
- Crear una meta, aportar y retirar funcionan de punta a punta contra
  el backend real: aportar baja el disponible Y `gastadoHoy` (como un
  gasto); retirar sin motivo no manda ningún request (validado en el
  cliente antes de llegar al backend); `montoAcumulado`/`porcentajeAvance`
  se actualizan de inmediato tras cada operación. Decidir "ahorrar" un
  sobrante hacia una meta elegida la actualiza sin crear ningún periodo
  nuevo — probado navegando a `/metas` justo después de confirmar.
- El aviso de sobrante pendiente en Home aparece con el monto correcto
  cuando existe uno, sin importar que ya haya un periodo activo más
  reciente (reproduce el reporte real de un usuario), y desaparece de
  inmediato al decidirlo desde su resumen — probado de punta a punta
  contra el backend real, el mismo escenario exacto que se reportó.
- Categorizar un gasto es opcional de verdad (registrar sin tocar el
  selector funciona igual que antes de este punto); crear una
  categoría nueva desde la captura queda seleccionada de inmediato; y
  editar el monto de un gasto ya categorizado sin tocar el selector
  conserva su categoría en la fila nueva, en vez de perderla — probado
  de punta a punta contra el backend real.
- El recordatorio contextual aparece con la cifra correcta cuando no
  hay actividad hoy, se silencia solo en cuanto se registra un gasto
  (sin recargar), y nunca se muestra junto con el titular de "te
  excediste hoy" — probado de punta a punta contra el backend real.
- La paleta de marca (extraída del logo real, no inventada) se aplica
  consistentemente en toda la app con un solo cambio en
  `src/index.css` — botones, enlaces, focos de formulario, y las
  tarjetas de aviso (sobrante pendiente en dorado, recordatorio en
  teal) — verificado visualmente contra el servidor real en las
  pantallas principales, sin regresiones de contraste ni legibilidad.

## Recuperación de contraseña

Hallazgo real: la configuración por defecto de Supabase ("Site URL")
mandaba el link de "olvidé mi contraseña" al puerto del **backend**
(3000, sin páginas) en vez del frontend (5173) — un 404, sin ninguna
pantalla que además supiera qué hacer con el token de recuperación
aunque hubiera llegado al lugar correcto.

**`routes/OlvidePassword.tsx`**: pide el correo y llama a
`supabase.auth.resetPasswordForEmail(email, { redirectTo:
window.location.origin })` — el `redirectTo` explícito es la
corrección robusta: apunta siempre a donde de verdad corre el
frontend (5173 en desarrollo, el dominio real una vez desplegado), sin
depender de que la configuración del dashboard de Supabase esté bien
puesta. Esa URL igual necesita estar en la lista de "Redirect URLs"
del proyecto de Supabase, o Supabase la rechaza.

**`routes/RestablecerPassword.tsx`** + `stores/auth-store.ts`
(`esRecuperacion`): el SDK de Supabase detecta el token del link en el
hash de la URL solo (`detectSessionInUrl`, default de la librería) y
dispara el evento `PASSWORD_RECOVERY` — sin nada más, esa sesión
temporal habría dejado pasar directo a Home. `ProtectedRoute` intercepta
ese caso (`esRecuperacion === true`) y muestra el formulario de
contraseña nueva en su lugar, sin importar en qué ruta haya caído el
redirect (siempre es la raíz `/`, dentro de la zona protegida).
`supabase.auth.updateUser({ password })` no pide la contraseña
anterior porque la sesión de recuperación ya autentica al usuario.

Verificado en vivo de punta a punta contra la cuenta real:
`/olvide-password` con el correo real → el correo llegó con el link
apuntando al frontend correcto (ya no al 404 del puerto del backend) →
al abrirlo, `ProtectedRoute` interceptó la sesión de recuperación y
mostró `RestablecerPassword` → contraseña nueva guardada
(`updateUser`) → login exitoso con la contraseña nueva. El flujo
completo, no solo cada paso por separado.

## Ajustes

`routes/Ajustes.tsx` — la primera pantalla de preferencias de cuenta,
hoy con un solo ajuste: apagar los recordatorios por correo (ver
backend/README.md, "Recordatorios por correo"). `GET`/`PATCH
/preferencias`. Verificado en vivo contra la cuenta real: apagar y
volver a prender persiste contra la base real, no solo en el estado
local del checkbox.

## Confirmaciones (`BotonConfirmar.tsx`)

**Hallazgo real del usuario:** el botón "Eliminar" de una meta "no
hacía nada". El código estaba bien — el problema era `window.confirm`,
el diálogo nativo del navegador que las 6 confirmaciones destructivas
usaban (5 "Eliminar" + "Cerrar periodo" en `Home.tsx`). Algunas
extensiones/entornos suprimen ese diálogo sin avisar, y
`if (!window.confirm(...)) return` trata ese silencio exactamente
igual que un "Cancelar" real — no hay forma de distinguir "el usuario
canceló a propósito" de "el diálogo nunca llegó a mostrarse". Al
reproducirlo en vivo contra la cuenta real (bypasseando `confirm` a
mano), el borrado sí funcionaba — confirmando que el bug estaba en el
diálogo, no en la lógica.

`BotonConfirmar` reemplaza las 6 llamadas a `window.confirm` con una
confirmación inline en la propia UI (clic → aparece "¿Seguro? Sí,
confirmar / Cancelar" en el lugar del botón → confirmar dispara la
acción) — al ser puro estado de React, no depende de ninguna API del
navegador, así que no puede fallar de esa forma. Layout de la
confirmación inline todavía básico (se ve apretado en pantallas
angostas) — pendiente del pase de diseño.

## Qué falta

- Recordatorios contextuales por **web push** y la **alerta de ritmo**
  (documento-maestro-v2.md §13.4, regla 4: "vas gastando más rápido de
  lo sostenible") — el aviso in-app (punto 13) y el recordatorio diario
  por **email** ya están resueltos (ver backend/README.md). Falta VAPID
  + service worker para push, y la lógica de la alerta de ritmo (un
  disparador distinto: comportamiento, no inactividad).
