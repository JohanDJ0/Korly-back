import { AUTH, CONTRASENA, correoUnico, expect, iniciarSesion, registrar, test } from './utilidades';

test.describe('acceso y sesión', () => {
  test('una pantalla protegida sin sesión lleva al inicio de sesión', async ({ page }) => {
    await page.goto('/ajustes');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible();
  });

  test('el registro con un correo que pide confirmación no da sesión y avisa que revises el correo', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Correo').fill(correoUnico('confirmar').replace('@', '+confirmar@'));
    await page.locator('#password').fill(CONTRASENA);
    await page.getByLabel('Confirma tu contraseña').fill(CONTRASENA);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await page.goto('/ajustes');
    await expect(page).toHaveURL(/\/login$/); // sin confirmar, no hay sesión
  });

  test('el registro exige aceptar los términos y el aviso, y que las contraseñas coincidan', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Correo').fill(correoUnico());
    await page.locator('#password').fill(CONTRASENA);
    await page.getByLabel('Confirma tu contraseña').fill('otra-distinta-1234');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
    await expect(page.getByText(/Debes aceptar los términos/)).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test('registrarse deja a la persona dentro, en Inicio, lista para empezar su quincena', async ({ page }) => {
    await registrar(page);

    await expect(page).toHaveURL(/localhost:5199\/$/);
    await expect(page.getByRole('button', { name: 'Empezar esta quincena' })).toBeVisible();
  });

  test('con la contraseña equivocada no entra y dice por qué; con la correcta sí', async ({ page }) => {
    const { correo } = await registrar(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click(); // el botón del menú lateral
    await expect(page).toHaveURL(/\/login$/);

    await iniciarSesion(page, correo, 'contrasena-equivocada');
    await expect(page.getByText('Invalid login credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await iniciarSesion(page, correo);
    await expect(page.getByText('Empecemos')).toBeVisible();
  });

  test('cerrar sesión desde Ajustes regresa al inicio de sesión y las pantallas dejan de abrirse', async ({ page, persona }) => {
    void persona;
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/historial');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('la sesión sobrevive a recargar la página', async ({ page, persona }) => {
    void persona;
    await page.reload();

    await expect(page.getByText('Empecemos')).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('el enlace del recordatorio (/?gasto=1) sin sesión pasa por el login y termina en la hoja de "Nuevo gasto"', async ({ page, persona }) => {
    await page.getByRole('button', { name: 'Empezar esta quincena' }).click();
    await expect(page.getByText('Registra tu ingreso')).toBeVisible(); // ya hay periodo: ya hay dónde registrar
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/?gasto=1'); // lo que abre el botón del correo
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Correo').fill(persona.correo);
    await page.getByLabel('Contraseña').fill(persona.contrasena);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('dialog', { name: 'Nuevo gasto' })).toBeVisible();
    await expect(page).toHaveURL(/localhost:5199\/$/); // el parámetro ya se quitó
  });

  test('con sesión abierta, el enlace del recordatorio abre la hoja de gasto al instante', async ({ page, persona }) => {
    void persona;
    await page.getByRole('button', { name: 'Empezar esta quincena' }).click();
    await expect(page.getByText('Registra tu ingreso')).toBeVisible();

    await page.goto('/?gasto=1');

    await expect(page.getByRole('dialog', { name: 'Nuevo gasto' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByText('Registra tu ingreso')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden(); // recargar no la reabre
  });

  test('quien ya tiene sesión no ve el inicio de sesión: lo mandan a Inicio', async ({ page, persona }) => {
    void persona;
    await page.goto('/login');

    await expect(page).toHaveURL(/localhost:5199\/$/);
  });

  test('si el aviso de privacidad cambió desde que lo aceptó, tiene que aceptarlo de nuevo antes de usar la app', async ({ page, request }) => {
    const correo = correoUnico('aviso');
    // Una cuenta creada cuando el aviso era otro (el servidor de mentira acepta metadatos a la medida).
    const creada = await request.post(`${AUTH}/__e2e/usuarios`, { data: { email: correo, password: CONTRASENA, metadata: { aviso_privacidad_version: '2026-01-01', terminos_version: '2026-01-01' } } });
    expect(creada.ok()).toBeTruthy();

    await iniciarSesion(page, correo);

    await expect(page.getByRole('heading', { name: 'Actualizamos nuestros términos y aviso' })).toBeVisible();
    await expect(page.getByText('Empecemos')).toBeHidden();
    await page.goto('/historial'); // ninguna pantalla se salta la puerta
    await expect(page.getByRole('heading', { name: 'Actualizamos nuestros términos y aviso' })).toBeVisible();

    const aceptar = page.getByRole('button', { name: 'Aceptar y continuar' });
    await expect(aceptar).toBeDisabled();
    await page.getByRole('checkbox').check();
    await aceptar.click();

    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
    const estado = await (await request.get(`${AUTH}/__e2e/usuarios?email=${encodeURIComponent(correo)}`)).json();
    expect(estado.user_metadata.aviso_privacidad_version).not.toBe('2026-01-01'); // quedó la constancia de la versión vigente
    expect(estado.user_metadata.aviso_privacidad_aceptado_en).toBeTruthy();
  });
});
