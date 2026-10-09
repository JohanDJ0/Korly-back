import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Levanta la pila local (backend/scripts/pila-e2e.ts: Postgres desechable + API real + Supabase Auth de mentira) antes de
 * las pruebas y la apaga al terminar. Se lanza con `node --import tsx` (sin npx) para tener al proceso hijo directo: se le
 * pide apagarse escribiéndole `SALIR`, y si Playwright muere se apaga solo al cerrarse su entrada. Así no quedan
 * Postgres huérfanos.
 */
const BACKEND = resolve(import.meta.dirname, '../../backend');
const ESPERA_ARRANQUE_MS = 120_000;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const pila: ChildProcessWithoutNullStreams = spawn(process.execPath, ['--import', 'tsx', 'scripts/pila-e2e.ts'], { cwd: BACKEND, stdio: ['pipe', 'pipe', 'pipe'] });

  let salidaError = '';
  pila.stderr.on('data', (trozo: Buffer) => {
    salidaError += trozo.toString();
  });

  await new Promise<void>((resolver, rechazar) => {
    const plazo = setTimeout(() => rechazar(new Error(`La pila de pruebas no arrancó en ${ESPERA_ARRANQUE_MS / 1000} s.\n${salidaError}`)), ESPERA_ARRANQUE_MS);
    let acumulado = '';
    pila.stdout.on('data', (trozo: Buffer) => {
      acumulado += trozo.toString();
      if (acumulado.includes('PILA_LISTA')) {
        clearTimeout(plazo);
        resolver();
      }
    });
    pila.once('exit', (codigo) => {
      clearTimeout(plazo);
      rechazar(new Error(`La pila de pruebas terminó antes de estar lista (código ${codigo}).\n${salidaError}`));
    });
  });

  return async () => {
    if (pila.exitCode !== null) return;
    const terminado = new Promise<void>((resolver) => pila.once('exit', () => resolver()));
    pila.stdin.write('SALIR\n');
    const limite = new Promise<void>((resolver) => setTimeout(resolver, 30_000));
    await Promise.race([terminado, limite]);
    if (pila.exitCode === null) pila.kill();
  };
}
