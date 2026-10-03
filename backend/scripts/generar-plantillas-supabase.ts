/**
 * `npx tsx scripts/generar-plantillas-supabase.ts` — genera los HTML de los
 * correos de autenticación de Supabase (Authentication → Emails → Templates)
 * con el mismo molde que los correos de la app (src/shared/plantilla-correo.ts).
 *
 *   (sin argumentos)   ../docs/correos-supabase/*.html   para pegar en Supabase,
 *                      con sus variables Go ({{ .ConfirmationURL }}, ...).
 *   --vista-previa     <carpeta>/*.html   con datos de ejemplo, para verlos en
 *                      el navegador antes de publicarlos.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderizarCorreo } from '../src/shared/plantilla-correo.js';
import { PLANTILLAS } from '../src/shared/plantillas-supabase.js';

const EJEMPLO: Record<string, string> = {
  '{{ .ConfirmationURL }}': 'https://app.korly.com.mx/auth/confirmar?token=ejemplo',
  '{{ .Email }}': 'tu@correo.com',
  '{{ .NewEmail }}': 'nuevo@correo.com',
  '{{ .Token }}': '482915',
  '{{ .SiteURL }}': 'https://app.korly.com.mx',
};

function conEjemplos(texto: string): string {
  return Object.entries(EJEMPLO).reduce((resultado, [variable, valor]) => resultado.split(variable).join(valor), texto);
}

function main() {
  const vistaPrevia = process.argv.includes('--vista-previa');
  const carpeta = vistaPrevia ? path.resolve(process.argv[process.argv.indexOf('--vista-previa') + 1] ?? 'vista-previa-correos') : path.resolve(import.meta.dirname, '../../docs/correos-supabase');
  mkdirSync(carpeta, { recursive: true });

  for (const plantilla of PLANTILLAS) {
    const { html } = renderizarCorreo(plantilla.contenido, { urlApp: '{{ .SiteURL }}' });
    writeFileSync(path.join(carpeta, `${plantilla.archivo}.html`), vistaPrevia ? conEjemplos(html) : html, 'utf8');
  }

  if (!vistaPrevia) {
    const filas = PLANTILLAS.map((p) => `| ${p.nombreEnSupabase} | ${p.asunto} | \`${p.archivo}.html\` |`).join('\n');
    writeFileSync(
      path.join(carpeta, 'README.md'),
      `# Plantillas de correo de Supabase\n\nGeneradas con \`npx tsx scripts/generar-plantillas-supabase.ts\` (en \`backend/\`) a partir de \`src/shared/plantilla-correo.ts\`: no se editan a mano.\n\nSe pegan en Supabase → Authentication → Emails → Templates. Cada plantilla lleva su asunto (*Subject*) y el HTML (*Message body*).\n\n| Plantilla en Supabase | Asunto | Archivo |\n|---|---|---|\n${filas}\n`,
      'utf8'
    );
  }

  console.log(`${PLANTILLAS.length} plantillas escritas en ${carpeta}`);
}

main();
