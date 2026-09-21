import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { actualizarCategoria, crearCategoriaPersonalizada, eliminarCategoria, listarCategorias } from '../../src/modulos/categorias/categorias.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';

describe('categorías', () => {
  async function tenantDePrueba() {
    const { tenantId } = await resolverOcrearIdentidad(`test-categorias-${randomUUID()}`);
    return tenantId;
  }

  describe('listarCategorias', () => {
    it('un tenant nuevo ya tiene las categorías predeterminadas sembradas', async () => {
      const tenantId = await tenantDePrueba();

      const categorias = await listarCategorias(tenantId);

      expect(categorias.length).toBe(10);
      expect(categorias.every((c) => c.esPredeterminada)).toBe(true);
      expect(categorias.map((c) => c.nombre)).toContain('Comida');
      expect(categorias.map((c) => c.nombre)).toContain('Otros');
    });

    it('las predeterminadas ya traen un ícono razonable, no null', async () => {
      const tenantId = await tenantDePrueba();
      const categorias = await listarCategorias(tenantId);

      const comida = categorias.find((c) => c.nombre === 'Comida');
      const otros = categorias.find((c) => c.nombre === 'Otros');
      expect(comida?.icono).toBe('comida');
      expect(otros?.icono).toBe('otros');
    });

    it('predeterminadas primero, alfabético dentro de cada grupo', async () => {
      const tenantId = await tenantDePrueba();
      await crearCategoriaPersonalizada(tenantId, 'Mascota');
      await crearCategoriaPersonalizada(tenantId, 'Gimnasio');

      const categorias = await listarCategorias(tenantId);

      const personalizadas = categorias.filter((c) => !c.esPredeterminada);
      expect(personalizadas.map((c) => c.nombre)).toEqual(['Gimnasio', 'Mascota']);
      // Todas las predeterminadas aparecen antes que cualquier personalizada.
      const primerPersonalizadaIdx = categorias.findIndex((c) => !c.esPredeterminada);
      expect(categorias.slice(0, primerPersonalizadaIdx).every((c) => c.esPredeterminada)).toBe(true);
    });
  });

  describe('crearCategoriaPersonalizada', () => {
    it('crea una categoría personalizada', async () => {
      const tenantId = await tenantDePrueba();

      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');

      expect(categoria.nombre).toBe('Mascota');
      expect(categoria.esPredeterminada).toBe(false);
    });

    it('recorta espacios del nombre', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, '  Mascota  ');
      expect(categoria.nombre).toBe('Mascota');
    });

    it('rechaza un nombre vacío', async () => {
      const tenantId = await tenantDePrueba();
      await expect(crearCategoriaPersonalizada(tenantId, '   ')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('rechaza un nombre duplicado para el mismo tenant', async () => {
      const tenantId = await tenantDePrueba();
      await crearCategoriaPersonalizada(tenantId, 'Mascota');
      await expect(crearCategoriaPersonalizada(tenantId, 'Mascota')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('el mismo nombre sí se permite en tenants distintos', async () => {
      const tenantA = await tenantDePrueba();
      const tenantB = await tenantDePrueba();
      await crearCategoriaPersonalizada(tenantA, 'Mascota');
      await expect(crearCategoriaPersonalizada(tenantB, 'Mascota')).resolves.toMatchObject({ nombre: 'Mascota' });
    });

    it('rechaza pasar el límite de categorías personalizadas', async () => {
      const tenantId = await tenantDePrueba();
      for (let i = 0; i < 30; i++) {
        await crearCategoriaPersonalizada(tenantId, `Personalizada ${i}`);
      }

      await expect(crearCategoriaPersonalizada(tenantId, 'Una de más')).rejects.toMatchObject({
        codigo: 'LIMITE_CATEGORIAS_ALCANZADO',
      });
    });

    it('acepta un ícono del set válido', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota', 'mascotas');
      expect(categoria.icono).toBe('mascotas');
    });

    it('sin ícono, queda en null (el cliente cae al emparejamiento por palabra clave)', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      expect(categoria.icono).toBeNull();
    });

    it('rechaza un ícono fuera del set válido', async () => {
      const tenantId = await tenantDePrueba();
      await expect(crearCategoriaPersonalizada(tenantId, 'Mascota', 'no-existe')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });
  });

  describe('actualizarCategoria', () => {
    it('cambia el ícono de una categoría personalizada', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');

      const actualizada = await actualizarCategoria(tenantId, categoria.id, { icono: 'mascotas' });

      expect(actualizada.icono).toBe('mascotas');
    });

    it('también aplica a una predeterminada — es cosmético, no choca con "no se puede eliminar"', async () => {
      const tenantId = await tenantDePrueba();
      const categorias = await listarCategorias(tenantId);
      const comida = categorias.find((c) => c.nombre === 'Comida');

      const actualizada = await actualizarCategoria(tenantId, comida!.id, { icono: 'otros' });

      expect(actualizada.icono).toBe('otros');
      expect(actualizada.nombre).toBe('Comida');
      expect(actualizada.esPredeterminada).toBe(true);
    });

    it('null quita el ícono elegido', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota', 'mascotas');

      const actualizada = await actualizarCategoria(tenantId, categoria.id, { icono: null });

      expect(actualizada.icono).toBeNull();
    });

    it('rechaza un ícono fuera del set válido', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      await expect(actualizarCategoria(tenantId, categoria.id, { icono: 'no-existe' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('cambia el nombre de una categoría personalizada', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');

      const actualizada = await actualizarCategoria(tenantId, categoria.id, { nombre: 'Mascotas y veterinario' });

      expect(actualizada.nombre).toBe('Mascotas y veterinario');
    });

    it('también deja renombrar una predeterminada — sigue siendo la misma fila sembrada, solo con otra etiqueta', async () => {
      const tenantId = await tenantDePrueba();
      const categorias = await listarCategorias(tenantId);
      const comida = categorias.find((c) => c.nombre === 'Comida');

      const actualizada = await actualizarCategoria(tenantId, comida!.id, { nombre: 'Comida y despensa' });

      expect(actualizada.nombre).toBe('Comida y despensa');
      expect(actualizada.esPredeterminada).toBe(true);
    });

    it('recorta espacios del nombre nuevo', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      const actualizada = await actualizarCategoria(tenantId, categoria.id, { nombre: '  Perro  ' });
      expect(actualizada.nombre).toBe('Perro');
    });

    it('rechaza un nombre vacío', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      await expect(actualizarCategoria(tenantId, categoria.id, { nombre: '   ' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('rechaza renombrar a un nombre que ya usa otra categoría del mismo tenant', async () => {
      const tenantId = await tenantDePrueba();
      await crearCategoriaPersonalizada(tenantId, 'Perro');
      const gato = await crearCategoriaPersonalizada(tenantId, 'Gato');

      await expect(actualizarCategoria(tenantId, gato.id, { nombre: 'Perro' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('nombre e ícono se pueden cambiar juntos en un solo llamado', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');

      const actualizada = await actualizarCategoria(tenantId, categoria.id, { nombre: 'Perro', icono: 'mascotas' });

      expect(actualizada.nombre).toBe('Perro');
      expect(actualizada.icono).toBe('mascotas');
    });

    it('rechaza una categoría que no existe (BOLA)', async () => {
      const tenantId = await tenantDePrueba();
      await expect(actualizarCategoria(tenantId, randomUUID(), { icono: 'otros' })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });

    it('rechaza una categoría de otro tenant (BOLA)', async () => {
      const tenantId = await tenantDePrueba();
      const otroTenantId = await tenantDePrueba();
      const ajena = await crearCategoriaPersonalizada(otroTenantId, 'Mascota');

      await expect(actualizarCategoria(tenantId, ajena.id, { icono: 'otros' })).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });
  });

  describe('eliminarCategoria', () => {
    it('rechaza una categoría que no existe (BOLA)', async () => {
      const tenantId = await tenantDePrueba();
      await expect(eliminarCategoria(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });

    it('rechaza una categoría de otro tenant (BOLA)', async () => {
      const tenantId = await tenantDePrueba();
      const otroTenantId = await tenantDePrueba();
      const ajena = await crearCategoriaPersonalizada(otroTenantId, 'Mascota');

      await expect(eliminarCategoria(tenantId, ajena.id)).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
    });

    it('rechaza eliminar una categoría predeterminada', async () => {
      const tenantId = await tenantDePrueba();
      const [comida] = await listarCategorias(tenantId);

      await expect(eliminarCategoria(tenantId, comida!.id)).rejects.toMatchObject({ codigo: 'CATEGORIA_PREDETERMINADA' });
    });

    it('elimina una categoría personalizada sin usar de verdad — ya no aparece en el listado', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');

      await eliminarCategoria(tenantId, categoria.id);

      expect(await listarCategorias(tenantId)).not.toContainEqual(expect.objectContaining({ id: categoria.id }));
    });

    it('rechaza eliminar una categoría ya usada por un gasto', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 100n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        categoriaId: categoria.id,
        fechaReferencia: new Date('2026-08-01T00:00:00Z'),
      });

      await expect(eliminarCategoria(tenantId, categoria.id)).rejects.toMatchObject({ codigo: 'CATEGORIA_EN_USO' });
    });

    it('rechaza eliminar una categoría ya usada por un gasto recurrente', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      await crearGastoRecurrente({ tenantId, descripcion: 'Comida del perro', montoValorMinimo: 300n, moneda: 'MXN', frecuencia: 'quincenal', categoriaId: categoria.id });

      await expect(eliminarCategoria(tenantId, categoria.id)).rejects.toMatchObject({ codigo: 'CATEGORIA_EN_USO' });
    });

    it('rechaza eliminar una categoría ya usada por un cargo de tarjeta', async () => {
      const tenantId = await tenantDePrueba();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Mascota');
      const tarjeta = await crearTarjeta(tenantId, 'BBVA', 1000000n, 'MXN', 15, 20);
      await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Veterinario',
        montoTotalValorMinimo: 50000n,
        moneda: 'MXN',
        numeroPlazos: 1,
        categoriaId: categoria.id,
      });

      await expect(eliminarCategoria(tenantId, categoria.id)).rejects.toMatchObject({ codigo: 'CATEGORIA_EN_USO' });
    });
  });
});
