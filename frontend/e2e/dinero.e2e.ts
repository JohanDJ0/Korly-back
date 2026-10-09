import { conIngreso, expect, irA, pesos, registrarGasto, test } from './utilidades';

test.describe('metas, tarjetas, recurrentes y categorías', () => {
  test('una meta de ahorro: crearla, aportarle de la quincena (baja el disponible) y pasarle dinero de vuelta', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 10000);

    await test.step('crear la meta', async () => {
      await irA(page, 'Metas');
      await expect(page.getByText('Todavía no tienes ninguna meta.')).toBeVisible();
      await page.getByRole('button', { name: /Nueva meta/ }).first().click();
      const hoja = page.getByRole('dialog', { name: 'Nueva meta' });
      await hoja.getByLabel('¿Para qué estás ahorrando?').fill('Vacaciones');
      await hoja.getByLabel('Objetivo').fill('5000');
      await hoja.getByRole('button', { name: 'Crear meta' }).click();

      await expect(hoja).toBeHidden();
      await expect(page.getByText('Vacaciones')).toBeVisible();
      await expect(page.getByText(`${pesos(0)} de ${pesos(5000)}`)).toBeVisible();
    });

    await test.step('aportar de la quincena: la meta sube y el disponible de Inicio baja lo mismo', async () => {
      await page.getByRole('button', { name: /Agregar dinero/ }).click();
      await page.getByPlaceholder('Monto').fill('1500');
      await page.getByRole('button', { name: 'Aportar' }).click();

      await expect(page.getByText(`${pesos(1500)} de ${pesos(5000)}`)).toBeVisible();
      await expect(page.getByText('30%')).toBeVisible();

      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await expect(page.getByText(pesos(8500)).first()).toBeVisible(); // 10,000 − 1,500 que ahora son ahorro
    });

    await test.step('no deja aportar más de lo que hay disponible', async () => {
      await irA(page, 'Metas');
      await page.getByRole('button', { name: /Agregar dinero/ }).click();
      await page.getByPlaceholder('Monto').fill('9000');
      await page.getByRole('button', { name: 'Aportar' }).click();

      await expect(page.getByText(`Tu quincena solo tiene ${pesos(8500)} disponible`)).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar' }).click();
    });

    await test.step('pasar dinero de la meta a la quincena devuelve ese monto al disponible', async () => {
      await page.getByRole('button', { name: 'Usar dinero' }).click();
      await page.getByRole('radio', { name: 'Pasar a mi quincena' }).click();
      await page.getByPlaceholder('Monto').fill('500');
      await page.getByPlaceholder('Motivo').fill('Emergencia');
      await page.getByRole('button', { name: 'Pasar', exact: true }).click();

      await expect(page.getByText(`${pesos(1000)} de ${pesos(5000)}`)).toBeVisible();
      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await expect(page.getByText(pesos(9000)).first()).toBeVisible();
    });
  });

  test('una tarjeta: darla de alta, registrar una compra a meses sin intereses, ver sus mensualidades y corregirla', async ({ page, persona }) => {
    void persona;
    await irA(page, 'Tarjetas');
    await expect(page.getByText('Todavía no tienes ninguna tarjeta registrada.')).toBeVisible();

    await test.step('alta de la tarjeta', async () => {
      await page.getByRole('button', { name: /Nueva tarjeta/ }).first().click();
      const hoja = page.getByRole('dialog', { name: 'Nueva tarjeta' });
      await hoja.getByLabel('Nombre').fill('BBVA Oro');
      await hoja.getByLabel('Límite de crédito').fill('20000');
      await hoja.getByLabel('Día de corte').fill('12');
      await hoja.getByRole('button', { name: 'Guardar' }).click();

      await expect(hoja).toBeHidden();
      await expect(page.getByText('BBVA Oro')).toBeVisible();
      await expect(page.getByText('Corte día 12')).toBeVisible();
      await expect(page.getByText('20 días para pagar')).toBeVisible(); // el valor por omisión
      await expect(page.getByText(`${pesos(20000)} disponible de ${pesos(20000)}`)).toBeVisible();
    });

    await test.step('una compra a 6 MSI sube la deuda y baja el crédito disponible', async () => {
      await page.getByRole('button', { name: 'Registrar cargo' }).click();
      const hoja = page.getByRole('dialog', { name: 'Registrar cargo' });
      await hoja.getByLabel('¿Qué compraste?').fill('Laptop');
      await hoja.getByLabel('Monto total').fill('6000');
      await hoja.getByLabel('Plazo').selectOption({ label: '6 meses sin intereses' });
      await hoja.getByRole('button', { name: 'Registrar cargo' }).click();

      await expect(hoja).toBeHidden();
      await expect(page.getByText(`${pesos(14000)} disponible de ${pesos(20000)}`)).toBeVisible();
      await expect(page.getByText(pesos(6000), { exact: true })).toBeVisible(); // "Debes"
    });

    await test.step('"Ver compras" muestra la compra con sus 6 mensualidades de $1,000, todas pendientes', async () => {
      await page.getByRole('button', { name: /Ver compras/ }).click();
      await expect(page.getByText(`Laptop — ${pesos(6000)} a 6 MSI`)).toBeVisible();
      await expect(page.getByText(new RegExp(`1/6 — ${pesos(1000).replace('$', '\\$')}`))).toBeVisible();
      await expect(page.getByText(new RegExp(`6/6 — ${pesos(1000).replace('$', '\\$')}`))).toBeVisible();
      await expect(page.getByText('Pendiente')).toHaveCount(6);
    });

    await test.step('corregir la compra libera el crédito y la quita de la lista', async () => {
      await page.getByRole('button', { name: 'Corregir', exact: true }).click();
      await page.getByRole('button', { name: 'Sí, confirmar' }).click();

      await expect(page.getByText(/a 6 MSI/)).toBeHidden();
      await expect(page.getByText(`${pesos(20000)} disponible de ${pesos(20000)}`)).toBeVisible();
    });

    await test.step('eliminar la tarjeta (sin compras vigentes) la quita de la lista', async () => {
      await page.getByRole('button', { name: 'Eliminar tarjeta' }).click();
      await page.getByRole('button', { name: 'Sí, confirmar' }).click();

      await expect(page.getByText('BBVA Oro')).toBeHidden();
      await expect(page.getByText('Todavía no tienes ninguna tarjeta registrada.')).toBeVisible();
    });
  });

  test('gastos recurrentes: crear uno mensual y uno quincenal, pausar y reanudar', async ({ page, persona }) => {
    void persona;
    await page.goto('/recurrentes');
    await expect(page.getByText('Todavía no tienes ninguna suscripción o gasto recurrente registrado.')).toBeVisible();

    await test.step('un mensual exige su día; con él se crea', async () => {
      await page.getByRole('button', { name: /Nuevo gasto recurrente/ }).first().click();
      const hoja = page.getByRole('dialog', { name: 'Nuevo gasto recurrente' });
      await hoja.getByLabel('Descripción').fill('Netflix');
      await hoja.getByLabel('Monto').fill('219');
      await hoja.getByLabel('Frecuencia').selectOption('mensual');
      await hoja.getByRole('button', { name: 'Guardar' }).click();
      await expect(hoja.getByText(/Indica el día del mes en que se cobra/)).toBeVisible();

      await hoja.getByLabel('Día del mes en que se cobra').fill('15');
      await hoja.getByRole('button', { name: 'Guardar' }).click();
      await expect(hoja).toBeHidden();
      await expect(page.getByText(`${pesos(219)} — Mensual, día 15`)).toBeVisible();
    });

    await test.step('uno quincenal no pide día', async () => {
      await page.getByRole('button', { name: /Nuevo gasto recurrente/ }).first().click();
      const hoja = page.getByRole('dialog', { name: 'Nuevo gasto recurrente' });
      await hoja.getByLabel('Descripción').fill('Renta');
      await hoja.getByLabel('Monto').fill('4500');
      await expect(hoja.getByLabel('Día del mes en que se cobra')).toBeHidden();
      await hoja.getByRole('button', { name: 'Guardar' }).click();

      await expect(hoja).toBeHidden();
      await expect(page.getByText(`${pesos(4500)} — Cada quincena`)).toBeVisible();
    });

    await test.step('pausar y reanudar se refleja al instante', async () => {
      await page.getByRole('listitem').filter({ hasText: 'Netflix' }).getByRole('button', { name: 'Pausar' }).click();
      await expect(page.getByText(`${pesos(219)} — Mensual, día 15 — Pausado`)).toBeVisible();

      await page.getByRole('button', { name: 'Reanudar' }).click();
      await expect(page.getByText(`${pesos(219)} — Mensual, día 15`)).toBeVisible();
      await expect(page.getByText(/Pausado/)).toBeHidden();
    });

    await test.step('lo creado sigue ahí después de recargar (quedó en el servidor)', async () => {
      await page.reload();
      await expect(page.getByText('Netflix')).toBeVisible();
      await expect(page.getByText('Renta')).toBeVisible();
    });
  });

  test('categorías: crear una con ícono, renombrarla, usarla en un gasto y eliminarla', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 3000);

    await test.step('crear una categoría nueva con ícono', async () => {
      await page.goto('/categorias');
      await expect(page.getByText('Predeterminada').first()).toBeVisible();
      await page.getByPlaceholder('Nombre de la categoría').fill('Cafetería');
      await page.getByRole('button', { name: 'Comida', exact: true }).last().click(); // el ícono del bloque "nueva categoría"
      await page.getByRole('button', { name: 'Crear categoría' }).click();

      await expect(page.getByRole('button', { name: 'Cafetería', exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('Nombre de la categoría')).toHaveValue('');
    });

    await test.step('renombrarla toca el nombre, escribe y pulsa Listo', async () => {
      await page.getByRole('button', { name: 'Cafetería', exact: true }).click();
      const campo = page.getByRole('textbox').first();
      await campo.fill('Café y pan');
      await page.getByRole('button', { name: 'Listo' }).click();

      await expect(page.getByRole('button', { name: 'Café y pan', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cafetería', exact: true })).toBeHidden();
    });

    await test.step('un gasto con esa categoría la muestra en el historial', async () => {
      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await page.getByRole('button', { name: 'Registrar gasto' }).click();
      const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
      await hoja.getByLabel('¿Cuánto gastaste?').fill('80');
      await hoja.getByRole('button', { name: 'Café y pan', exact: true }).click();
      await hoja.getByRole('button', { name: /^Registrar/ }).click();
      await expect(hoja).toBeHidden();

      await irA(page, 'Historial');
      await expect(page.getByRole('paragraph').filter({ hasText: /— Café y pan/ })).toBeVisible(); // la fila del gasto, con su categoría
    });

    await test.step('las predeterminadas no se pueden eliminar; una en uso tampoco (lo dice); una sin uso sí, con confirmación', async () => {
      await page.goto('/categorias');
      await expect(page.getByRole('listitem').filter({ hasText: 'Comida' }).getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

      await page.getByRole('listitem').filter({ hasText: 'Café y pan' }).getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByText('¿Eliminar la categoría "Café y pan"?')).toBeVisible();
      await page.getByRole('button', { name: 'Sí, confirmar' }).click();
      await expect(page.getByText('No se puede eliminar una categoría que ya está en uso')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Café y pan', exact: true })).toBeVisible(); // sigue ahí

      await page.getByPlaceholder('Nombre de la categoría').fill('Temporal');
      await page.getByRole('button', { name: 'Crear categoría' }).click();
      await page.getByRole('listitem').filter({ hasText: 'Temporal' }).getByRole('button', { name: 'Eliminar' }).click();
      await page.getByRole('button', { name: 'Sí, confirmar' }).click();
      await expect(page.getByRole('button', { name: 'Temporal', exact: true })).toBeHidden();
    });
  });

  test('un gasto de la quincena aparece en el desglose del historial con su categoría', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 4000);
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
    await hoja.getByLabel('¿Cuánto gastaste?').fill('600');
    await hoja.getByRole('button', { name: 'Comida', exact: true }).click();
    await hoja.getByRole('button', { name: /^Registrar/ }).click();
    await expect(hoja).toBeHidden();
    await registrarGasto(page, 400);

    await irA(page, 'Historial');
    await page.getByRole('button', { name: 'Ver desglose del periodo' }).click();

    await expect(page.getByText('Comida').first()).toBeVisible();
    await expect(page.getByText(pesos(600)).first()).toBeVisible();
  });
});
