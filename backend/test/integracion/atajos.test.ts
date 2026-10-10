import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants, type Plan } from '../../src/db/schema/tenants.js';
import { actualizarAtajo, crearAtajo, eliminarAtajo, LIMITE_ATAJOS_FREE, LIMITE_ATAJOS_PRO, listarAtajos } from '../../src/modulos/atajos/atajos.js';
import { crearCategoriaPersonalizada, eliminarCategoria, listarCategorias } from '../../src/modulos/categorias/categorias.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { conTenant } from '../../src/shared/db.js';

describe('atajos de gasto', () => {
  async function tenantDePrueba() {
    const { tenantId } = await resolverOcrearIdentidad(`test-atajos-${randomUUID()}`);
    return tenantId;
  }

  async function establecerPlan(tenantId: string, plan: Plan) {
    return conTenant(tenantId, (tx) => tx.update(tenants).set({ plan }).where(eq(tenants.id, tenantId)));
  }

  const cafe = (tenantId: string, extra: Partial<Parameters<typeof crearAtajo>[0]> = {}) =>
    crearAtajo({ tenantId, nombre: 'Café', montoValorMinimo: 5500n, moneda: 'MXN', ...extra });

  describe('crearAtajo / listarAtajos', () => {
    it('crea un atajo y lo lista, con el límite del plan', async () => {
      const tenantId = await tenantDePrueba();
      const atajo = await cafe(tenantId);

      expect(atajo).toMatchObject({ nombre: 'Café', montoValorMinimo: 5500n, moneda: 'MXN', categoriaId: null });
      const lista = await listarAtajos(tenantId);
      expect(lista.atajos).toEqual([atajo]);
      expect(lista.limite).toBe(LIMITE_ATAJOS_FREE);
    });

    it('sin atajos, la lista está vacía', async () => {
      const tenantId = await tenantDePrueba();

      expect((await listarAtajos(tenantId)).atajos).toEqual([]);
    });

    it('los lista en el orden en que se crearon', async () => {
      const tenantId = await tenantDePrueba();
      await cafe(tenantId, { nombre: 'Uno' });
      await cafe(tenantId, { nombre: 'Dos' });
      await cafe(tenantId, { nombre: 'Tres' });

      expect((await listarAtajos(tenantId)).atajos.map((a) => a.nombre)).toEqual(['Uno', 'Dos', 'Tres']);
    });

    it('guarda la categoría elegida', async () => {
      const tenantId = await tenantDePrueba();
      const comida = (await listarCategorias(tenantId)).find((c) => c.nombre === 'Comida')!;

      const atajo = await cafe(tenantId, { categoriaId: comida.id });

      expect(atajo.categoriaId).toBe(comida.id);
    });

    it('limpia los espacios del nombre', async () => {
      const tenantId = await tenantDePrueba();

      expect((await cafe(tenantId, { nombre: '  Café  ' })).nombre).toBe('Café');
    });

    it('rechaza un nombre vacío, uno demasiado largo y un monto no positivo', async () => {
      const tenantId = await tenantDePrueba();

      await expect(cafe(tenantId, { nombre: '   ' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(cafe(tenantId, { nombre: 'x'.repeat(31) })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(cafe(tenantId, { montoValorMinimo: 0n })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(cafe(tenantId, { montoValorMinimo: -100n })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      expect((await listarAtajos(tenantId)).atajos).toEqual([]);
    });

    it('rechaza un nombre repetido (aunque traiga espacios alrededor)', async () => {
      const tenantId = await tenantDePrueba();
      await cafe(tenantId);

      await expect(cafe(tenantId, { nombre: ' Café ' })).rejects.toMatchObject({ codigo: 'VALIDACION', message: expect.stringContaining('Café') });
    });

    it('rechaza una categoría que no existe o que es de otra persona', async () => {
      const tenantId = await tenantDePrueba();
      const otro = await tenantDePrueba();
      const ajena = (await listarCategorias(otro))[0]!;

      await expect(cafe(tenantId, { categoriaId: randomUUID() })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
      await expect(cafe(tenantId, { categoriaId: ajena.id })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
      await expect(cafe(tenantId, { categoriaId: 'no-es-uuid' })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });
  });

  describe('límites por plan', () => {
    it(`free: deja crear ${LIMITE_ATAJOS_FREE} y rechaza el siguiente con LIMITE_ATAJOS_ALCANZADO`, async () => {
      const tenantId = await tenantDePrueba();
      for (let i = 1; i <= LIMITE_ATAJOS_FREE; i++) await cafe(tenantId, { nombre: `Atajo ${i}` });

      await expect(cafe(tenantId, { nombre: 'Uno de más' })).rejects.toMatchObject({ codigo: 'LIMITE_ATAJOS_ALCANZADO' });
      expect((await listarAtajos(tenantId)).atajos).toHaveLength(LIMITE_ATAJOS_FREE);
    });

    it('free: el mensaje no promete contratar Pro mientras los cobros están apagados', async () => {
      const tenantId = await tenantDePrueba();
      for (let i = 1; i <= LIMITE_ATAJOS_FREE; i++) await cafe(tenantId, { nombre: `Atajo ${i}` });

      const error = await cafe(tenantId, { nombre: 'Otro' }).catch((e: Error) => e);

      expect((error as Error).message).toContain('llegarán con Korly Pro');
    });

    it(`pro: llega hasta ${LIMITE_ATAJOS_PRO} y rechaza el siguiente`, async () => {
      const tenantId = await tenantDePrueba();
      await establecerPlan(tenantId, 'pro');
      for (let i = 1; i <= LIMITE_ATAJOS_PRO; i++) await cafe(tenantId, { nombre: `Atajo ${i}` });

      expect((await listarAtajos(tenantId)).limite).toBe(LIMITE_ATAJOS_PRO);
      await expect(cafe(tenantId, { nombre: 'Uno de más' })).rejects.toMatchObject({ codigo: 'LIMITE_ATAJOS_ALCANZADO' });
    });

    it('quien baja de Pro a Free conserva sus atajos pero no puede crear más hasta quedar debajo del tope', async () => {
      const tenantId = await tenantDePrueba();
      await establecerPlan(tenantId, 'pro');
      const creados = [];
      for (let i = 1; i <= LIMITE_ATAJOS_FREE + 2; i++) creados.push(await cafe(tenantId, { nombre: `Atajo ${i}` }));
      await establecerPlan(tenantId, 'free');

      expect((await listarAtajos(tenantId)).atajos).toHaveLength(LIMITE_ATAJOS_FREE + 2);
      await expect(cafe(tenantId, { nombre: 'Nuevo' })).rejects.toMatchObject({ codigo: 'LIMITE_ATAJOS_ALCANZADO' });

      // Editar los que ya tiene sigue permitido.
      await expect(actualizarAtajo({ tenantId, id: creados[0]!.id, nombre: 'Renombrado' })).resolves.toMatchObject({ nombre: 'Renombrado' });

      // Y al quedar por debajo del tope, vuelve a poder crear.
      for (const atajo of creados.slice(0, 3)) await eliminarAtajo(tenantId, atajo.id);
      await expect(cafe(tenantId, { nombre: 'Nuevo' })).resolves.toMatchObject({ nombre: 'Nuevo' });
    });

    it('eliminar uno libera el lugar', async () => {
      const tenantId = await tenantDePrueba();
      const primero = await cafe(tenantId, { nombre: 'Atajo 1' });
      for (let i = 2; i <= LIMITE_ATAJOS_FREE; i++) await cafe(tenantId, { nombre: `Atajo ${i}` });
      await eliminarAtajo(tenantId, primero.id);

      await expect(cafe(tenantId, { nombre: 'Nuevo' })).resolves.toMatchObject({ nombre: 'Nuevo' });
    });
  });

  describe('actualizarAtajo', () => {
    it('cambia solo lo que se manda', async () => {
      const tenantId = await tenantDePrueba();
      const comida = (await listarCategorias(tenantId)).find((c) => c.nombre === 'Comida')!;
      const atajo = await cafe(tenantId, { categoriaId: comida.id });

      const nuevoMonto = await actualizarAtajo({ tenantId, id: atajo.id, montoValorMinimo: 6000n, moneda: 'MXN' });
      expect(nuevoMonto).toMatchObject({ nombre: 'Café', montoValorMinimo: 6000n, categoriaId: comida.id });

      const nuevoNombre = await actualizarAtajo({ tenantId, id: atajo.id, nombre: 'Café grande' });
      expect(nuevoNombre).toMatchObject({ nombre: 'Café grande', montoValorMinimo: 6000n, categoriaId: comida.id });
    });

    it('null quita la categoría; sin mandarla, la conserva', async () => {
      const tenantId = await tenantDePrueba();
      const comida = (await listarCategorias(tenantId)).find((c) => c.nombre === 'Comida')!;
      const atajo = await cafe(tenantId, { categoriaId: comida.id });

      expect((await actualizarAtajo({ tenantId, id: atajo.id })).categoriaId).toBe(comida.id);
      expect((await actualizarAtajo({ tenantId, id: atajo.id, categoriaId: null })).categoriaId).toBeNull();
    });

    it('valida igual que al crear: nombre vacío, monto no positivo, nombre repetido, categoría ajena', async () => {
      const tenantId = await tenantDePrueba();
      const otro = await tenantDePrueba();
      const ajena = (await listarCategorias(otro))[0]!;
      const atajo = await cafe(tenantId);
      await cafe(tenantId, { nombre: 'Otro' });

      await expect(actualizarAtajo({ tenantId, id: atajo.id, nombre: ' ' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(actualizarAtajo({ tenantId, id: atajo.id, montoValorMinimo: 0n })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(actualizarAtajo({ tenantId, id: atajo.id, nombre: 'Otro' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(actualizarAtajo({ tenantId, id: atajo.id, categoriaId: ajena.id })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });

    it('un atajo que no existe (o con un id mal formado) da ATAJO_NO_ENCONTRADO', async () => {
      const tenantId = await tenantDePrueba();

      await expect(actualizarAtajo({ tenantId, id: randomUUID(), nombre: 'X' })).rejects.toMatchObject({ codigo: 'ATAJO_NO_ENCONTRADO' });
      await expect(actualizarAtajo({ tenantId, id: 'no-es-uuid', nombre: 'X' })).rejects.toMatchObject({ codigo: 'ATAJO_NO_ENCONTRADO' });
    });
  });

  describe('eliminarAtajo', () => {
    it('elimina de verdad el atajo', async () => {
      const tenantId = await tenantDePrueba();
      const atajo = await cafe(tenantId);

      await eliminarAtajo(tenantId, atajo.id);

      expect((await listarAtajos(tenantId)).atajos).toEqual([]);
      await expect(eliminarAtajo(tenantId, atajo.id)).rejects.toMatchObject({ codigo: 'ATAJO_NO_ENCONTRADO' });
    });
  });

  describe('aislamiento entre personas', () => {
    it('cada quien ve solo los suyos; no puede editar ni borrar el atajo de otra persona', async () => {
      const ana = await tenantDePrueba();
      const beto = await tenantDePrueba();
      const deAna = await cafe(ana);

      expect((await listarAtajos(beto)).atajos).toEqual([]);
      await expect(actualizarAtajo({ tenantId: beto, id: deAna.id, nombre: 'Mío' })).rejects.toMatchObject({ codigo: 'ATAJO_NO_ENCONTRADO' });
      await expect(eliminarAtajo(beto, deAna.id)).rejects.toMatchObject({ codigo: 'ATAJO_NO_ENCONTRADO' });
      expect((await listarAtajos(ana)).atajos).toEqual([deAna]);
    });

    it('el límite se cuenta por persona: los atajos de una no gastan los de otra', async () => {
      const ana = await tenantDePrueba();
      const beto = await tenantDePrueba();
      for (let i = 1; i <= LIMITE_ATAJOS_FREE; i++) await cafe(ana, { nombre: `Atajo ${i}` });

      await expect(cafe(beto)).resolves.toMatchObject({ nombre: 'Café' });
    });
  });

  describe('al eliminar una categoría', () => {
    it('el atajo se queda, solo sin categoría (la categoría ya no existe)', async () => {
      const tenantId = await tenantDePrueba();
      const propia = await crearCategoriaPersonalizada(tenantId, 'Cafetería');
      const atajo = await cafe(tenantId, { categoriaId: propia.id });

      await eliminarCategoria(tenantId, propia.id);

      const { atajos } = await listarAtajos(tenantId);
      expect(atajos).toHaveLength(1);
      expect(atajos[0]).toMatchObject({ id: atajo.id, nombre: 'Café', categoriaId: null });
    });
  });
});
