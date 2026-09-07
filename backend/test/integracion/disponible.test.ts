import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { eliminarGasto, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { consultarDisponible } from '../../src/modulos/disponible/consultar-disponible.js';

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
});
