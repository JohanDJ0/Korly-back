/**
 * `npm run metricas` — reporte de activación, constancia y retención de los
 * usuarios (modulos/metricas/), calculado solo con lo que el ledger ya
 * guarda: sin analítica de terceros ni seguimiento nuevo. Pensado para
 * medir el piloto contra el riesgo #1 del producto (la fatiga de captura,
 * documento-maestro-v2.md §11).
 *
 *   npm run metricas                                  todos los usuarios
 *   npm run metricas -- --desde=2026-10-15            solo quien entró desde esa fecha
 *   npm run metricas -- --desde=2026-10-15 --hasta=2026-11-01
 *   npm run metricas -- --json                        salida para máquinas
 *
 * `--desde` es la forma de dejar fuera las cuentas de prueba: pon la fecha
 * en que arrancó el piloto. Corre con la conexión de administración
 * (`DATABASE_URL`), así que solo desde una máquina de confianza.
 */
import 'dotenv/config';
import { calcularMetricas, formatearReporte } from '../src/modulos/metricas/calcular-metricas.js';
import { leerDatosMetricas } from '../src/modulos/metricas/leer-datos.js';
import { esFechaIsoValida } from '../src/shared/fechas.js';

function leerArgumentos(argv: string[]) {
  const resultado: { desde?: string; hasta?: string; json: boolean } = { json: false };
  for (const argumento of argv) {
    if (argumento === '--json') {
      resultado.json = true;
      continue;
    }
    const [nombre, valor] = argumento.split('=');
    if ((nombre === '--desde' || nombre === '--hasta') && valor && esFechaIsoValida(valor)) {
      resultado[nombre === '--desde' ? 'desde' : 'hasta'] = valor;
      continue;
    }
    console.error(`Argumento no válido: ${argumento}\nUso: npm run metricas -- [--desde=YYYY-MM-DD] [--hasta=YYYY-MM-DD] [--json]`);
    process.exit(1);
  }
  return resultado;
}

async function main() {
  const { desde, hasta, json } = leerArgumentos(process.argv.slice(2));
  const ahora = new Date();
  const datos = await leerDatosMetricas({ desde, hasta, ahora });
  const metricas = calcularMetricas(datos, ahora, { desde: desde ?? null, hasta: hasta ?? null });

  console.log(json ? JSON.stringify(metricas, null, 2) : formatearReporte(metricas));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[metricas] fallo:', error);
    process.exit(1);
  });
