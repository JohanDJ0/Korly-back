import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada, eliminarCategoria, listarCategorias } from '../../src/modulos/categorias/categorias.js';
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
