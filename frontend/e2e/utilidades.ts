import { expect, test as base, type Page } from '@playwright/test';

export const API = 'http://localhost:3199/v1';
export const AUTH = 'http://localhost:54399';
export const CONTRASENA = 'una-contrasena-de-prueba';

let contador = 0;

/** Un correo que nadie ha usado en esta corrida (la pila es compartida entre pruebas). */
export function correoUnico(prefijo = 'persona'): string {
  contador += 1;
  return `${prefijo}-${Date.now().toString(36)}-${contador}@prueba.korly.local`;
}

/** Pesos con el formato de la app (es-MX), para comparar lo que se ve en pantalla. */
export const pesos = (monto: number): string => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);

/** Crea una cuenta por la pantalla de registro (la de verdad) y deja a la persona dentro, en Inicio. */
export async function registrar(page: Page, correo = correoUnico(), contrasena = CONTRASENA): Promise<{ correo: string; contrasena: string }> {
  await page.goto('/registro');
  await page.getByLabel('Correo').fill(correo);
  await page.locator('#password').fill(contrasena);
  await page.getByLabel('Confirma tu contraseña').fill(contrasena);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Empecemos')).toBeVisible();
  return { correo, contrasena };
}

export async function iniciarSesion(page: Page, correo: string, contrasena = CONTRASENA): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Empieza la quincena y registra el ingreso: lo mínimo para ver la cifra del día. */
export async function conIngreso(page: Page, monto: number): Promise<void> {
  await page.getByRole('button', { name: 'Empezar esta quincena' }).click();
  await page.getByLabel('¿Cuánto recibiste?').fill(String(monto));
  await page.getByRole('button', { name: 'Registrar ingreso' }).click();
  await expect(page.getByText('Puedes gastar hoy')).toBeVisible();
}

/** Registra un gasto desde Inicio y espera a que la hoja se cierre. */
export async function registrarGasto(page: Page, monto: number, nota?: string): Promise<void> {
  await page.getByRole('button', { name: 'Registrar gasto' }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await hoja.getByLabel('¿Cuánto gastaste?').fill(String(monto));
  if (nota) await hoja.getByLabel(/Nota/i).fill(nota);
  await hoja.getByRole('button', { name: /^Registrar/ }).click();
  await expect(hoja).toBeHidden();
}

const TITULOS = { Historial: 'Historial', Metas: 'Metas de ahorro', Tarjetas: 'Tarjetas de crédito', Más: 'Ajustes' } as const;

/** Va a una pantalla con el menú (lateral o de abajo) y ESPERA a que cargue: sin esto, el siguiente `getByText` puede ver todavía la pantalla anterior. */
export async function irA(page: Page, destino: keyof typeof TITULOS): Promise<void> {
  await page.getByRole('link', { name: destino, exact: true }).first().click();
  await expect(page.getByRole('heading', { name: TITULOS[destino] })).toBeVisible();
}

/** `test` con una persona ya registrada y dentro de la app (cuenta nueva por prueba). */
export const test = base.extend<{ persona: { correo: string; contrasena: string } }>({
  persona: async ({ page }, usar) => {
    await usar(await registrar(page));
  },
});

export { expect };
