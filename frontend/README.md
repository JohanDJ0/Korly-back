# Frontend — Korly (walking skeleton)

**Punto 1 — setup + login:** Vite + React + TS + Tailwind + shadcn/ui
(componentes escritos a mano, ver "Nota sobre shadcn/ui" abajo) + cliente
de Supabase Auth + pantalla de login real, contra el backend real. Sin
registro público todavía — ver "Qué falta".

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
    supabase.ts   # cliente de Supabase — SOLO Auth (login, sesión)
    api.ts        # cliente HTTP hacia el backend propio, con el Bearer token adjunto
    utils.ts      # cn() de shadcn/ui
  stores/
    auth-store.ts # Zustand — la sesión de Supabase, sincronizada vía onAuthStateChange
  routes/
    Login.tsx
    Home.tsx          # placeholder del punto 1 — la pantalla real de "disponible" llega en el punto 2
    ProtectedRoute.tsx
  components/ui/  # primitivos de shadcn/ui
```

**El frontend nunca lee datos de negocio directo de Supabase.** Solo
Auth pasa por `lib/supabase.ts`; todo lo demás (periodos, ingresos,
gastos, disponible) viaja por `lib/api.ts` hacia el backend propio, que
es el único que toca Postgres. `ApiError` en `api.ts` espeja la forma
`{codigo, mensaje}` de `ErrorDominio` del backend (ver
`backend/src/shared/errores.ts`) — el mismo contrato de errores en
ambos lados.

**Sesión como estado de Zustand, no como contexto de React.** La
sesión de Supabase es estado global de cliente (`CLAUDE.md` ya reparte
"TanStack Query para servidor, Zustand para cliente"), y el propio SDK
de Supabase ya expone un patrón de suscripción
(`onAuthStateChange`) — `auth-store.ts` simplemente lo conecta a un
store de Zustand una sola vez al cargar el módulo, sin duplicar el
mecanismo con Context.

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
  backend acepta — `Home.tsx` llama a `GET /me` y muestra el
  `tenantId` resuelto, la misma prueba vertical que el punto 1 del
  backend, ahora desde el navegador.
- Sin sesión, cualquier ruta protegida redirige a `/login`
  (`ProtectedRoute.tsx`) — probado navegando directo a `/` sin haber
  iniciado sesión.
- Validación de formulario (Zod + React Hook Form) antes de tocar la
  red: campos vacíos o un correo mal formado se rechazan sin llamar a
  Supabase.

## Qué falta

- **Registro público.** Los usuarios de prueba se crean a mano en el
  dashboard de Supabase — construirlo es una pantalla más, no una
  decisión de arquitectura; se agrega cuando haga falta probar con
  gente real.
- **La pantalla real de "disponible"** (punto 2) — `Home.tsx` hoy es
  solo la prueba de que el login funciona.
- Captura de gasto, historial, cierre/resumen/decisión de sobrante —
  ver la propuesta completa de puntos discutida con el usuario.
- Pasada de diseño/branding — por ahora, paleta neutral por defecto de
  shadcn/ui, deliberadamente sin definir hasta tener las pantallas
  clave funcionando (decisión explícita, ver conversación).
