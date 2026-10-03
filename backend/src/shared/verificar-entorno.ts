import 'dotenv/config';
import { validarEntorno } from './entorno.js';

/**
 * Módulo con efecto al importarse, y debe ser el **primer** import de
 * `server.ts`: `shared/db.ts` lanza un error genérico al cargarse si
 * falta una variable, y los imports se evalúan en orden — importado
 * antes que nada, esto da el diagnóstico completo (todas las variables a
 * la vez, con por qué importan) en vez del primer error suelto.
 *
 * Solo en producción: en desarrollo y en CI los valores por defecto
 * (localhost, sin Stripe, sin Sentry) son lo esperado.
 */
if (process.env.NODE_ENV === 'production') {
  const { errores, avisos } = validarEntorno(process.env);

  for (const aviso of avisos) console.warn(`[entorno] aviso: ${aviso}`);

  if (errores.length > 0) {
    console.error('[entorno] No se puede arrancar en producción:');
    for (const error of errores) console.error(`  - ${error}`);
    process.exit(1);
  }
}
