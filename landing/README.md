# Página principal de Korly (korly.com.mx)

Sitio estático de una sola página: qué es Korly, cómo funciona y botones hacia la app (`app.korly.com.mx`). Va **aparte de la app** (`frontend/`) a propósito: es HTML ya hecho, así que Google lee el contenido de inmediato (una app React lo pinta en el navegador y posiciona peor), carga muy rápido y no mezcla su despliegue con el de la app.

Sin framework ni paso de compilación: lo que está en esta carpeta es lo que se publica.

Estructura (solo lo que está en `public/` se publica; lo demás es configuración, documentación y herramientas):

| Archivo | Para qué |
|---|---|
| `public/index.html` | Todo el contenido, las metaetiquetas de SEO y compartir (Open Graph), y los datos estructurados (`WebApplication` y `FAQPage`) |
| `public/styles.css` | Estilos. La paleta y las tipografías son las de la app (`frontend/src/index.css`) |
| `public/main.js` | Dibujo interactivo del héroe y aparición de secciones al desplazarse (la página se lee igual sin JavaScript) |
| `public/assets/og-image.png` | Imagen que sale al compartir el link (1200×630) |
| `public/robots.txt`, `sitemap.xml`, `_headers`, `404.html` | Buscadores, cabeceras de seguridad y caché, y página de error |
| `herramientas/escena/` | **Fuente única de la ilustración** (escena principal, figuras que se salen de la imagen y sus estilos). No se edita nada generado: se cambia aquí y se corre el generador |
| `herramientas/escena/dibujar-escena.mjs` | Dibuja la escena (isla isométrica, personajes, paleta y CSS) y escribe los `.fragmento.svg` y `escena.css` de `herramientas/escena/`; no se editan a mano |
| `herramientas/generar-escena.mjs` | Genera la escena en `public/index.html`, `public/styles.css`, `frontend/src/index.css` y `frontend/src/components/escena-korly.tsx` (el login de la app) |
| `herramientas/og.html` | Fuente de la imagen de compartir (no se publica) |
| `wrangler.jsonc` | Configuración de publicación en Cloudflare (no se publica) |
| `worker.js` | Único código de servidor: redirige `www.korly.com.mx` a `korly.com.mx` (no se publica como archivo) |

## Ver en local

```bash
npx serve landing/public -l 4173
```

Y abrir http://localhost:4173.

## El dibujo interactivo

La escena (isla isométrica con una torre y su pantalla con la cifra, alcancía, gato en la escalera, kiosco, islita de «META», astronauta y paloma con mochila propulsora) ocupa toda la mitad derecha del héroe, y la paloma y algunas estrellas, monedas y un cubo se salen de la imagen y cruzan la raya hacia el texto. **Se edita en `herramientas/escena/dibujar-escena.mjs` y se regenera con `node landing/herramientas/escena/dibujar-escena.mjs && node landing/herramientas/generar-escena.mjs`** (también actualiza el login de la app). El héroe apila dos copias de la misma escena: una de color y otra solo de contornos. La de contornos está oculta con una máscara hecha de manchas (gradientes radiales) que nacen donde pasa el cursor o el dedo, crecen y se desvanecen. Mientras nadie la toca, un cursor invisible recorre una curva de lado a lado y deja el mismo rastro que dejaría el mouse. Las figuras que se salen llevan su propia copia en contornos con la misma máscara, así que también cambian al pasar el cursor. Los colores cambian porque esa capa rota su tono (`hue-rotate`). Con «reducir movimiento» activado en el sistema, el dibujo se queda quieto. Es la misma técnica general (máscara sobre dos capas) de la página de inicio de sesión de Sentry, con dibujo y código propios.

Si se cambia el dibujo, hay que regenerar la imagen de compartir (con `npx serve landing -l 4173` corriendo):

```powershell
& "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=6000 --screenshot=landing/public/assets/og-image.png http://localhost:4173/herramientas/og.html
```

## Publicar (Cloudflare)

Gratis y permite uso comercial. El dominio ya está en Cloudflare. Se publica como un Worker de archivos estáticos (Cloudflare está uniendo Pages con Workers) con un código mínimo, `worker.js`, que manda `www.korly.com.mx` a `korly.com.mx`. Los dos dominios están declarados como dominios personalizados en `wrangler.jsonc`: el propio despliegue crea los registros DNS y los certificados.

1. Una sola vez: `npx wrangler login` (abre el navegador para autorizar).
2. Cada vez que cambie algo: `npx wrangler deploy --config landing/wrangler.jsonc`
3. Una sola vez, en [Google Search Console](https://search.google.com/search-console): agregar `korly.com.mx` (verificación por DNS), enviar `https://korly.com.mx/sitemap.xml` y pedir la indexación de la página principal.

**Versión de los archivos:** `index.html` carga `styles.css?v=…` y `main.js?v=…`. Si alguien visitó la página antes, su navegador puede tener guardada una versión vieja del CSS o del JS; al cambiarlos, hay que cambiar ese `v=` en `index.html` (los archivos se revalidan solos, pero así se evita ver una página nueva con estilos viejos).

**Cuidado:** nunca correr `wrangler` sin `--config landing/wrangler.jsonc` desde la raíz del repositorio. Sin ese archivo, Wrangler adivina una configuración y puede publicar una carpeta equivocada (por ejemplo `frontend/`, con su `.env`). Ya pasó una vez el 2026-10-06: durante unos minutos quedó publicada `frontend/` con su `.env` (solo variables `VITE_*` públicas por diseño, sin llaves secretas); se borró en cuanto se vio.

## Reglas para el texto

- **Nada que Korly no haga hoy.** Todo lo que dice la página está verificado contra la app (`docs/plan-pro.md` y el aviso de privacidad). Si una función cambia, cambia aquí. Korly Pro y las funciones compartidas se anuncian como «próximamente», sin precio ni fecha.
- **Solo uso personal.** No se promete nada para empresas: esa versión no existe (`docs/documento-maestro-v2.md`, Business está condicionado a tener demanda).
- **Enlaces legales:** el aviso de privacidad y los términos viven en la app (`app.korly.com.mx/privacidad` y `/terminos`), con nombre y domicilio del responsable; esta página no los repite.
- **Sin analítica ni cookies de seguimiento**, como dice el aviso de privacidad. Si algún día se agrega medición, debe ser sin cookies (por ejemplo Cloudflare Web Analytics) y el aviso debe decirlo.

## Google Search Console

La propiedad `https://korly.com.mx/` (tipo «Prefijo de la URL») se verificó el 2026-10-09 con la etiqueta
`<meta name="google-site-verification" …>` del `<head>` de `public/index.html`. **No la quites**: si desaparece, Google pierde
la verificación. Se eligió la etiqueta y no el archivo `googleXXXX.html` porque Cloudflare redirige (307) cualquier
`*.html` a su versión sin extensión y Google pide que ese archivo responda 200. El mapa del sitio es `public/sitemap.xml`
(enviado en Search Console); si agregas páginas a la landing, súmalas ahí.
