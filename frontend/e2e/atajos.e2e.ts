import { conIngreso, expect, irA, pesos, test } from './utilidades';

test.describe('atajos de gasto', () => {
  test('guardar un gasto como atajo, registrarlo con un toque desde Inicio y deshacerlo', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 10000);

    await test.step('desde el formulario de gasto: "Guardar como atajo" no registra el gasto', async () => {
      await page.getByRole('button', { name: 'Registrar gasto' }).click();
      const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
      await hoja.getByLabel('¿Cuánto gastaste?').fill('55');
      await hoja.getByLabel(/Nota/i).fill('Café');
      await hoja.getByRole('button', { name: 'Guardar como atajo' }).click();
      await hoja.getByRole('button', { name: 'Guardar atajo' }).click();
      await expect(hoja.getByText('Atajo “Café” guardado')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(hoja).toBeHidden();
      await expect(page.getByText('Todavía no has registrado gastos')).toBeHidden(); // no se registró nada
    });

    await test.step('en Inicio aparece el atajo y un toque registra el gasto de hoy', async () => {
      const atajo = page.getByRole('button', { name: `Café ${pesos(55)}` });
      await expect(atajo).toBeVisible();
      await expect(page.getByText(pesos(9945))).toBeHidden(); // todavía no se ha gastado nada
      await atajo.click();

      await expect(page.getByRole('status').filter({ hasText: 'Registrado: Café' })).toBeVisible();
      await expect(page.getByText(pesos(9945)).first()).toBeVisible(); // 10,000 − 55
    });

    await test.step('"Deshacer" devuelve el dinero', async () => {
      await page.getByRole('button', { name: 'Deshacer' }).click();

      await expect(page.getByRole('status').filter({ hasText: 'Registrado: Café' })).toBeHidden();
      await expect(page.getByText(pesos(10000)).first()).toBeVisible();
    });
  });

  test('un atajo mayor a lo disponible abre el formulario en lugar de registrarse solo', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 1000);
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
    await hoja.getByLabel('¿Cuánto gastaste?').fill('5000');
    await hoja.getByLabel(/Nota/i).fill('Bocina');
    await hoja.getByRole('button', { name: 'Guardar como atajo' }).click();
    await hoja.getByRole('button', { name: 'Guardar atajo' }).click();
    await expect(hoja.getByText('Atajo “Bocina” guardado')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: `Bocina ${pesos(5000)}` }).click();

    const formulario = page.getByRole('dialog', { name: 'Nuevo gasto' });
    await expect(formulario.getByLabel('¿Cuánto gastaste?')).toHaveValue('5000');
    await expect(formulario.getByLabel(/Nota/i)).toHaveValue('Bocina');
    await formulario.getByRole('button', { name: /^Registrar/ }).click();
    await expect(formulario.getByRole('alert')).toContainText('mayor a lo que tienes disponible'); // el aviso de siempre
  });

  test('Ajustes → Atajos de gasto: crear, editar, borrar y el límite del plan gratuito (3)', async ({ page, persona }) => {
    void persona;
    await irA(page, 'Más');
    await page.getByRole('link', { name: 'Atajos de gasto' }).click();
    await expect(page.getByRole('heading', { name: 'Atajos de gasto' })).toBeVisible();
    await expect(page.getByText('Llevas 0 de 3')).toBeVisible();

    for (const [nombre, monto] of [['Café', '55'], ['Camión', '18'], ['Comida', '90']] as const) {
      await page.getByRole('button', { name: /Nuevo atajo/ }).first().click();
      const hoja = page.getByRole('dialog', { name: 'Nuevo atajo' });
      await hoja.getByLabel('Nombre').fill(nombre);
      await hoja.getByLabel('Monto').fill(monto);
      await hoja.getByRole('button', { name: 'Guardar' }).click();
      await expect(hoja).toBeHidden();
      await expect(page.getByText(nombre, { exact: true })).toBeVisible();
    }

    await expect(page.getByText('Llevas 3 de 3')).toBeVisible();
    await expect(page.getByRole('button', { name: /Nuevo atajo/ }).first()).toBeDisabled();
    await expect(page.getByText(/Llegaste al límite de atajos de tu plan/)).toBeVisible();

    await test.step('editar el monto', async () => {
      await page.getByRole('button', { name: 'Editar Café' }).click();
      const hoja = page.getByRole('dialog', { name: 'Editar atajo' });
      await hoja.getByLabel('Monto').fill('60');
      await hoja.getByRole('button', { name: 'Guardar' }).click();
      await expect(hoja).toBeHidden();
      await expect(page.getByText(pesos(60))).toBeVisible();
    });

    await test.step('eliminar uno libera el lugar', async () => {
      const fila = page.getByText('Camión', { exact: true }).locator('xpath=ancestor::li');
      await fila.getByRole('button', { name: 'Eliminar' }).click();
      await fila.getByRole('button', { name: 'Sí, confirmar' }).click();

      await expect(page.getByText('Camión', { exact: true })).toBeHidden();
      await expect(page.getByText('Llevas 2 de 3')).toBeVisible();
      await expect(page.getByRole('button', { name: /Nuevo atajo/ }).first()).toBeEnabled();
    });
  });
});
