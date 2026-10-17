/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

/**
 * La app de Android (mobile/) usa copias exactas de los hooks de datos y de algunos módulos de la web, y las mismas
 * versiones del aviso de privacidad. Si se cambia uno aquí y no allá, la app se queda atrás sin que nadie lo note: esta
 * prueba falla y dice qué copiar (con `node mobile/herramientas/copiar-de-la-web.mjs`). Vitest corre desde frontend/.
 */
it('la app de Android tiene las mismas copias de la web (hooks, módulos y versiones del aviso)', () => {
  const resultado = spawnSync(process.execPath, [resolve(process.cwd(), '../mobile/herramientas/copiar-de-la-web.mjs'), '--revisar'], { encoding: 'utf8' });
  expect(resultado.status, `${resultado.stdout}${resultado.stderr}\nArréglalo con: node mobile/herramientas/copiar-de-la-web.mjs`).toBe(0);
});
