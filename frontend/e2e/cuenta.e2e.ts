import { readFile } from 'node:fs/promises';
import { CONTRASENA, conIngreso, correoUnico, expect, iniciarSesion, registrar, registrarGasto, test } from './utilidades';

test.describe('la cuenta y Ajustes', () => {
  test('los recordatorios por correo se apagan y la preferencia sobrevive a recargar', async ({ page, persona }) => {
    void persona;
    await page.goto('/ajustes');
    const casilla = page.getByRole('checkbox').first();
    await expect(casilla).toBeChecked(); // vienen activados al crear la cuenta

    await casilla.click(); // se actualiza cuando el servidor confirma, no al instante: por eso click y no uncheck
    await expect(casilla).not.toBeChecked();

    await page.reload();
    await expect(page.getByText('Recordatorios por correo')).toBeVisible();
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  });

  test('el plan es gratuito, Korly Pro llega pronto y "Avísame" guarda la petición (y se puede retirar)', async ({ page, persona }) => {
    void persona;
    await page.goto('/ajustes');
    await expect(page.getByText('Plan gratuito').first()).toBeVisible();
    await expect(page.getByText('Korly Pro llegará pronto')).toBeVisible();

    await page.getByRole('button', { name: 'Avísame cuando esté disponible' }).click();
    await expect(page.getByText(/te avisaremos por correo/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/te avisaremos por correo/)).toBeVisible(); // quedó guardada en el servidor

    await page.getByRole('button', { name: 'Ya no me avises' }).click();
    await expect(page.getByRole('button', { name: 'Avísame cuando esté disponible' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Avísame cuando esté disponible' })).toBeVisible(); // también se retiró en el servidor
  });

  test('cambiar la contraseña pide la actual, y después solo entra con la nueva', async ({ page, persona }) => {
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await page.getByLabel('Contraseña actual').fill('no-es-la-actual');
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('la-nueva-contrasena-1');
    await page.getByLabel('Confirma la contraseña nueva').fill('la-nueva-contrasena-1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText(/contraseña actual no es correcta/i)).toBeVisible(); // la comprueba antes de cambiar nada

    await page.getByLabel('Contraseña actual').fill(persona.contrasena);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Listo — tu contraseña se actualizó.')).toBeVisible();

    await page.getByRole('complementary').getByRole('button', { name: 'Cerrar sesión' }).click(); // el del menú lateral (Ajustes tiene otro en la tarjeta de cuenta)
    await iniciarSesion(page, persona.correo, persona.contrasena);
    await expect(page.getByText('Invalid login credentials')).toBeVisible(); // la vieja ya no sirve
    await iniciarSesion(page, persona.correo, 'la-nueva-contrasena-1');
    await expect(page.getByText('Empecemos')).toBeVisible();
  });

  test('descargar mis datos baja un archivo con lo que la persona capturó', async ({ page, persona }) => {
    void persona;
    await conIngreso(page, 7000);
    await registrarGasto(page, 321, 'nota para el archivo');
    await page.goto('/ajustes');

    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mis datos' }).click();
    const archivo = await descarga;

    expect(archivo.suggestedFilename()).toBe('korly-mis-datos.json');
    const contenido = await readFile(await archivo.path(), 'utf8');
    expect(contenido).toContain('nota para el archivo');
    expect(() => JSON.parse(contenido)).not.toThrow();
  });

  test('"Enviar comentarios" valida, y sin proveedor de correo (como aquí) avisa en vez de aparentar que lo envió', async ({ page, persona }) => {
    void persona;
    await page.goto('/ajustes');
    await page.getByRole('button', { name: /Enviar comentarios/ }).first().click();
    const hoja = page.getByRole('dialog', { name: 'Enviar comentarios' });

    await hoja.getByRole('button', { name: 'Enviar' }).click();
    await expect(hoja.getByText('Escribe tu comentario')).toBeVisible();

    await hoja.getByRole('radio', { name: 'Tengo una idea' }).click();
    await hoja.getByLabel('Tu comentario').fill('Me gustaría ver una gráfica por semana.');
    await hoja.getByRole('button', { name: 'Enviar' }).click();

    await expect(hoja.getByText(/Ahora mismo no podemos recibir comentarios/)).toBeVisible();
    await expect(hoja.getByLabel('Tu comentario')).toHaveValue('Me gustaría ver una gráfica por semana.'); // no pierde lo escrito
  });

  test('el aviso de privacidad y los términos se abren sin iniciar sesión', async ({ page }) => {
    await page.goto('/privacidad');
    await expect(page.getByRole('heading', { name: /Aviso de privacidad/ }).first()).toBeVisible();
    await expect(page.getByText('Cloudflare Turnstile')).toBeVisible();

    await page.goto('/terminos');
    await expect(page.getByRole('heading', { name: /Términos y condiciones/ }).first()).toBeVisible();
  });

  test('eliminar la cuenta pide escribir ELIMINAR, borra todo y deja crear una cuenta nueva con el mismo correo desde cero', async ({ page }) => {
    const correo = correoUnico('eliminar');
    await registrar(page, correo);
    await conIngreso(page, 9000);
    await registrarGasto(page, 100);

    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    const borrar = page.getByRole('button', { name: 'Eliminar para siempre' });
    await expect(borrar).toBeDisabled();
    await page.getByLabel(/Para confirmar, escribe ELIMINAR/).fill('ELIMINAR');
    await borrar.click();

    await expect(page).toHaveURL(/\/login$/);
    await iniciarSesion(page, correo);
    await expect(page.getByText('Invalid login credentials')).toBeVisible(); // la cuenta ya no existe

    await registrar(page, correo, CONTRASENA); // mismo correo: cuenta nueva, sin rastro de lo anterior
    await expect(page.getByText('Empecemos')).toBeVisible();
  });
});
