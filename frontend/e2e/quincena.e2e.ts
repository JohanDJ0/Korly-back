import { conIngreso, expect, irA, pesos, registrarGasto, test } from './utilidades';

test.describe('la quincena de punta a punta', () => {
  test('desde cero: empezar la quincena, ingreso, gastos, historial, corregir, cerrar, reabrir, decidir el sobrante y seguir', async ({ page, persona }) => {
    void persona;

    await test.step('empieza la quincena y registra el ingreso: aparece la cifra del día', async () => {
      await conIngreso(page, 12000);
      await expect(page.getByText('Disponible total')).toBeVisible();
      await expect(page.getByText(pesos(12000)).first()).toBeVisible();
      await expect(page.getByText(/^Quincena · /)).toBeVisible();
    });

    await test.step('un gasto baja el disponible, se ve en la actividad reciente y cuenta como "gastado hoy"', async () => {
      await registrarGasto(page, 250, 'tacos de la esquina');
      await expect(page.getByText(pesos(11750)).first()).toBeVisible();
      await expect(page.getByText(`Ya gastaste ${pesos(250)}`)).toBeVisible();
      await expect(page.getByText('Actividad reciente')).toBeVisible();
      await expect(page.getByText(`-${pesos(250)}`)).toBeVisible();
      // Ya hubo actividad hoy: el recordatorio "te quedan N días" se silencia solo.
      await expect(page.getByText(/Te quedan \d+ días? con/)).toBeHidden();
    });

    await test.step('el historial lista el ingreso y el gasto', async () => {
      await registrarGasto(page, 100, 'café');
      await irA(page, 'Historial');
      await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
      await expect(page.getByText(`+${pesos(12000)}`)).toBeVisible();
      await expect(page.getByText(pesos(250), { exact: true })).toBeVisible();
      await expect(page.getByText(/tacos de la esquina/)).toBeVisible();
      await expect(page.getByText(pesos(100), { exact: true })).toBeVisible();
    });

    await test.step('el filtro "gastos" esconde los ingresos y "ingresos" los gastos', async () => {
      await page.getByRole('button', { name: 'gastos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'INGRESOS' })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'GASTOS' })).toBeVisible();
      await page.getByRole('button', { name: 'ingresos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'GASTOS' })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'INGRESOS' })).toBeVisible();
      await page.getByRole('button', { name: 'todo', exact: true }).click();
    });

    await test.step('corregir un gasto cambia su monto en el historial y en el disponible de Inicio', async () => {
      const fila = page.getByRole('listitem').filter({ hasText: 'tacos de la esquina' });
      await fila.getByRole('button', { name: 'Editar' }).click();
      const monto = page.locator('input[type="number"]').first();
      await monto.fill('300');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(pesos(300), { exact: true })).toBeVisible();
      await expect(page.getByText(pesos(250), { exact: true })).toBeHidden(); // el original ya no se muestra (se conserva, corregido, en el ledger)

      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await expect(page.getByText(pesos(11600)).first()).toBeVisible(); // 12,000 − 300 − 100
    });

    await test.step('eliminar un gasto lo quita y devuelve el dinero al disponible', async () => {
      await irA(page, 'Historial');
      const fila = page.getByRole('listitem').filter({ hasText: /^.*\$100\.00.*$/ }).first();
      await fila.getByRole('button', { name: 'Eliminar' }).click();
      await page.getByRole('button', { name: 'Sí, confirmar' }).click();
      await expect(page.getByText(pesos(100), { exact: true })).toBeHidden();

      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await expect(page.getByText(pesos(11700)).first()).toBeVisible(); // 12,000 − 300
    });

    await test.step('cerrar el periodo (con la palabra de confirmación) lleva al resumen con el sobrante', async () => {
      await irA(page, 'Más');
      await page.getByRole('button', { name: /Cerrar este periodo/ }).click();
      const hoja = page.getByRole('dialog', { name: 'Cerrar periodo' });
      const cerrar = hoja.getByRole('button', { name: 'Cerrar periodo' });
      await expect(cerrar).toBeDisabled();
      await hoja.getByLabel(/Para confirmar/).fill('cerrar');
      await cerrar.click();

      await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
      await expect(page.getByText('Sobrante del periodo')).toBeVisible();
      await expect(page.getByText(pesos(11700)).first()).toBeVisible();
    });

    await test.step('lo cerré sin querer: reabrirlo devuelve la cifra y deja registrar de nuevo', async () => {
      await expect(page.getByText('¿Lo cerraste sin querer?')).toBeVisible();
      await page.getByRole('button', { name: 'Reabrir periodo' }).click();

      await expect(page.getByText('Puedes gastar hoy')).toBeVisible();
      await expect(page.getByText(pesos(11700)).first()).toBeVisible();
      await registrarGasto(page, 200);
      await expect(page.getByText(pesos(11500)).first()).toBeVisible();
    });

    await test.step('cerrarlo de nuevo y decidir el sobrante: arrastrarlo', async () => {
      await irA(page, 'Más');
      await page.getByRole('button', { name: /Cerrar este periodo/ }).click();
      await page.getByRole('dialog', { name: 'Cerrar periodo' }).getByLabel(/Para confirmar/).fill('CERRAR');
      await page.getByRole('dialog', { name: 'Cerrar periodo' }).getByRole('button', { name: 'Cerrar periodo' }).click();

      await expect(page.getByText('¿Qué hacemos con el sobrante?')).toBeVisible();
      await expect(page.getByText(pesos(11500)).first()).toBeVisible();
      await page.getByRole('button', { name: 'Arrastrar al periodo siguiente' }).click();
      await expect(page.getByText('Este sobrante se arrastrará al periodo siguiente.')).toBeVisible();
      await expect(page.getByText('¿Qué hacemos con el sobrante?')).toBeHidden(); // ya decidido: no se vuelve a preguntar
    });

    await test.step('crear el periodo siguiente regresa a Inicio sin errores', async () => {
      await page.getByRole('button', { name: 'Crear periodo siguiente' }).click();
      await expect(page).toHaveURL(/localhost:5199\/$/);
      await expect(page.getByText('Ocurrió un error inesperado')).toBeHidden();
      await expect(page.getByText(/Quincena · /)).toBeVisible();
    });
  });

  test('un gasto mayor a lo disponible pide confirmación; "Corregir el monto" no lo registra y "de todos modos" sí', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 1000);

    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
    await hoja.getByLabel('¿Cuánto gastaste?').fill('1500');
    await hoja.getByRole('button', { name: /^Registrar/ }).click();

    await expect(hoja.getByText('Este gasto es mayor a lo que tienes disponible')).toBeVisible();
    await expect(hoja.getByText(`-${pesos(500)}`)).toBeVisible();
    await hoja.getByRole('button', { name: 'Corregir el monto' }).click();
    await expect(hoja.getByText('Este gasto es mayor a lo que tienes disponible')).toBeHidden();

    await hoja.getByRole('button', { name: /^Registrar/ }).click();
    await hoja.getByRole('button', { name: 'Registrar de todos modos' }).click();
    await expect(hoja).toBeHidden();

    await expect(page.getByText(`-${pesos(500)}`).first()).toBeVisible(); // el disponible quedó en negativo
    await expect(page.getByText('Te excediste hoy por')).toBeVisible();
  });

  test('el ojito oculta los montos, y la elección sobrevive a recargar y a cambiar de pantalla', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 5000);
    await expect(page.getByText(pesos(5000)).first()).toBeVisible();

    await page.getByRole('button', { name: 'Ocultar montos' }).first().click();
    await expect(page.getByText(pesos(5000))).toHaveCount(0);
    await expect(page.getByText('$ ••••').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText('$ ••••').first()).toBeVisible();
    await expect(page.getByText(pesos(5000))).toHaveCount(0);

    await irA(page, 'Historial');
    await expect(page.getByText(`+${pesos(5000)}`)).toHaveCount(0);
    await expect(page.getByText('+$ ••••')).toBeVisible();

    await page.getByRole('button', { name: 'Mostrar montos' }).first().click();
    await expect(page.getByText(`+${pesos(5000)}`)).toBeVisible();
  });
});
