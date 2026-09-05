import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resumenes } from '../../src/db/schema/cierre.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearPeriodo, obtenerPeriodoActivo, obtenerPeriodoPorId } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente, DIAS_DEFAULT_ARRASTRE } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { conTenant } from '../../src/shared/db.js';

describe('cierre', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-cierre-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

  async function leerResumen(tenantId: string, periodoId: string) {
    return conTenant(tenantId, async (tx) => {
      const [fila] = await tx
        .select()
        .from(resumenes)
        .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodoId)))
        .limit(1);
      return fila ?? null;
    });
  }

  // --- Cierre manual (necesario para ejercer el ciclo sin esperar 15 días reales) ---

  it('cierra un periodo activo manualmente y genera su resumen con sobrante positivo', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    const hoy = new Date('2026-08-01T00:00:00Z');
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 3000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 1200n, moneda: 'MXN', fechaEfectiva: '2026-08-02', fechaReferencia: hoy });

    const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    expect(resumen.totalIngresosValorMinimo).toBe(3000n);
    expect(resumen.totalGastadoValorMinimo).toBe(1200n);
    expect(resumen.sobranteValorMinimo).toBe(1800n);
    expect(resumen.decisionSobrante).toBe('pendiente');
    expect(resumen.decisionSobranteFecha).toBeNull();

    const periodoActualizado = await obtenerPeriodoPorId(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
    expect(periodoActualizado?.estado).toBe('cerrado');
  });

  it('déficit: arrastre automático, sin quedar pendiente de decisión', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    const hoyDeficit = new Date('2026-08-01T00:00:00Z');
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: hoyDeficit,
    });
    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 6000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      fechaReferencia: hoyDeficit,
    });

    const fechaCierre = new Date('2026-08-10T00:00:00Z');
    const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, fechaCierre);

    expect(resumen.sobranteValorMinimo).toBe(-5000n);
    expect(resumen.decisionSobrante).toBe('arrastrado');
    expect(resumen.decisionSobranteFecha).toEqual(fechaCierre);
  });

  it('cerrar dos veces es idempotente: devuelve el mismo resumen, no genera otro', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 500n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const primero = await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
    const segundo = await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-12T00:00:00Z'));

    expect(segundo.id).toBe(primero.id);
    expect(segundo.generadoEn).toEqual(primero.generadoEn);
  });

  it('rechaza cerrar un periodo en borrador', async () => {
    const { tenantId } = await tenantConPeriodoActivo(); // deja uno activo
    const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    expect(segundo.estado).toBe('borrador');

    await expect(cerrarPeriodoManualmente(tenantId, segundo.id)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ACTIVO' });
  });

  it('rechaza cerrar un periodo inexistente', async () => {
    const { tenantId } = await tenantConPeriodoActivo();
    await expect(cerrarPeriodoManualmente(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('rechaza cerrar el periodo activo de OTRO tenant como si no existiera (RLS, no un caso especial)', async () => {
    const { periodo: periodoDeB } = await tenantConPeriodoActivo();
    const { tenantId: tenantA } = await tenantConPeriodoActivo();

    await expect(cerrarPeriodoManualmente(tenantA, periodoDeB.id)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  // --- Cierre perezoso (lo que vuelve redundante el tope de disponible) ---

  it('un periodo vencido se cierra solo al consultarlo, sin llamar a cerrarPeriodoManualmente', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo(); // fin = 2026-08-15
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 700n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const despuesDeVencer = new Date('2026-08-20T00:00:00Z');

    expect(await obtenerPeriodoActivo(tenantId, despuesDeVencer)).toBeNull();

    const periodoActualizado = await obtenerPeriodoPorId(tenantId, periodo.id, despuesDeVencer);
    expect(periodoActualizado?.estado).toBe('cerrado');

    const resumen = await leerResumen(tenantId, periodo.id);
    expect(resumen).not.toBeNull();
    expect(resumen?.generadoEn.toISOString()).toBe(despuesDeVencer.toISOString());
  });

  it('crear un periodo nuevo cierra primero el vencido: el nuevo nace activo, no en borrador', async () => {
    const { tenantId } = await tenantConPeriodoActivo(); // fin = 2026-08-15, sigue "activo" en la fila

    const nuevo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-20T00:00:00Z'));

    expect(nuevo.estado).toBe('activo');
  });

  // --- Decisión explícita del sobrante ---

  it('"ahorrar" no está soportado: requiere el módulo de metas', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    await expect(decidirSobrante(tenantId, periodo.id, 'ahorrar')).rejects.toMatchObject({ codigo: 'NO_SOPORTADO' });
  });

  it('decide arrastrar un sobrante positivo pendiente', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    const resultado = await decidirSobrante(tenantId, periodo.id, 'arrastrar');

    expect(resultado).toEqual({ periodoId: periodo.id, decision: 'arrastrado', montoAplicadoValorMinimo: 1000n });

    const resumen = await leerResumen(tenantId, periodo.id);
    expect(resumen?.decisionSobrante).toBe('arrastrado');
    expect(resumen?.decisionSobranteFecha).not.toBeNull();
  });

  it('rechaza decidir dos veces sobre el mismo sobrante', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    await decidirSobrante(tenantId, periodo.id, 'arrastrar');

    await expect(decidirSobrante(tenantId, periodo.id, 'arrastrar')).rejects.toMatchObject({ codigo: 'SOBRANTE_YA_DECIDIDO' });
  });

  it('rechaza decidir sobre un déficit ya auto-decidido', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 100n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 5000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    await expect(decidirSobrante(tenantId, periodo.id, 'arrastrar')).rejects.toMatchObject({ codigo: 'SOBRANTE_YA_DECIDIDO' });
  });

  it('rechaza decidir sobre el periodo cerrado de OTRO tenant como si no existiera', async () => {
    const { tenantId: tenantB, periodo: periodoB } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId: tenantB,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantB, periodoB.id, new Date('2026-08-10T00:00:00Z'));

    const { tenantId: tenantA } = await tenantConPeriodoActivo();

    await expect(decidirSobrante(tenantA, periodoB.id, 'arrastrar')).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  // --- Barrido de N días (default sin decisión) ---

  it(`un sobrante pendiente por más de ${DIAS_DEFAULT_ARRASTRE} días se arrastra solo, sin acción del usuario`, async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const fechaCierre = new Date('2026-08-10T00:00:00Z');
    await cerrarPeriodoManualmente(tenantId, periodo.id, fechaCierre);

    const dentroDelPlazo = new Date(fechaCierre.getTime() + (DIAS_DEFAULT_ARRASTRE - 1) * 86_400_000);
    await obtenerPeriodoActivo(tenantId, dentroDelPlazo); // dispara resolverPendientesTx
    expect((await leerResumen(tenantId, periodo.id))?.decisionSobrante).toBe('pendiente');

    const fueraDelPlazo = new Date(fechaCierre.getTime() + (DIAS_DEFAULT_ARRASTRE + 1) * 86_400_000);
    await obtenerPeriodoActivo(tenantId, fueraDelPlazo);
    expect((await leerResumen(tenantId, periodo.id))?.decisionSobrante).toBe('arrastrado');
  });

  // --- Inmutabilidad ---

  it('un resumen no se puede eliminar', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 100n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`delete from resumenes where periodo_id = ${periodo.id}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
  });

  it('un UPDATE que no decide nada (decision_sobrante sigue pendiente) se rechaza', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 100n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    // No toca decision_sobrante en absoluto: sigue 'pendiente' antes y
    // después. Esto casi coló un bug real — comparar solo new <> old no
    // distingue "sigue pendiente" de "volvió a pendiente"; el trigger
    // exige un destino explícito (ahorrado/arrastrado), no la ausencia
    // de cambio.
    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`update resumenes set total_ingresos_valor_minimo = 999999 where periodo_id = ${periodo.id}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/no es una transición válida desde pendiente/) } });
  });

  it('no se puede alterar un monto ya generado, ni siquiera junto con una decisión válida', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 100n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

    await expect(
      conTenant(tenantId, (tx) =>
        tx.execute(sql`
          update resumenes
          set decision_sobrante = 'arrastrado', decision_sobrante_fecha = now(), total_ingresos_valor_minimo = 999999
          where periodo_id = ${periodo.id}
        `)
      )
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/Solo decision_sobrante/) } });
  });

  it('un resumen ya decidido no se puede modificar de ninguna forma, ni siquiera intentar volverlo a pendiente', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 100n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
    await decidirSobrante(tenantId, periodo.id, 'arrastrar');

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`update resumenes set decision_sobrante = 'pendiente' where periodo_id = ${periodo.id}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/ya tiene una decisión de sobrante/) } });
  });
});
