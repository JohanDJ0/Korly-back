import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada, listarCategorias } from '../../src/modulos/categorias/categorias.js';

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
});
