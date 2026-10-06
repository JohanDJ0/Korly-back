# Página principal de Korly (korly.com.mx)

Sitio estático de una sola página: qué es Korly, cómo funciona y botones hacia la app (`app.korly.com.mx`). Va **aparte de la app** (`frontend/`) a propósito: es HTML ya hecho, así que Google lee el contenido de inmediato (una app React lo pinta en el navegador y posiciona peor), carga muy rápido y no mezcla su despliegue con el de la app.

Sin framework ni paso de compilación: lo que está en esta carpeta es lo que se publica.

| Archivo | Para qué |
|---|---|
| `index.html` | Todo el contenido, las metaetiquetas de SEO y compartir (Open Graph), y los datos estructurados (`WebApplication` y `FAQPage`) |
| `styles.css` | Estilos. La paleta y las tipografías son las de la app (`frontend/src/index.css`) |
| `main.js` | Dibujo interactivo del héroe y aparición de secciones al desplazarse (la página se lee igual sin JavaScript) |
| `assets/og-image.png` | Imagen que sale al compartir el link (1200×630) |
| `og.html` | Fuente de esa imagen (no se indexa) |
| `robots.txt`, `sitemap.xml`, `_headers`, `404.html` | Buscadores, cabeceras de seguridad y caché de Cloudflare Pages, y página de error |

## Ver en local

```bash
npx serve landing -l 4173
```

Y abrir http://localhost:4173.

## El dibujo interactivo

El héroe apila dos copias del mismo dibujo SVG (`#korly-art`): una de color y otra solo de contornos. La de contornos está oculta con una máscara hecha de manchas (gradientes radiales) que nacen donde pasa el cursor o el dedo, crecen y se desvanecen; mientras nadie la toca, salen manchas solas. Los colores cambian porque esa capa rota su tono (`hue-rotate`). Con «reducir movimiento» activado en el sistema, el dibujo se queda quieto. Es la misma técnica general (máscara sobre dos capas) de la página de inicio de sesión de Sentry, con dibujo y código propios.

Si se cambia el dibujo, hay que regenerar la imagen de compartir:

```powershell
npx serve landing -l 4173
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=6000 --screenshot=landing\assets\og-image.png http://localhost:4173/og.html
```

## Publicar (Cloudflare Pages)

Gratis y permite uso comercial. El dominio ya está en Cloudflare.

1. Una sola vez: `npx wrangler login` (abre el navegador para autorizar).
2. Cada vez que cambie algo: `npx wrangler pages deploy landing --project-name=korly-landing`
3. Una sola vez, en el panel de Cloudflare (Workers y Pages → korly-landing → Dominios personalizados): agregar `korly.com.mx`. Cloudflare crea el registro DNS solo.
4. `www.korly.com.mx` → redirigir a `korly.com.mx` con una regla de redirección.
5. Una sola vez, en [Google Search Console](https://search.google.com/search-console): agregar `korly.com.mx` (verificación por DNS), enviar `https://korly.com.mx/sitemap.xml` y pedir la indexación de la página principal.

## Reglas para el texto

- **Nada que Korly no haga hoy.** Todo lo que dice la página está verificado contra la app (`docs/plan-pro.md` y el aviso de privacidad). Si una función cambia, cambia aquí. Korly Pro y las funciones compartidas se anuncian como «próximamente», sin precio ni fecha.
- **Solo uso personal.** No se promete nada para empresas: esa versión no existe (`docs/documento-maestro-v2.md`, Business está condicionado a tener demanda).
- **Enlaces legales:** el aviso de privacidad y los términos viven en la app (`app.korly.com.mx/privacidad` y `/terminos`), con nombre y domicilio del responsable; esta página no los repite.
- **Sin analítica ni cookies de seguimiento**, como dice el aviso de privacidad. Si algún día se agrega medición, debe ser sin cookies (por ejemplo Cloudflare Web Analytics) y el aviso debe decirlo.
