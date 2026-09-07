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
    use-cerrar-periodo.ts, use-resumen.ts, use-decidir-sobrante.ts  # un hook de TanStack Query por endpoint
  routes/
    Login.tsx
    Registro.tsx      # registro público (punto 6)
    Home.tsx          # "disponible" (punto 2) + captura de gasto (punto 3) + cerrar periodo (punto 5)
    Historial.tsx     # ingresos/gastos del periodo activo (punto 4)
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
código fuente y las mismas variables CSS (`src/index.css`, paleta
`neutral`, Tailwind v4 vía `@theme inline`) que generaría el CLI — el
resultado es idéntico, solo cambió cómo llegó ahí. Si el CLI se vuelve
a intentar más adelante y falla igual, agregar componentes nuevos a
mano siguiendo el mismo patrón es la vía confiable en este entorno.

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

## Qué falta

- El historial solo muestra el periodo **activo** — no hay pantalla
  para ver periodos ya cerrados, incluido su resumen histórico (el
  backend sí lo soporta; `/resumen/:periodoId` solo se llega a través
  del botón "Cerrar periodo" o pegando la URL a mano).
- Si un periodo cierra de forma perezosa (pasó su `fechaFin` sin que
  nadie lo cerrara a mano) en vez de vía el botón, el usuario nunca ve
  su resumen — `Home.tsx` solo navega a `/resumen` cuando ÉL disparó el
  cierre. El backend sigue decidiendo todo correctamente (déficit
  auto-arrastrado, sobrante con el default de 7 días), pero la pantalla
  de resumen de ESE periodo específico no aparece sola. Requeriría que
  el backend exponga de algún modo "hay un resumen reciente sin ver"
  — no existe ese endpoint todavía.
- Editar/eliminar un **ingreso** — el backend tampoco lo soporta
  todavía (openapi.yaml no define ese endpoint, solo gastos lo tienen).
- Pasada de diseño/branding — por ahora, paleta neutral por defecto de
  shadcn/ui, deliberadamente sin definir hasta tener las pantallas
  clave funcionando (decisión explícita, ver conversación).
