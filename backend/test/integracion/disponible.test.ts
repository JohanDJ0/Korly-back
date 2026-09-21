import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { periodos } from '../../src/db/schema/periodos.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { editarIngreso, eliminarIngreso, registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { editarGasto, eliminarGasto, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearCuentaTx } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo, obtenerPeriodoActivo } from '../../src/modulos/periodos/crear-periodo.js';
import { consultarDisponible } from '../../src/modulos/disponible/consultar-disponible.js';
import { aportarAMeta, crearMeta } from '../../src/modulos/metas/metas.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { conTenant } from '../../src/shared/db.js';

describe('consultarDisponible (motor de flujo de caja)', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-disponible-${randomUUID()}`);
    return tenantId;
  }

  it('sin periodo activo, devuelve null (nada que calcular)', async () => {
    const tenantId = await tenantNuevo();
    expect(await consultarDisponible(tenantId)).toBeNull();
  });

  // --- 1. Caso sin_ingreso: sin cifra inventada, no un $0 disfrazado ---

  it('periodo activo sin ingreso -> estado sin_ingreso, sin campos numéricos', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    const resultado = await consultarDisponible(tenantId, new Date('2026-08-05T00:00:00Z'));

    expect(resultado?.estado).toBe('sin_ingreso');
    expect(resultado?.periodoId).toBe(periodo.id);
    // No es que valgan 0: las propiedades no existen en absoluto en la
    // rama sin_ingreso (el tipo Disponible las excluye a nivel de TS).
    expect(resultado).not.toHaveProperty('disponibleValorMinimo');
    expect(resultado).not.toHaveProperty('cifraDiariaValorMinimo');
  });

  it('sigue en sin_ingreso aunque ya haya gastos registrados (el ingreso es lo que falta, no el movimiento)', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 500n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const resultado = await consultarDisponible(tenantId, new Date('2026-08-05T00:00:00Z'));

    expect(resultado?.estado).toBe('sin_ingreso');
  });

  // --- 2. Piso (floor) en la cifra diaria, con división inexacta ---

  it('cifra diaria: división inexacta trunca hacia abajo (piso), no redondea', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 3000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    // fechaFin = 2026-08-15, "hoy" = 2026-08-09 -> 7 días restantes.
    // 3000 / 7 = 428.571...; el piso es 428, nunca 429.
    const resultado = await consultarDisponible(tenantId, new Date('2026-08-09T00:00:00Z'));

    expect(resultado?.estado).toBe('ok');
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');
    expect(resultado.disponibleValorMinimo).toBe(3000n);
    expect(resultado.diasRestantes).toBe(7);
    expect(resultado.cifraDiariaValorMinimo).toBe(428n);
  });

  it('sobregiro: disponible negativo, cifra diaria negativa con el piso correcto (no truncada hacia cero)', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 6000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    // disponible = 1000 - 6000 = -5000; con 7 días restantes,
    // -5000 / 7 = -714.285... -> piso -715 (no -714, que sería truncar
    // hacia cero y subestimar el sobregiro).
    const resultado = await consultarDisponible(tenantId, new Date('2026-08-09T00:00:00Z'));

    expect(resultado?.estado).toBe('ok');
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');
    expect(resultado.disponibleValorMinimo).toBe(-5000n);
    expect(resultado.cifraDiariaValorMinimo).toBe(-715n);
  });

  // --- 3. El +1 en días restantes, el último día del periodo ---

  it('el último día del periodo da diasRestantes = 1, no 0 ni un error de división', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 700n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    // fechaFin del periodo es 2026-08-15; "hoy" es ese mismo día.
    const resultado = await consultarDisponible(tenantId, new Date('2026-08-15T00:00:00Z'));

    expect(resultado?.estado).toBe('ok');
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');
    expect(resultado.diasRestantes).toBe(1);
    expect(resultado.cifraDiariaValorMinimo).toBe(700n);
  });

  // --- 4. Se recalcula en cada llamada; nada queda almacenado ---

  it('dos consultas con distinta fecha de referencia, mismo estado del ledger, dan cifras distintas', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1400n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const dia1 = await consultarDisponible(tenantId, new Date('2026-08-01T00:00:00Z')); // 15 días restantes
    const dia8 = await consultarDisponible(tenantId, new Date('2026-08-08T00:00:00Z')); // 8 días restantes

    if (dia1?.estado !== 'ok' || dia8?.estado !== 'ok') throw new Error('esperaba estado ok en ambas');

    // Mismo disponible (nada se escribió entre una consulta y otra):
    // la diferencia viene solo de la fecha, no de un valor cacheado.
    expect(dia1.disponibleValorMinimo).toBe(1400n);
    expect(dia8.disponibleValorMinimo).toBe(1400n);
    expect(dia1.diasRestantes).toBe(15);
    expect(dia8.diasRestantes).toBe(8);
    expect(dia1.cifraDiariaValorMinimo).not.toBe(dia8.cifraDiariaValorMinimo);
  });

  it('un gasto registrado entre dos consultas cambia la siguiente lectura de inmediato', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const antes = await consultarDisponible(tenantId, new Date('2026-08-05T00:00:00Z'));
    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 300n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-05',
      fechaReferencia: new Date('2026-08-05T00:00:00Z'),
    });
    const despues = await consultarDisponible(tenantId, new Date('2026-08-05T00:00:00Z'));

    if (antes?.estado !== 'ok' || despues?.estado !== 'ok') throw new Error('esperaba estado ok en ambas');
    expect(antes.disponibleValorMinimo).toBe(1000n);
    expect(despues.disponibleValorMinimo).toBe(700n);
  });

  // --- 5. El objetivo de "hoy" es fijo — no se vuelve a repartir dentro del mismo día ---

  it('gastar exactamente el objetivo sugerido de hoy deja cifraDiaria en 0, no la redistribuye a otro número', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-07T00:00:00Z'); // fechaFin=08-15 -> 9 días restantes
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });

    // objetivo = piso(5000 / 9) = 555
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 555n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(4445n);
    expect(resultado.gastadoHoyValorMinimo).toBe(555n);
    // Con la fórmula anterior (disponible / díasRestantes sin excluir
    // hoy) esto habría dado piso(4445/9) = 493 — bajando la cifra de
    // hoy en la misma consulta en la que se cumplió exactamente el
    // objetivo. El objetivo fijo da 0: "ya usaste lo de hoy", ni más ni menos.
    expect(resultado.cifraDiariaValorMinimo).toBe(0n);
  });

  it('un sobregiro grande el mismo día se ve como negativo completo, no como un residuo positivo que lo esconde', async () => {
    // Reproduce el caso real reportado: disponible total sigue viéndose
    // positivo y modesto después del sobregiro, pero "puedes gastar
    // hoy" debe reflejar el tamaño real de lo excedido, no un número
    // positivo pequeño que sugiere que todavía hay margen.
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-07T00:00:00Z'); // 9 días restantes
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 555n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 4000n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    // Disponible total sigue positivo (5000 - 555 - 4000 = 445) — este
    // número siempre fue correcto, nunca fue el problema.
    expect(resultado.disponibleValorMinimo).toBe(445n);
    expect(resultado.gastadoHoyValorMinimo).toBe(4555n);
    // Con la fórmula anterior esto habría dado piso(445/9) = 49 — un
    // positivo pequeño que sugiere "todavía puedes gastar algo hoy",
    // ocultando que ya te excediste por 4000. El objetivo fijo (555)
    // menos lo gastado (4555) da el tamaño real del exceso.
    expect(resultado.cifraDiariaValorMinimo).toBe(-4000n);
  });

  it('revertir un gasto el mismo día que se registró regresa cifraDiaria a su objetivo completo', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-07T00:00:00Z'); // 9 días restantes
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-07', fechaReferencia: hoy });
    const { id: gastoId } = await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 2000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-07',
      fechaReferencia: hoy,
    });

    await eliminarGasto({ tenantId, gastoId, fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    // El gasto y su reversión son del mismo día: el neto de hoy vuelve a
    // ser 0, así que no debe quedar ninguna resta fantasma.
    expect(resultado.disponibleValorMinimo).toBe(5000n);
    expect(resultado.gastadoHoyValorMinimo).toBe(0n);
    expect(resultado.cifraDiariaValorMinimo).toBe(555n); // piso(5000/9), objetivo completo
  });

  it('hallazgo real: corregir la fecha de un gasto mal capturado hoy (en realidad fue ayer) hace que deje de contar como gastado hoy', async () => {
    // El caso reportado: un gasto de $289.12 se capturó anoche cerca de
    // las 9-10pm y, por el bug de zona horaria (ver shared/fechas.ts),
    // quedó guardado con la fecha de hoy en vez de la de ayer. Se
    // corrige hoy mismo con editarGasto + fechaEfectiva de ayer.
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-09-16T00:00:00Z'));
    const hoy = new Date('2026-09-17T00:00:00Z'); // 14 días restantes
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 500000n, moneda: 'MXN', fechaEfectiva: '2026-09-16', fechaReferencia: hoy });
    const { id: gastoId } = await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 28912n,
      moneda: 'MXN',
      fechaEfectiva: '2026-09-17', // mal fechado por el bug — en realidad fue ayer
      fechaReferencia: hoy,
    });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 10800n, moneda: 'MXN', fechaEfectiva: '2026-09-17', fechaReferencia: hoy });

    await editarGasto({ tenantId, gastoId, monto: 28912n, moneda: 'MXN', fechaEfectiva: '2026-09-16', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    // El disponible total sigue reflejando ambos gastos reales
    // (500000 - 28912 - 10800), pero "gastado hoy" ya solo ve el de
    // $108 real de hoy — el de $289.12, ahora fechado ayer, ya no
    // aparece en el corte de hoy.
    expect(resultado.disponibleValorMinimo).toBe(460288n);
    expect(resultado.gastadoHoyValorMinimo).toBe(10800n);
  });

  it('gastar de más hoy sí baja la cifra del día siguiente — la redistribución ocurre entre días, no dentro del mismo día', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const dia1 = new Date('2026-08-01T00:00:00Z'); // 15 días restantes, objetivo = piso(5000/15) = 333
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: dia1 });
    // Gasta mucho más que el objetivo de hoy (333).
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: dia1 });

    const dia2 = new Date('2026-08-02T00:00:00Z'); // 14 días restantes, sin gastos nuevos
    const resultado = await consultarDisponible(tenantId, dia2);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    // disponible = 5000 - 1000 = 4000; objetivo de hoy = piso(4000/14) = 285,
    // menor que los 333 de ayer — la compensación sí llegó, un día después.
    expect(resultado.disponibleValorMinimo).toBe(4000n);
    expect(resultado.gastadoHoyValorMinimo).toBe(0n);
    expect(resultado.cifraDiariaValorMinimo).toBe(285n);
  });

  it('editar un ingreso el mismo día NO cuenta como gastado hoy (bug real: su reversión se confundía con un gasto)', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-01T00:00:00Z'); // 15 días restantes
    const { id: ingresoId } = await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 5000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: hoy,
    });

    await editarIngreso({ tenantId, ingresoId, monto: 6000n, moneda: 'MXN', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    // La edición genera una reversión de -5000 más un ingreso nuevo de
    // +6000 — ninguna de las dos es un gasto. `gastadoHoy` debe seguir
    // en 0, no interpretar la reversión del ingreso como si fuera gasto.
    expect(resultado.disponibleValorMinimo).toBe(6000n);
    expect(resultado.gastadoHoyValorMinimo).toBe(0n);
    expect(resultado.cifraDiariaValorMinimo).toBe(400n); // piso(6000/15)
  });

  it('eliminar un ingreso el mismo día tampoco cuenta como gastado hoy', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-01T00:00:00Z');
    const { id: ingresoUno } = await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 5000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: hoy,
    });
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 3000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: hoy });

    await eliminarIngreso({ tenantId, ingresoId: ingresoUno, fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(3000n);
    expect(resultado.gastadoHoyValorMinimo).toBe(0n);
  });

  it('un gasto real el mismo día que una edición de ingreso sí cuenta como gastado hoy (la corrección de ingreso no lo tapa)', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-01T00:00:00Z');
    const { id: ingresoId } = await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 5000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: hoy,
    });
    await editarIngreso({ tenantId, ingresoId, monto: 6000n, moneda: 'MXN', fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 555n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(5445n); // 6000 - 555
    expect(resultado.gastadoHoyValorMinimo).toBe(555n); // solo el gasto real, no la reversión del ingreso
  });

  it('un aporte a una meta el mismo día cuenta como gastado hoy (modelo-dominio.md §6: "se trata como un gasto más")', async () => {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const hoy = new Date('2026-08-01T00:00:00Z'); // 15 días restantes
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: hoy });
    const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

    await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(4700n); // 5000 - 300
    expect(resultado.gastadoHoyValorMinimo).toBe(300n);
    expect(resultado.cifraDiariaValorMinimo).toBe(33n); // objetivoHoy = piso(5000/15) = 333; 333 - 300 = 33
  });

  // --- 6. Bug real (cuenta de producción): un compromiso automático
  // materializado hoy no debe leerse como "el usuario se gastó esto hoy" ---

  it('un gasto recurrente materializado el mismo día en que se crea (periodo ya activo) baja el disponible pero NO cuenta como gastado hoy', async () => {
    const tenantId = await tenantNuevo();
    const hoy = new Date('2026-08-16T00:00:00Z'); // quincena 16-31 de agosto, 16 días restantes
    const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 7300n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: hoy });

    // Mismo caso exacto reportado por el usuario: recurrente mensual día
    // 17, creado hoy (día 16) con el periodo ya activo — se materializa
    // de inmediato (ver crearGastoRecurrente, recurrentes.ts).
    await crearGastoRecurrente({
      tenantId,
      descripcion: 'Renta',
      montoValorMinimo: 2000n,
      moneda: 'MXN',
      frecuencia: 'mensual',
      diaMes: 17,
      fechaReferencia: hoy,
    });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(5300n); // 7300 - 2000, ya descontado
    // Antes del fix: gastadoHoy incluía la renta -> "te excediste hoy por
    // $1,513" el mismo día en que se creó el recurrente, como si el
    // usuario hubiera elegido gastarse la renta completa en un día.
    expect(resultado.gastadoHoyValorMinimo).toBe(0n);
    expect(resultado.cifraDiariaValorMinimo).toBe(331n); // piso(5300/16), sin restarle la renta encima
  });

  it('un gasto manual el mismo día que un recurrente materializado sí cuenta como gastado hoy (el recurrente no tapa un gasto real)', async () => {
    const tenantId = await tenantNuevo();
    const hoy = new Date('2026-08-16T00:00:00Z');
    const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 7300n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: hoy });
    await crearGastoRecurrente({
      tenantId,
      descripcion: 'Renta',
      montoValorMinimo: 2000n,
      moneda: 'MXN',
      frecuencia: 'mensual',
      diaMes: 17,
      fechaReferencia: hoy,
    });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 300n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(5000n); // 7300 - 2000 - 300
    expect(resultado.gastadoHoyValorMinimo).toBe(300n); // solo el gasto manual, no la renta
  });

  it('una mensualidad de tarjeta (pago_tarjeta) materializada el mismo día en que se activa el periodo tampoco cuenta como gastado hoy', async () => {
    const tenantId = await tenantNuevo();
    const tarjeta = await crearTarjeta(tenantId, 'BBVA Oro', 1000000n, 'MXN', 15, 20);
    // Corte día 15, 20 días para pagar; compra 20-jul -> vence 4-sep, dentro de la quincena 1-15 de septiembre.
    await registrarCargoTarjeta({
      tenantId,
      tarjetaId: tarjeta.id,
      descripcion: 'Refrigerador',
      montoTotalValorMinimo: 900000n,
      moneda: 'MXN',
      numeroPlazos: 3,
      fechaCompra: '2026-07-20',
    });

    const periodoSeptiembre = await conTenant(tenantId, async (tx) => {
      const cuenta = await crearCuentaTx(tx, tenantId, 'periodo');
      const [fila] = await tx
        .insert(periodos)
        .values({ tenantId, cuentaId: cuenta.id, tipo: 'quincenal', estado: 'borrador', fechaInicio: '2026-09-01', fechaFin: '2026-09-15' })
        .returning();
      if (!fila) throw new Error('setup falló');
      return fila;
    });
    const hoy = new Date('2026-09-05T00:00:00Z');
    const activo = await obtenerPeriodoActivo(tenantId, hoy); // promueve el borrador y materializa el pago_tarjeta
    expect(activo?.id).toBe(periodoSeptiembre.id);
    await registrarIngreso({ tenantId, periodoId: periodoSeptiembre.id, monto: 500000n, moneda: 'MXN', fechaEfectiva: '2026-09-01', fechaReferencia: hoy });

    const resultado = await consultarDisponible(tenantId, hoy);
    if (resultado?.estado !== 'ok') throw new Error('esperaba estado ok');

    expect(resultado.disponibleValorMinimo).toBe(200000n); // 500000 - 300000 (mensualidad ya aplicada)
    expect(resultado.gastadoHoyValorMinimo).toBe(0n); // pago_tarjeta nunca es un gasto discrecional "de hoy"
  });
});
