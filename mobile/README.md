# Korly para Android (Expo)

App nativa de Korly para Android, hecha con Expo (SDK 57) y Expo Router. Va en el SDK 57, no en el 58 (el más nuevo), porque Expo Go de Google Play todavía no soporta el 58 (2026-10-16); se sube cuando Play Store lo libere. Es solo frontend: habla con la **misma API ya
desplegada** (`https://api.korly.com.mx/v1`) y con el **mismo Supabase Auth** que la web. No tiene base de datos propia.

> Estado: **spike** (prueba de concepto). Tiene iniciar sesión (con captcha), la cifra del día y registrar un gasto
> (con los atajos). Crear la quincena, el ingreso, el historial, etc. se siguen haciendo en la web por ahora.

## Probarla en tu celular (Expo Go)

1. Instala **Expo Go** desde Google Play.
2. Crea `mobile/.env` a partir de `.env.example` (los mismos valores públicos que `frontend/.env`).
3. Con el celular y la computadora en la misma red Wi-Fi:

   ```bash
   cd mobile
   npx expo start
   ```

4. Escanea el código QR con Expo Go. Si Windows pregunta si deja a Node usar la red, acepta en "redes privadas".
   Si no conecta (red de la oficina, firewall), usa `npx expo start --tunnel`.

**Ojo:** la app usa la API y las cuentas de **producción**. Un gasto que registres desde aquí es real (se puede borrar
desde la web, en Historial).

## Cómo está armada

| Archivo | Qué hace |
|---|---|
| `src/app/_layout.tsx` | Proveedores (sesión, TanStack Query) y la navegación: con sesión solo existe Inicio; sin sesión, Iniciar sesión. |
| `src/app/login.tsx` | Correo + contraseña a Supabase con el token del captcha; errores en español. |
| `src/app/index.tsx` | Inicio: aviso de privacidad pendiente, cifra del día y registrar gasto. |
| `src/components/CaptchaTurnstile.tsx` | Turnstile dentro de un WebView (ver abajo). |
| `src/lib/api.ts` | Cliente de la API: mismo contrato que `frontend/src/lib/api.ts`. |
| `src/lib/supabase.ts` | Cliente de Supabase solo para Auth; la sesión se guarda en el teléfono (expo-sqlite). |
| `src/hooks/datos.ts` | Consultas y mutaciones con los mismos tipos y `queryKey` que los hooks de la web. |

### Captcha (Cloudflare Turnstile)

Turnstile solo funciona en páginas web, así que se dibuja en un **WebView** (una "ventanita de navegador" dentro de la
app) con una página mínima que carga el widget y le pasa el token a la app con `postMessage`. La app lo manda a Supabase
(`options.captchaToken`), igual que la web; el backend propio no interviene.

La página se carga con `baseUrl: https://app.korly.com.mx`, que ya es un dominio permitido del widget: no hay que tocar
Cloudflare. Si en un teléfono real Cloudflare no lo acepta, el plan B es servir esa página desde la web
(`app.korly.com.mx/captcha-movil`) y cargarla por URL, que es lo que documenta Cloudflare para apps móviles.

### Código copiado de la web (temporal)

`lib/errores-auth.ts`, `lib/dinero.ts`, `lib/fechas.ts`, `lib/aviso.ts` y los tipos de `hooks/datos.ts` son copias de
`frontend/src`. **Las versiones del aviso (`lib/aviso.ts`) deben coincidir con `frontend/src/lib/datos-responsable.ts`.**
En la fase 3 pasan a un paquete compartido entre la web y la app para no mantener dos copias.

## Comandos

```bash
npx expo install <paquete>   # SIEMPRE en vez de npm install <paquete>: elige la versión compatible con el SDK
npm run typecheck            # revisión de tipos
npx expo-doctor              # revisa dependencias y configuración
```

## Plan

1. **Spike** (este): login con captcha, cifra del día, registrar gasto. Probarlo en un Android real.
2. **Notificaciones nativas**: build de desarrollo con EAS (las notificaciones no funcionan en Expo Go), proyecto de
   Firebase, tabla de tokens y endpoint en el backend, y el cron de recordatorios mandando el aviso a la app.
3. **Paquete compartido** con la web (cliente de la API, tipos, dinero, fechas, aviso).
4. **Pantallas completas**: quincena e ingreso, historial, metas, recurrentes, tarjetas, resumen, ajustes, registro.
5. **Pruebas y Google Play**: APK para probadores, luego la ficha de la tienda.
