/**
 * `npm run recordatorios` — pensado para correr como Cron Job de
 * Railway (un segundo servicio en el mismo proyecto, `0 2 * * *` UTC =
 * 8pm hora de México, fija sin DST), nunca como parte del servidor
 * Fastify (documento-maestro-v2.md §13.4).
 *
 * Un tenant que falla no detiene a los demás — el error se reporta a
 * Sentry (si está configurado) y el job sigue. CLAUDE.md exige que los
 * jobs toleren correr dos veces o ninguna: correrlo dos veces el mismo
 * día es seguro (el índice único de `recordatorios_enviados` hace que
 * la segunda corrida no mande nada de nuevo, ver
 * `modulos/notificaciones/enviar-recordatorios.ts`); no correrlo un día
 * simplemente significa que ese día nadie recibió el recordatorio —
 * aceptable para un aviso informativo, no para un movimiento del ledger.
 *
 * Sentry manda sus eventos de forma asíncrona: salir con `process.exit`
 * sin esperar los dejaba morir con el proceso, justo el caso en que más
 * importan. Por eso siempre se vacía (`vaciarObservabilidad`) antes de salir.
 */
import 'dotenv/config';
import { correrRecordatorios } from '../src/modulos/notificaciones/correr-recordatorios.js';
import { inicializarObservabilidad, reportarErrorInesperado, vaciarObservabilidad } from '../src/shared/observabilidad.js';

inicializarObservabilidad();

const codigoDeSalida = await correrRecordatorios()
  .then(({ resumen }) => {
    console.log(`[recordatorios] ${resumen}`);
    return 0;
  })
  .catch((error) => {
    console.error('[recordatorios] fallo general del job:', error);
    reportarErrorInesperado(error);
    return 1;
  });

await vaciarObservabilidad();
process.exit(codigoDeSalida);
