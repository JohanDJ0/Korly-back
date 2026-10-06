import type { EstadoSuscripcion, Plan } from '../../db/schema/tenants.js';
import { diaCalendarioEnMexico } from '../../shared/fechas.js';

/** Lo único que se sabe de cada usuario: banderas, fechas y conteos — nunca un nombre, un monto ni una nota. */
export interface DatosTenant {
  altaEn: Date;
  plan: Plan;
  estadoSuscripcion: EstadoSuscripcion | null;
  recibirRecordatorios: boolean;
  /** Pidió que le avisemos cuando Korly Pro esté disponible (botón "Avísame"). */
  pidioAvisoPro: boolean;
  tienePeriodo: boolean;
  tieneIngreso: boolean;
  /** Instantes reales en que el usuario capturó a mano un gasto o un cargo de tarjeta. */
  capturas: Date[];
  recordatoriosEnviadosUltimos7Dias: number;
}

export interface Proporcion {
  n: number;
  de: number;
  /** `null` si no hay base (nadie elegible todavía), para no inventar un 0%. */
  porcentaje: number | null;
}

export interface Metricas {
  /** Día de México en que se calculó. */
  generadoEn: string;
  cohorte: { desde: string | null; hasta: string | null; usuarios: number };
  embudo: {
    registrados: number;
    conPeriodo: Proporcion;
    conIngreso: Proporcion;
    conPrimerGasto: Proporcion;
    /** Base: solo quien ya tuvo 24 h para hacerlo. */
    conGastoEn24Horas: Proporcion;
  };
  tiempoAlPrimerGasto: { usuarios: number; medianaHoras: number | null };
  constanciaPrimerasDosSemanas: {
    /** Base: quien ya completó sus primeros 14 días. */
    elegibles: number;
    medianaDiasActivos: number | null;
    conCincoOMasDias: Proporcion;
  };
  retencionSemanal: { semana: number; activos: Proporcion }[];
  recordatorios: { usuariosConRecordatoriosActivos: number; enviadosUltimos7Dias: number };
  suscripciones: { free: number; enPrueba: number; proActivo: number; pagoPendiente: number; canceladas: number; pidieronAvisoPro: number };
}

const HORA_MS = 60 * 60 * 1000;
const SEMANAS_DE_RETENCION = 4;

function proporcion(n: number, de: number): Proporcion {
  return { n, de, porcentaje: de === 0 ? null : Math.round((n / de) * 1000) / 10 };
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  const valor = ordenados.length % 2 === 1 ? ordenados[medio]! : (ordenados[medio - 1]! + ordenados[medio]!) / 2;
  return Math.round(valor * 10) / 10;
}

/** Suma `dias` a un día 'YYYY-MM-DD' (aritmética de calendario pura, sin zona horaria de por medio). */
function sumarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * 24 * HORA_MS).toISOString().slice(0, 10);
}

/**
 * Embudo de activación, constancia y retención de una cohorte — todo se
 * calcula con lo que el ledger ya guarda, sin analítica de terceros.
 *
 * **"Actividad" = capturar a mano un gasto o un cargo de tarjeta**, no
 * abrir la app ni registrar el ingreso: el riesgo #1 del producto
 * (documento-maestro-v2.md §11) es la fatiga de captura, y lo que mide si
 * alguien se quedó es si sigue anotando. Quedan fuera los gastos
 * materializados solos (recurrentes, mensualidades) porque no los decidió
 * el usuario ese día. Corregir un gasto crea uno nuevo y cuenta como
 * actividad (es una interacción real); una importación CSV cuenta como un
 * solo día.
 *
 * **Ventanas completas, nunca a medias:** cada indicador solo mira a quien
 * ya pasó por toda su ventana (p. ej. la semana 2 de retención exige que
 * hayan transcurrido sus 7 días completos). Mezclar usuarios con ventanas
 * parciales regala números optimistas que luego se desploman. Con cohortes
 * chicas, lee siempre el `n`/`de`, no solo el porcentaje.
 *
 * Retención de la semana k = activo al menos un día entre los días 7k y
 * 7k+6 contados desde el día de alta (día 0).
 */
export function calcularMetricas(tenants: DatosTenant[], ahora: Date, filtro: { desde: string | null; hasta: string | null } = { desde: null, hasta: null }): Metricas {
  const hoy = diaCalendarioEnMexico(ahora);

  const analizados = tenants.map((tenant) => {
    const diaAlta = diaCalendarioEnMexico(tenant.altaEn);
    const capturasOrdenadas = [...tenant.capturas].sort((a, b) => a.getTime() - b.getTime());
    const diasActivos = new Set(capturasOrdenadas.map(diaCalendarioEnMexico));
    return { tenant, diaAlta, capturasOrdenadas, diasActivos, primera: capturasOrdenadas[0] ?? null };
  });

  const conPrimerGasto = analizados.filter((a) => a.primera !== null);
  const elegibles24h = analizados.filter((a) => ahora.getTime() - a.tenant.altaEn.getTime() >= 24 * HORA_MS);
  const gastoEn24h = elegibles24h.filter((a) => a.primera !== null && a.primera.getTime() - a.tenant.altaEn.getTime() <= 24 * HORA_MS);

  const horasAlPrimerGasto = conPrimerGasto.map((a) => Math.max(0, (a.primera!.getTime() - a.tenant.altaEn.getTime()) / HORA_MS));

  const dosSemanasCompletas = analizados.filter((a) => hoy >= sumarDias(a.diaAlta, 13));
  const diasActivosEnDosSemanas = dosSemanasCompletas.map((a) => {
    let total = 0;
    for (let d = 0; d < 14; d++) if (a.diasActivos.has(sumarDias(a.diaAlta, d))) total++;
    return total;
  });

  const retencionSemanal = Array.from({ length: SEMANAS_DE_RETENCION }, (_, indice) => {
    const semana = indice + 1;
    const elegibles = analizados.filter((a) => hoy >= sumarDias(a.diaAlta, semana * 7 + 6));
    const activos = elegibles.filter((a) => {
      for (let d = semana * 7; d <= semana * 7 + 6; d++) if (a.diasActivos.has(sumarDias(a.diaAlta, d))) return true;
      return false;
    });
    return { semana, activos: proporcion(activos.length, elegibles.length) };
  });

  const total = tenants.length;
  return {
    generadoEn: hoy,
    cohorte: { desde: filtro.desde, hasta: filtro.hasta, usuarios: total },
    embudo: {
      registrados: total,
      conPeriodo: proporcion(tenants.filter((t) => t.tienePeriodo).length, total),
      conIngreso: proporcion(tenants.filter((t) => t.tieneIngreso).length, total),
      conPrimerGasto: proporcion(conPrimerGasto.length, total),
      conGastoEn24Horas: proporcion(gastoEn24h.length, elegibles24h.length),
    },
    tiempoAlPrimerGasto: { usuarios: horasAlPrimerGasto.length, medianaHoras: mediana(horasAlPrimerGasto) },
    constanciaPrimerasDosSemanas: {
      elegibles: dosSemanasCompletas.length,
      medianaDiasActivos: mediana(diasActivosEnDosSemanas),
      conCincoOMasDias: proporcion(diasActivosEnDosSemanas.filter((dias) => dias >= 5).length, dosSemanasCompletas.length),
    },
    retencionSemanal,
    recordatorios: {
      usuariosConRecordatoriosActivos: tenants.filter((t) => t.recibirRecordatorios).length,
      enviadosUltimos7Dias: tenants.reduce((suma, t) => suma + t.recordatoriosEnviadosUltimos7Dias, 0),
    },
    suscripciones: {
      free: tenants.filter((t) => t.plan === 'free').length,
      enPrueba: tenants.filter((t) => t.plan === 'pro' && t.estadoSuscripcion === 'trialing').length,
      proActivo: tenants.filter((t) => t.plan === 'pro' && t.estadoSuscripcion === 'activa').length,
      pagoPendiente: tenants.filter((t) => t.estadoSuscripcion === 'pago_pendiente').length,
      canceladas: tenants.filter((t) => t.plan === 'free' && t.estadoSuscripcion === 'cancelada').length,
      pidieronAvisoPro: tenants.filter((t) => t.pidioAvisoPro).length,
    },
  };
}

function texto(p: Proporcion): string {
  return p.porcentaje === null ? `— (sin base todavía)` : `${p.n} de ${p.de} (${p.porcentaje}%)`;
}

/** Reporte legible para la terminal. Siempre muestra `n de N`: con cohortes chicas un porcentaje solo engaña. */
export function formatearReporte(m: Metricas): string {
  const rango = m.cohorte.desde || m.cohorte.hasta ? `${m.cohorte.desde ?? 'el inicio'} → ${m.cohorte.hasta ?? 'hoy'}` : 'todos los usuarios';
  const lineas = [
    `Korly — métricas de producto (${m.generadoEn})`,
    `Cohorte: ${rango} · ${m.cohorte.usuarios} usuarios`,
    '',
    'ACTIVACIÓN (embudo de los primeros pasos)',
    `  Registrados .......................... ${m.embudo.registrados}`,
    `  Crearon su periodo ................... ${texto(m.embudo.conPeriodo)}`,
    `  Registraron su ingreso ............... ${texto(m.embudo.conIngreso)}`,
    `  Capturaron al menos 1 gasto .......... ${texto(m.embudo.conPrimerGasto)}`,
    `  ...y lo hicieron en sus primeras 24 h  ${texto(m.embudo.conGastoEn24Horas)}`,
    `  Tiempo al primer gasto (mediana) ..... ${m.tiempoAlPrimerGasto.medianaHoras === null ? '—' : `${m.tiempoAlPrimerGasto.medianaHoras} h`} (${m.tiempoAlPrimerGasto.usuarios} usuarios)`,
    '',
    'CONSTANCIA (primeros 14 días, solo quien ya los completó)',
    `  Días con captura, mediana ............ ${m.constanciaPrimerasDosSemanas.medianaDiasActivos === null ? '—' : `${m.constanciaPrimerasDosSemanas.medianaDiasActivos} de 14`} (${m.constanciaPrimerasDosSemanas.elegibles} usuarios)`,
    `  Capturaron en 5 o más días ........... ${texto(m.constanciaPrimerasDosSemanas.conCincoOMasDias)}`,
    '',
    'RETENCIÓN SEMANAL (siguen capturando; semana 1 = días 7 a 13 desde el alta)',
    ...m.retencionSemanal.map((r) => `  Semana ${r.semana} .............................. ${texto(r.activos)}`),
    '',
    'RECORDATORIOS',
    `  Usuarios con recordatorios activos ... ${m.recordatorios.usuariosConRecordatoriosActivos}`,
    `  Correos enviados, últimos 7 días ..... ${m.recordatorios.enviadosUltimos7Dias}${m.recordatorios.usuariosConRecordatoriosActivos > 0 && m.recordatorios.enviadosUltimos7Dias === 0 ? '   ← ¿el cron está corriendo?' : ''}`,
    '',
    'SUSCRIPCIONES',
    `  Free ${m.suscripciones.free} · En prueba ${m.suscripciones.enPrueba} · Pro activo ${m.suscripciones.proActivo} · Pago pendiente ${m.suscripciones.pagoPendiente} · Canceladas ${m.suscripciones.canceladas}`,
    `  Pidieron que les avisemos cuando Pro exista ... ${m.suscripciones.pidieronAvisoPro} de ${m.cohorte.usuarios}`,
  ];
  return lineas.join('\n');
}
