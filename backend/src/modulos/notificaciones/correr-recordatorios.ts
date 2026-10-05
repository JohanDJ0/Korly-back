import { ahoraEnMexico } from '../../shared/fechas.js';
import { reportarErrorInesperado } from '../../shared/observabilidad.js';
import {
  listarTenantIdsConRecordatoriosActivos,
  procesarRecordatorioDiarioDeTenant,
  resumirCorrida,
  type ResultadoRecordatorioDiario,
} from './enviar-recordatorios.js';

/** Todo lo que toca el mundo exterior, inyectable para probar el job sin base de datos ni correo. */
export interface DependenciasJob {
  listarTenants: () => Promise<string[]>;
  procesar: (tenantId: string, fechaReferencia: Date) => Promise<ResultadoRecordatorioDiario>;
  reportarError: (error: unknown) => void;
  registrarError: (mensaje: string, error: unknown) => void;
  ahora: () => Date;
}

const DEPENDENCIAS_REALES: DependenciasJob = {
  listarTenants: listarTenantIdsConRecordatoriosActivos,
  procesar: procesarRecordatorioDiarioDeTenant,
  reportarError: reportarErrorInesperado,
  registrarError: (mensaje, error) => console.error(mensaje, error),
  ahora: ahoraEnMexico,
};

/**
 * Cuerpo del job de recordatorios (`scripts/enviar-recordatorios.ts` solo lo llama y se encarga de
 * vaciar Sentry y salir). Un tenant que falla no detiene a los demás: el error se reporta a Sentry
 * y el job sigue. Un fallo que impide siquiera listar los tenants SÍ se propaga, para que el script
 * lo reporte y termine con código 1 (Railway lo marca como corrida fallida).
 */
export async function correrRecordatorios(dependencias: DependenciasJob = DEPENDENCIAS_REALES): Promise<{ resumen: string; fallidos: number }> {
  const fechaReferencia = dependencias.ahora();
  const tenantIds = await dependencias.listarTenants();

  const resultados: ResultadoRecordatorioDiario[] = [];
  let fallidos = 0;

  for (const tenantId of tenantIds) {
    try {
      resultados.push(await dependencias.procesar(tenantId, fechaReferencia));
    } catch (error) {
      fallidos++;
      dependencias.registrarError(`[recordatorios] tenant ${tenantId} falló:`, error);
      dependencias.reportarError(error);
    }
  }

  return { resumen: resumirCorrida(resultados, fallidos), fallidos };
}
