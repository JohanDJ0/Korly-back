import { conIngreso, expect, pesos, registrarGasto, test } from './utilidades';

/** Mismo producto en una pantalla de celular (Pixel 7): la navegación es la barra de abajo, no el menú lateral. */
test.describe('en el celular', () => {
  test('la barra de abajo navega entre pantallas y el menú lateral de escritorio no aparece', async ({ page, persona }) => {
    void persona;
    await expect(page.getByRole('complementary')).toBeHidden();

    for (const [enlace, titulo] of [
      ['Historial', 'Historial'],
      ['Metas', 'Metas de ahorro'],
      ['Tarjetas', 'Tarjetas de crédito'],
      ['Más', 'Ajustes'],
    ] as const) {
      await page.getByRole('navigation').getByRole('link', { name: enlace }).click();
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    }
    await page.getByRole('navigation').getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByText('Empecemos')).toBeVisible();
  });

  test('registrar un gasto en el celular: la hoja sube desde abajo y la cifra se actualiza', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 6000);

    await registrarGasto(page, 150, 'desde el celular');

    await expect(page.getByText(pesos(5850)).first()).toBeVisible();
    await expect(page.getByText(`-${pesos(150)}`)).toBeVisible();
  });

  test('Ajustes en el celular tiene el botón de comentarios y cerrar sesión en la tarjeta de cuenta', async ({ page, persona }) => {
    void persona;
    await page.goto('/ajustes');

    await expect(page.getByRole('button', { name: /Enviar comentarios/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el inicio de sesión en el celular no muestra la ilustración de escritorio y el formulario cabe sin desplazarse de lado', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible();
    await expect(page.getByTestId('arte-interactivo')).toBeHidden();
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });
});
