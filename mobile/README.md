# Korly para Android (Expo)

App nativa de Korly para Android, hecha con Expo (SDK 57) y Expo Router. Va en el SDK 57, no en el 58 (el más nuevo),
porque Expo Go de Google Play todavía no soporta el 58 (2026-10-16); se sube cuando Play Store lo libere. Es solo
frontend: habla con la **misma API ya desplegada** (`https://api.korly.com.mx/v1`) y con el **mismo Supabase Auth** que
la web. No tiene base de datos propia.

## Qué tiene

Las mismas pantallas, textos y reglas que la web (`frontend/src`), adaptadas al teléfono:

| Pantalla | Archivo | Equivale en la web |
|---|---|---|
| Iniciar sesión, registro, olvidé mi contraseña (con captcha) | `src/app/login.tsx`, `registro.tsx`, `olvide-password.tsx` | `routes/Login`, `Registro`, `OlvidePassword` |
| Guía de primeros pasos (cuentas nuevas, y "Ver la guía otra vez" en Más) | `src/components/PasoDeGuia.tsx`, `hooks/use-guia.ts`, `lib/guia.ts` | `components/PasoDeGuia`, `hooks/use-guia` |
| Aceptar de nuevo el aviso (si cambió la versión) | `src/components/ReaceptarAviso.tsx` | `components/ReaceptarAviso` |
| Inicio: cifra del día, avisos, registrar gasto/ingreso, atajos, actividad, resumen | `src/app/(app)/(tabs)/index.tsx` | `routes/Home` |
| Historial (y de una quincena anterior), desglose, exportar CSV | `(tabs)/historial.tsx`, `(app)/periodo/[periodoId].tsx` | `routes/Historial` |
| Resumen de un periodo: decidir el sobrante, reabrir | `(app)/resumen/[periodoId].tsx` | `routes/Resumen` |
| Metas | `(tabs)/metas.tsx` | `routes/Metas` |
| Tarjetas y cargos a MSI | `(tabs)/tarjetas.tsx` | `routes/Tarjetas` |
| Más (Ajustes): plan, recordatorios, seguridad, cerrar periodo, comentarios, privacidad | `(tabs)/mas.tsx` | `routes/Ajustes` |
| Recurrentes, atajos, categorías | `(app)/recurrentes.tsx`, `atajos.tsx`, `categorias.tsx` | `routes/Recurrentes`, `Atajos`, `Categorias` |

Diferencias a propósito:

- **Editar o eliminar** un gasto o ingreso: se toca la fila y sale una hoja con las dos opciones (en la web son botones
  en cada renglón; en el teléfono no caben). Las confirmaciones usan el diálogo nativo de Android.
- **Exportar CSV y descargar mis datos**: el archivo se abre en el menú de compartir de Android (Drive, correo...).
- **No se vende Korly Pro dentro de la app** (ni botones de pago ni enlaces para pagar): Google Play exige su propio
  sistema de cobro para suscripciones digitales. Se muestra qué traerá Pro y "Avísame", como en la web hoy.
- Los enlaces de los correos (confirmar cuenta, recuperar contraseña, cambiar correo) abren la web; luego se entra a la
  app con normalidad.

**Pendiente frente a la web:** importar CSV, y el reporte de errores a Sentry (la web lo tiene; la app muestra la pantalla de "Algo salió mal" pero todavía no reporta).

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

**Ojo:** la app usa la API y las cuentas de **producción**. Lo que registres desde aquí es real.

En Expo Go el ícono y la pantalla de carga son los de Expo; los de Korly (`assets/`, generados con
`node mobile/herramientas/generar-iconos.mjs` a partir del logo de la web) se ven en una build propia (EAS).

## Cómo está armada

- `src/app/` — las pantallas (Expo Router). `_layout.tsx` decide: con sesión, el grupo `(app)`; sin sesión, las de acceso.
  `(app)/_layout.tsx` pide aceptar el aviso si hace falta; `(app)/(tabs)` son las 5 pestañas (las mismas de la web).
- `src/components/ui.tsx` — piezas visuales comunes (botones, tarjetas, campos, hoja inferior, encabezado con ojito).
- `src/components/CaptchaTurnstile.tsx` — Turnstile dentro de un WebView (ver abajo) y `useCaptcha()`.
- `src/lib/api.ts` — cliente de la API, mismo contrato que `frontend/src/lib/api.ts`.
- `src/lib/supabase.ts` — Supabase solo para Auth; la sesión se guarda en el teléfono (expo-sqlite).
- `src/hooks/use-formatear-monto.ts` — **el único camino para mostrar un monto** (respeta el ojito de privacidad). Nunca
  uses `formatearMonto` directo en una pantalla.

### Captcha (Cloudflare Turnstile)

Turnstile solo funciona en páginas web, así que se dibuja en un **WebView** (una "ventanita de navegador" dentro de la
app) con una página mínima que carga el widget y le pasa el token a la app con `postMessage`. La app lo manda a Supabase
(`options.captchaToken`), igual que la web; el backend propio no interviene. La página se carga con
`baseUrl: https://app.korly.com.mx`, que ya es un dominio permitido del widget: no hubo que tocar Cloudflare. Probado en
un Android real (2026-10-16).

### Código que viene de la web (temporal)

Mientras no exista un paquete compartido, los hooks de datos (`src/hooks/use-*.ts`), `lib/errores-auth.ts`, `lib/fechas.ts`,
`lib/guia.ts` y `stores/guia-store.ts` son **copias exactas** de `frontend/src`. No se editan a mano:

```bash
node mobile/herramientas/copiar-de-la-web.mjs            # vuelve a copiarlos
node mobile/herramientas/copiar-de-la-web.mjs --revisar  # avisa si alguno ya no coincide con la web
```

La prueba `frontend/src/lib/app-movil-sincronizada.test.ts` corre este `--revisar` en el CI de la web: si se cambia un hook de la
web (o la versión del aviso) y no la copia de la app, el CI falla y dice qué copiar.

Excepciones con versión propia: `use-formatear-monto.ts`, `use-guia.ts`, `stores/privacidad-store.ts`, `lib/dinero.ts` (agrega
`pesosACentavos`), `lib/icono-categoria.tsx` (íconos nativos) y `lib/aviso.ts`. **Las versiones del aviso en
`lib/aviso.ts` deben coincidir con `frontend/src/lib/datos-responsable.ts`.**

## Comandos

```bash
npx expo install <paquete>   # SIEMPRE en vez de npm install <paquete>: elige la versión compatible con el SDK
npm run typecheck            # revisión de tipos
npx expo-doctor              # revisa dependencias y configuración
```

## Plan

1. ~~Spike: login con captcha, cifra del día, registrar gasto.~~ Hecho y probado en Android.
2. ~~Todas las pantallas de la web.~~ Hecho (falta probarlas en el teléfono).
3. **Notificaciones nativas**: build de desarrollo con EAS (no funcionan en Expo Go), proyecto de Firebase, tabla de
   tokens y endpoint en el backend, y el cron de recordatorios mandando el aviso a la app. Requiere actualizar el aviso
   de privacidad (Expo y Google entregan los avisos).
4. Importar CSV y reporte de errores a Sentry (necesita un proyecto de Sentry para la app).
5. **Paquete compartido** con la web (cliente de la API, hooks, tipos, dinero, fechas, aviso).
6. **Pruebas y Google Play**: APK para probadores, luego la ficha de la tienda.
