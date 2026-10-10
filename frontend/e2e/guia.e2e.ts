import { expect, iniciarSesion, registrar, test } from './utilidades';

const guia = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Guía de Korly' });

test.describe('guía de primeros pasos', () => {
  test('una cuenta nueva la recorre completa: bienvenida, quincena, ingreso, cifra, gasto, atajo, recurrentes y cierre', async ({ page }) => {
    await registrar(page, undefined, undefined, { saltarGuia: false });

    await test.step('bienvenida', async () => {
      const bienvenida = page.getByRole('dialog', { name: 'Bienvenido a Korly' });
      await expect(bienvenida).toContainText('Te decimos cuánto puedes gastar hoy');
      await bienvenida.getByRole('button', { name: 'Empezar' }).click();
      await expect(bienvenida).toBeHidden();
    });

    await test.step('la quincena', async () => {
      await expect(guia(page)).toContainText('quincenas del calendario');
      await guia(page).getByRole('button', { name: 'Siguiente' }).click();
      await expect(guia(page)).toBeHidden();
      await page.getByRole('button', { name: 'Empezar esta quincena' }).click();
    });

    await test.step('el ingreso', async () => {
      await expect(guia(page)).toContainText('Escribe lo que recibiste esta quincena');
      await page.getByLabel('¿Cuánto recibiste?').fill('8000');
      await page.getByRole('button', { name: 'Registrar ingreso' }).click();
    });

    await test.step('la cifra y "Registrar gasto"', async () => {
      await expect(guia(page)).toContainText('Esta es tu cifra del día');
      await guia(page).getByRole('button', { name: 'Siguiente' }).click();
      await expect(guia(page)).toContainText('Cada vez que gastes, apúntalo aquí');
      await page.getByRole('button', { name: 'Registrar gasto' }).click(); // abrir el formulario equivale a leer el paso
      await expect(guia(page)).toBeHidden();
    });

    await test.step('la pista de atajos dentro del formulario, y el gasto', async () => {
      const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
      await expect(hoja.getByText('Si lo repites seguido, guárdalo como atajo')).toBeHidden(); // sin monto no hay pista
      await hoja.getByLabel('¿Cuánto gastaste?').fill('55');
      await expect(hoja.getByText('Si lo repites seguido, guárdalo como atajo')).toBeVisible();
      await hoja.getByRole('button', { name: /^Registrar/ }).click();
      await expect(hoja).toBeHidden();
    });

    await test.step('los gastos recurrentes, con el texto aprobado', async () => {
      await expect(guia(page)).toContainText('¿Tienes gastos que se repiten?');
      await expect(guia(page)).toContainText('se descuentan de inmediato de tu cifra del día');
      await guia(page).getByRole('button', { name: 'Ahora no' }).click();
    });

    await test.step('el cierre apaga la guía', async () => {
      await expect(guia(page)).toContainText('Listo, ya sabes lo principal');
      await guia(page).getByRole('button', { name: 'Terminar' }).click();
      await expect(guia(page)).toBeHidden();
      await page.reload();
      await expect(page.getByText('Puedes gastar hoy', { exact: true })).toBeVisible();
      await expect(guia(page)).toBeHidden();
    });

    await test.step('"Ver la guía otra vez" en Ajustes la reinicia', async () => {
      await page.getByRole('link', { name: 'Más', exact: true }).first().click();
      await page.getByRole('button', { name: 'Ver la guía otra vez' }).click();
      await expect(page.getByText('Puedes gastar hoy', { exact: true })).toBeVisible();
      await expect(guia(page)).toContainText('Esta es tu cifra del día');
    });
  });

  test('el elemento resaltado late (animación) y con "reducir movimiento" se queda quieto', async ({ page }) => {
    await registrar(page, undefined, undefined, { saltarGuia: false });
    await page.getByRole('dialog', { name: 'Bienvenido a Korly' }).getByRole('button', { name: 'Empezar' }).click();
    const boton = page.getByRole('button', { name: 'Empezar esta quincena' });
    await expect(boton).toHaveClass(/resaltado-guia/);

    const animacion = () => boton.evaluate((el) => getComputedStyle(el).animationName);
    expect(await animacion()).toBe('resaltado-guia-latido');
    const sombra1 = await boton.evaluate((el) => getComputedStyle(el).boxShadow);
    await page.waitForTimeout(700);
    const sombra2 = await boton.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(sombra2).not.toBe(sombra1); // la onda cambió entre una lectura y otra: se está moviendo

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animacion()).toBe('none');
  });

  test('saltar la guía la apaga en la cuenta: no vuelve al recargar ni al volver a entrar', async ({ page }) => {
    const { correo } = await registrar(page, undefined, undefined, { saltarGuia: false });

    await page.getByRole('dialog', { name: 'Bienvenido a Korly' }).getByRole('button', { name: 'Saltar guía' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(guia(page)).toBeHidden();

    await page.reload();
    await expect(page.getByText('Empecemos')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await iniciarSesion(page, correo);
    await expect(page.getByText('Empecemos')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(guia(page)).toBeHidden();
  });

  test('en el celular los pasos caben en la pantalla sin desplazarse de lado', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await registrar(page, undefined, undefined, { saltarGuia: false });
    await page.getByRole('dialog', { name: 'Bienvenido a Korly' }).getByRole('button', { name: 'Empezar' }).click();

    await expect(guia(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
