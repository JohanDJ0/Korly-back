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
 */
import 'dotenv/config';
import { listarTenantIdsConRecordatoriosActivos, procesarRecordatorioDiarioDeTenant } from '../src/modulos/notificaciones/enviar-recordatorios.js';
import { inicializarObservabilidad, reportarErrorInesperado } from '../src/shared/observabilidad.js';

inicializarObservabilidad();

async function main() {
  const fechaReferencia = new Date();
  const tenantIds = await listarTenantIdsConRecordatoriosActivos();

  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;

  for (const tenantId of tenantIds) {
    try {
      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, fechaReferencia);
      if (resultado.enviado) {
        enviados++;
      } else {
        omitidos++;
      }
    } catch (error) {
      fallidos++;
      console.error(`[recordatorios] tenant ${tenantId} falló:`, error);
      reportarErrorInesperado(error);
    }
  }

  console.log(`[recordatorios] tenants: ${tenantIds.length} — enviados: ${enviados}, omitidos: ${omitidos}, fallidos: ${fallidos}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[recordatorios] fallo general del job:', error);
    process.exit(1);
  });
