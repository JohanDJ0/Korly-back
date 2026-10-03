import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { asientos } from '../../src/db/schema/ledger.js';
import { recordatoriosEnviados } from '../../src/db/schema/recordatorios.js';
import { tenants } from '../../src/db/schema/tenants.js';
import { listarCategorias } from '../../src/modulos/categorias/categorias.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { eliminarCuenta, type ClienteStripeCuenta } from '../../src/modulos/cuenta/eliminar-cuenta.js';
import { exportarDatosCuenta, serializarDatosCuenta } from '../../src/modulos/cuenta/exportar-datos.js';
import { TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA } from '../../src/modulos/cuenta/tablas-tenant.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { aportarAMeta, crearMeta } from '../../src/modulos/metas/metas.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';
import { conTenant } from '../../src/shared/db.js';
import { dbAdmin } from '../../src/shared/db-admin.js';

describe('privacidad y derechos ARCO', () => {
  const HOY = new Date('2026-08-05T00:00:00Z'); // quincena 1-15 de agosto

  /**
   * Un tenant con datos en TODAS las tablas con `tenant_id` — si el sembrado
   * se queda corto, la prueba de "sanidad" de abajo falla en vez de dar un
   * verde vacío: borrar una tabla que nunca tuvo filas no prueba nada.
   */
  async function tenantCompleto() {
    const idEnProveedor = `test-cuenta-${randomUUID()}`;
    const { tenantId } = await resolverOcrearIdentidad(idEnProveedor);

    const tarjeta = await crearTarjeta(tenantId, 'BBVA', 1000000n, 'MXN', 5, 10);
    await registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion: 'Laptop', montoTotalValorMinimo: 20000n, moneda: 'MXN', numeroPlazos: 2, fechaCompra: '2026-08-03' });

    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY); // materializa la 1ª mensualidad (vence el 15)
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
    const comida = (await listarCategorias(tenantId)).find((c) => c.nombre === 'Comida');
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-03', categoriaId: comida?.id, nota: 'tacos', fechaReferencia: HOY });
    const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');
    await aportarAMeta({ tenantId, metaId: meta.id, monto: 1000n, moneda: 'MXN', fechaReferencia: HOY });
    await crearGastoRecurrente({ tenantId, descripcion: 'Netflix', montoValorMinimo: 219n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 10, fechaReferencia: HOY });

    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
    await decidirSobrante(tenantId, periodo.id, 'arrastrar');
    await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z')); // reclama el arrastre

    await conTenant(tenantId, async (tx) => {
      await tx.insert(recordatoriosEnviados).values({ tenantId, fecha: '2026-08-05', tipo: 'diario' });
    });
    await dbAdmin.update(tenants).set({ stripeCustomerId: `cus_test_${randomUUID()}` }).where(eq(tenants.id, tenantId));

    return { tenantId, idEnProveedor, periodo };
  }

  async function contarFilas(tenantId: string) {
    const conteos: Record<string, number> = {};
    for (const { nombre, tabla, columnaTenant } of TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA) {
      const [fila] = await dbAdmin.select({ total: sql<number>`count(*)::int` }).from(tabla).where(eq(columnaTenant, tenantId));
      conteos[nombre] = fila?.total ?? 0;
    }
    const [tenant] = await dbAdmin.select({ total: sql<number>`count(*)::int` }).from(tenants).where(eq(tenants.id, tenantId));
    conteos['tenants'] = tenant?.total ?? 0;
    return conteos;
  }

  function stripeDePrueba(falla?: unknown) {
    const borrados: string[] = [];
    const cliente: ClienteStripeCuenta = {
      customers: {
        del: async (id) => {
          if (falla) throw falla;
          borrados.push(id);
          return { id, deleted: true };
        },
      },
    };
    return { cliente, borrados };
  }

  function authDePrueba(falla = false) {
    const borrados: string[] = [];
    const eliminarUsuarioAuth = async (id: string) => {
      if (falla) throw new Error('Supabase no respondió');
      borrados.push(id);
    };
    return { eliminarUsuarioAuth, borrados };
  }

  describe('lista de tablas del tenant', () => {
    it('incluye toda tabla con tenant_id del catálogo de Postgres — una tabla nueva sin decidir qué hacer con ella no pasa CI', async () => {
      const filas = await dbAdmin.execute(
        sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'`
      );
      const delCatalogo = [...filas].map((fila) => String(fila['table_name'])).sort();
      const delCodigo = TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA.map((t) => t.nombre).sort();

      expect(delCodigo).toEqual(delCatalogo);
    });

    it('sanidad: el tenant de prueba tiene filas en todas las tablas, para que borrarlas pruebe algo', async () => {
      const { tenantId } = await tenantCompleto();

      const conteos = await contarFilas(tenantId);

      for (const [tabla, total] of Object.entries(conteos)) {
        expect(total, `la tabla ${tabla} quedó sin filas en el sembrado`).toBeGreaterThan(0);
      }
    });
  });

  describe('acceso: exportarDatosCuenta', () => {
    it('devuelve el correo, la cuenta y todas las tablas, solo del propio tenant', async () => {
      const { tenantId } = await tenantCompleto();
      const otro = await tenantCompleto();

      const exportacion = await exportarDatosCuenta(tenantId, async () => 'persona@ejemplo.com');

      expect(exportacion.cuenta.correo).toBe('persona@ejemplo.com');
      expect(Object.keys(exportacion.datos).sort()).toEqual(TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA.map((t) => t.nombre).sort());
      expect(exportacion.datos['gastos']?.length).toBeGreaterThan(0);
      const propios = await contarFilas(tenantId);
      for (const [tabla, filas] of Object.entries(exportacion.datos)) {
        expect(filas.length, `filas de ${tabla}`).toBe(propios[tabla]);
      }
      expect(propios['periodos']).not.toBe(0);
      expect((await contarFilas(otro.tenantId))['periodos']).not.toBe(0);
    });

    it('serializa los montos bigint como texto sin perder precisión', async () => {
      const { tenantId } = await tenantCompleto();

      const texto = serializarDatosCuenta(await exportarDatosCuenta(tenantId, async () => null));
      const objeto = JSON.parse(texto) as { datos: { asientos: { montoValorMinimo: unknown }[] } };

      expect(typeof objeto.datos.asientos[0]?.montoValorMinimo).toBe('string');
    });
  });

  describe('cancelación: eliminarCuenta', () => {
    it('sin la palabra de confirmación no borra nada', async () => {
      const { tenantId } = await tenantCompleto();
      const antes = await contarFilas(tenantId);

      await expect(eliminarCuenta(tenantId, 'eliminar', { clienteStripe: stripeDePrueba().cliente, eliminarUsuarioAuth: authDePrueba().eliminarUsuarioAuth })).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
      await expect(eliminarCuenta(tenantId, undefined)).rejects.toMatchObject({ codigo: 'VALIDACION' });

      expect(await contarFilas(tenantId)).toEqual(antes);
    });

    it('purga TODAS las tablas del tenant, borra su Customer de Stripe y su usuario de Auth, y no toca a otro tenant', async () => {
      const { tenantId, idEnProveedor } = await tenantCompleto();
      const otro = await tenantCompleto();
      const otroAntes = await contarFilas(otro.tenantId);
      const [{ stripeCustomerId }] = await dbAdmin.select({ stripeCustomerId: tenants.stripeCustomerId }).from(tenants).where(eq(tenants.id, tenantId));
      const stripe = stripeDePrueba();
      const auth = authDePrueba();

      const resultado = await eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripe.cliente, eliminarUsuarioAuth: auth.eliminarUsuarioAuth });

      expect(resultado).toEqual({ usuarioAuthEliminado: true });
      expect(stripe.borrados).toEqual([stripeCustomerId]);
      expect(auth.borrados).toEqual([idEnProveedor]);
      for (const [tabla, total] of Object.entries(await contarFilas(tenantId))) {
        expect(total, `la tabla ${tabla} conserva filas`).toBe(0);
      }
      expect(await contarFilas(otro.tenantId)).toEqual(otroAntes);
    });

    it('un tenant sin Customer de Stripe (nunca pagó) no llama a Stripe', async () => {
      const { tenantId } = await tenantCompleto();
      await dbAdmin.update(tenants).set({ stripeCustomerId: null }).where(eq(tenants.id, tenantId));
      const stripe = stripeDePrueba();

      await eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripe.cliente, eliminarUsuarioAuth: authDePrueba().eliminarUsuarioAuth });

      expect(stripe.borrados).toEqual([]);
      expect((await contarFilas(tenantId))['tenants']).toBe(0);
    });

    it('un Customer que Stripe ya no tiene (resource_missing) no impide eliminar la cuenta', async () => {
      const { tenantId } = await tenantCompleto();
      const stripe = stripeDePrueba(Object.assign(new Error('No such customer'), { code: 'resource_missing' }));

      await eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripe.cliente, eliminarUsuarioAuth: authDePrueba().eliminarUsuarioAuth });

      expect((await contarFilas(tenantId))['tenants']).toBe(0);
    });

    it('si Stripe falla por cualquier otra razón, se aborta con los datos intactos para poder reintentar', async () => {
      const { tenantId } = await tenantCompleto();
      const antes = await contarFilas(tenantId);
      const auth = authDePrueba();

      await expect(
        eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripeDePrueba(new Error('Stripe caído')).cliente, eliminarUsuarioAuth: auth.eliminarUsuarioAuth })
      ).rejects.toThrow('Stripe caído');

      expect(await contarFilas(tenantId)).toEqual(antes);
      expect(auth.borrados).toEqual([]);
    });

    it('si la purga falla después de borrar el Customer en Stripe, el tenant queda sin Customer y en Free, no apuntando a uno inexistente', async () => {
      const { tenantId } = await tenantCompleto();
      await dbAdmin.update(tenants).set({ plan: 'pro', estadoSuscripcion: 'activa' }).where(eq(tenants.id, tenantId));
      // Una fila ajena a la lista que referencia al tenant hace fallar el DELETE final de `tenants`
      // y revierte toda la transacción de la purga.
      await dbAdmin.execute(sql`create table if not exists _bloqueo_purga (tenant_id uuid references tenants(id))`);
      await dbAdmin.execute(sql`insert into _bloqueo_purga (tenant_id) values (${tenantId})`);
      const antes = await contarFilas(tenantId);
      const stripe = stripeDePrueba();

      try {
        await expect(
          eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripe.cliente, eliminarUsuarioAuth: authDePrueba().eliminarUsuarioAuth })
        ).rejects.toBeDefined();
      } finally {
        await dbAdmin.execute(sql`drop table _bloqueo_purga`);
      }

      expect(stripe.borrados).toHaveLength(1);
      expect(await contarFilas(tenantId)).toEqual(antes);
      const [tenant] = await dbAdmin.select().from(tenants).where(eq(tenants.id, tenantId));
      expect(tenant).toMatchObject({ stripeCustomerId: null, stripeSubscriptionId: null, plan: 'free', estadoSuscripcion: 'cancelada' });
    });

    it('si falla el borrado en Supabase Auth, los datos ya se purgaron y el resultado lo dice', async () => {
      const { tenantId } = await tenantCompleto();

      const resultado = await eliminarCuenta(tenantId, 'ELIMINAR', { clienteStripe: stripeDePrueba().cliente, eliminarUsuarioAuth: authDePrueba(true).eliminarUsuarioAuth });

      expect(resultado).toEqual({ usuarioAuthEliminado: false });
      expect((await contarFilas(tenantId))['tenants']).toBe(0);
    });
  });

  describe('candado de la purga (migración 0019)', () => {
    it('el rol de la aplicación NO puede borrar ledger ni declarando la purga', async () => {
      const { tenantId } = await tenantCompleto();

      await expect(
        conTenant(tenantId, async (tx) => {
          await tx.execute(sql`select set_config('app.purga_cuenta', 'on', true)`);
          await tx.delete(asientos).where(eq(asientos.tenantId, tenantId));
        })
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
      expect((await contarFilas(tenantId))['asientos']).toBeGreaterThan(0);
    });

    it('la conexión de administración tampoco puede borrar ledger sin declarar la purga', async () => {
      const { tenantId } = await tenantCompleto();

      await expect(dbAdmin.delete(asientos).where(eq(asientos.tenantId, tenantId))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
    });

    it('ni siquiera una purga declarada abre el UPDATE: editar un asiento sigue prohibido', async () => {
      const { tenantId } = await tenantCompleto();

      await expect(
        dbAdmin.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.purga_cuenta', 'on', true)`);
          await tx.update(asientos).set({ moneda: 'USD' }).where(eq(asientos.tenantId, tenantId));
        })
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
    });
  });
});
