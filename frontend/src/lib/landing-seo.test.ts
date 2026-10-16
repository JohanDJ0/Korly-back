/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Integridad del sitio público (korly.com.mx, carpeta landing/public): cada página con lo que Google necesita, sin enlaces
 * rotos entre ellas y con el sitemap al día. Vitest corre desde frontend/, y se lee directo del disco.
 */
const RAIZ = resolve(process.cwd(), '../landing/public');
const ORIGEN = 'https://korly.com.mx';

/** Página (ruta publicada) → archivo en disco. Las rutas con diagonal final se sirven desde su index.html. */
const PAGINAS = ['/', '/calculadora/', '/guias/', '/guias/como-controlar-tus-gastos-por-quincena/', '/guias/cuanto-puedo-gastar-al-dia-con-mi-sueldo-quincenal/'];
const archivoDe = (ruta: string) => resolve(RAIZ, ruta.replace(/^\//, ''), ruta.endsWith('/') ? 'index.html' : '');
const leer = (ruta: string) => readFileSync(archivoDe(ruta), 'utf8');
const etiqueta = (html: string, patron: RegExp) => patron.exec(html)?.[1];

describe('sitio público — cada página', () => {
  for (const ruta of PAGINAS) {
    describe(ruta, () => {
      const html = leer(ruta);

      it('tiene título (hasta 60 caracteres, para que Google no lo corte) y descripción (hasta 160)', () => {
        const titulo = etiqueta(html, /<title>([^<]*)<\/title>/)!;
        const descripcion = etiqueta(html, /<meta\s+name="description"\s+content="([^"]*)"/)!;
        expect(titulo.length).toBeGreaterThan(15);
        expect(titulo.length, `título: "${titulo}"`).toBeLessThanOrEqual(60);
        expect(descripcion.length).toBeGreaterThan(70);
        expect(descripcion.length, `descripción: "${descripcion}"`).toBeLessThanOrEqual(160);
      });

      it('su canonical es su propia dirección y coincide con og:url', () => {
        const esperada = `${ORIGEN}${ruta}`;
        expect(etiqueta(html, /<link rel="canonical" href="([^"]*)"/)).toBe(esperada);
        expect(etiqueta(html, /<meta property="og:url" content="([^"]*)"/)).toBe(esperada);
      });

      it('declara idioma es-MX, una sola H1 y la imagen para compartir', () => {
        expect(html).toContain('<html lang="es-MX">');
        expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
        expect(etiqueta(html, /<meta property="og:image" content="([^"]*)"/)).toBe(`${ORIGEN}/assets/og-image.png`);
      });

      it('sus datos estructurados son JSON válido', () => {
        const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
        expect(bloques.length).toBeGreaterThan(0);
        for (const bloque of bloques) expect(() => JSON.parse(bloque)).not.toThrow();
      });

      it('lleva los enlaces de navegación del sitio y el botón de crear cuenta hacia la app', () => {
        expect(html).toContain('href="/calculadora/"');
        expect(html).toContain('href="/guias/"');
        expect(html).toContain('https://app.korly.com.mx/registro');
      });
    });
  }

  it('ningún título ni descripción se repite entre páginas (Google las toma por duplicadas)', () => {
    const titulos = PAGINAS.map((r) => etiqueta(leer(r), /<title>([^<]*)<\/title>/));
    const descripciones = PAGINAS.map((r) => etiqueta(leer(r), /<meta\s+name="description"\s+content="([^"]*)"/));
    expect(new Set(titulos).size).toBe(PAGINAS.length);
    expect(new Set(descripciones).size).toBe(PAGINAS.length);
  });

  it('la página principal habla de "gestor de gastos" y de la quincena en su título, descripción y encabezado', () => {
    const html = leer('/');
    expect(etiqueta(html, /<title>([^<]*)<\/title>/)).toMatch(/gestor de gastos/i);
    expect(etiqueta(html, /<meta\s+name="description"\s+content="([^"]*)"/)).toMatch(/gestor de gastos/i);
    expect(html).toMatch(/<p class="eyebrow">Gestor de gastos por quincena<\/p>/);
    expect(html).toContain('google-site-verification'); // la etiqueta de Search Console no se puede perder
  });
});

describe('sitio público — enlaces internos y sitemap', () => {
  it('todo enlace interno (a otra página o a un archivo) apunta a algo que existe', () => {
    const rotos: string[] = [];
    for (const ruta of PAGINAS) {
      const html = leer(ruta);
      for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
        const destino = m[1]!;
        if (destino === '/') continue;
        const archivo = archivoDe(destino);
        if (!existsSync(archivo)) rotos.push(`${ruta} → ${destino}`);
      }
    }
    expect(rotos).toEqual([]);
  });

  it('las anclas de la página principal que usan las demás páginas existen', () => {
    const html = leer('/');
    for (const ancla of ['como-funciona', 'preguntas', 'aprende']) expect(html, ancla).toContain(`id="${ancla}"`);
  });

  it('el sitemap lista exactamente las páginas del sitio, con su dirección completa y fecha', () => {
    const sitemap = readFileSync(resolve(RAIZ, 'sitemap.xml'), 'utf8');
    const urls = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(PAGINAS.map((r) => `${ORIGEN}${r}`).sort());
    expect((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length).toBe(PAGINAS.length);
  });

  it('robots.txt permite todo y apunta al sitemap', () => {
    const robots = readFileSync(resolve(RAIZ, 'robots.txt'), 'utf8');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain(`Sitemap: ${ORIGEN}/sitemap.xml`);
  });

  it('las páginas nuevas usan la misma versión de estilos que la principal (no se ve una página nueva con CSS viejo)', () => {
    const version = etiqueta(leer('/'), /styles\.css\?v=([0-9a-z]+)/);
    for (const ruta of PAGINAS) expect(etiqueta(leer(ruta), /styles\.css\?v=([0-9a-z]+)/), ruta).toBe(version);
  });
});
