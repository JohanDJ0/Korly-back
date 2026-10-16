/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Vitest corre desde frontend/. Se leen directo del disco (Vite no sirve archivos de fuera del proyecto, y no vale la pena abrirle el repositorio entero al servidor de desarrollo).
const fuenteDeLaCalculadora = readFileSync(resolve(process.cwd(), '../landing/public/calculadora/calculadora.js'), 'utf8');
const paginaDeLaCalculadora = readFileSync(resolve(process.cwd(), '../landing/public/calculadora/index.html'), 'utf8');

/**
 * La calculadora de gasto diario de la landing (korly.com.mx/calculadora/) es JavaScript suelto, sin su propio paquete de
 * pruebas: se prueba desde aquí, con la misma cuenta que usa la app (backend/src/modulos/disponible/motor-flujo-caja.ts) y
 * con los números de los ejemplos de las guías, que no pueden contradecirla.
 */
interface Calculadora {
  aCentavos: (texto: string) => number | null;
  aDias: (texto: string) => number | null;
  calcular: (datos: { dineroCentavos: number | null; fijosCentavos: number | null; dias: number | null }) => { libreCentavos: number; dias: number; porDiaCentavos: number; alcanza: boolean } | null;
  quincenaDe: (fecha: Date) => { inicio: number; fin: number; diasRestantes: number; dia: number; nombreMes: string };
}

function cargar(): Calculadora {
  // El cuerpo del <form> real de la página, para probar también el cableado con los campos.
  const formulario = /<form class="calc"[\s\S]*?<\/form>/.exec(paginaDeLaCalculadora)?.[0];
  if (!formulario) throw new Error('No se encontró el formulario de la calculadora en su página');
  document.body.innerHTML = formulario;
  new Function(fuenteDeLaCalculadora)();
  return (window as unknown as { KorlyCalculadora: Calculadora }).KorlyCalculadora;
}

let calc: Calculadora;
beforeAll(() => {
  calc = cargar();
});

describe('calculadora de la landing — la cuenta', () => {
  it('los ejemplos de las guías: $3,600 entre 15 días son $240 al día', () => {
    const r = calc.calcular({ dineroCentavos: 360000, fijosCentavos: 0, dias: 15 });
    expect(r?.porDiaCentavos).toBe(24000);
  });

  it('del 16 al 31 (16 días) con los mismos $3,600: $225 al día, no $240', () => {
    expect(calc.calcular({ dineroCentavos: 360000, fijosCentavos: 0, dias: 16 })?.porDiaCentavos).toBe(22500);
  });

  it('a mitad de quincena: $1,500 entre 7 días son $214.28 (redondeo hacia abajo al centavo)', () => {
    expect(calc.calcular({ dineroCentavos: 150000, fijosCentavos: 0, dias: 7 })?.porDiaCentavos).toBe(21428);
  });

  it('si te pasas un día: $3,200 entre 14 días son $228.57', () => {
    expect(calc.calcular({ dineroCentavos: 320000, fijosCentavos: 0, dias: 14 })?.porDiaCentavos).toBe(22857);
  });

  it('resta los pagos fijos antes de repartir: sueldo $6,000 − $2,400 fijos entre 15 días', () => {
    const r = calc.calcular({ dineroCentavos: 600000, fijosCentavos: 240000, dias: 15 });
    expect(r).toMatchObject({ libreCentavos: 360000, porDiaCentavos: 24000, alcanza: true });
  });

  it('el último día cuenta como 1 día, no como 0', () => {
    expect(calc.calcular({ dineroCentavos: 50000, fijosCentavos: 0, dias: 1 })?.porDiaCentavos).toBe(50000);
  });

  it('con los pagos fijos mayores al dinero avisa que no alcanza y redondea hacia abajo también en negativo (el piso de -142.857 es -143)', () => {
    const r = calc.calcular({ dineroCentavos: 100000, fijosCentavos: 200000, dias: 7 });
    expect(r?.alcanza).toBe(false);
    expect(r?.porDiaCentavos).toBe(-14286); // -100000 / 7 = -14285.71 → piso -14286
  });

  it('sin dinero o sin días todavía no hay resultado', () => {
    expect(calc.calcular({ dineroCentavos: null, fijosCentavos: 0, dias: 15 })).toBeNull();
    expect(calc.calcular({ dineroCentavos: 100000, fijosCentavos: 0, dias: null })).toBeNull();
  });
});

describe('calculadora de la landing — lo que se escribe', () => {
  it('entiende pesos con comas, signo y centavos', () => {
    expect(calc.aCentavos('3600')).toBe(360000);
    expect(calc.aCentavos('3,600.50')).toBe(360050);
    expect(calc.aCentavos('$ 1,200')).toBe(120000);
    expect(calc.aCentavos('0.1')).toBe(10);
    expect(calc.aCentavos('19.99')).toBe(1999); // sin errores de punto flotante
  });

  it('rechaza lo que no es dinero', () => {
    for (const texto of ['', 'abc', '12.345', '1,2,x', '.', '-5', '1e3']) expect(calc.aCentavos(texto), texto).toBeNull();
  });

  it('los días son enteros de 1 a 31', () => {
    expect(calc.aDias('15')).toBe(15);
    expect(calc.aDias(' 7 ')).toBe(7);
    for (const texto of ['0', '32', '1.5', '-3', 'x', '']) expect(calc.aDias(texto), texto).toBeNull();
  });
});

describe('calculadora de la landing — la quincena de hoy', () => {
  it('del 1 al 15: los días que faltan cuentan hoy', () => {
    expect(calc.quincenaDe(new Date(2026, 9, 1))).toMatchObject({ inicio: 1, fin: 15, diasRestantes: 15 });
    expect(calc.quincenaDe(new Date(2026, 9, 9))).toMatchObject({ inicio: 1, fin: 15, diasRestantes: 7 });
    expect(calc.quincenaDe(new Date(2026, 9, 15))).toMatchObject({ inicio: 1, fin: 15, diasRestantes: 1 });
  });

  it('del 16 al último día del mes, que cambia según el mes', () => {
    expect(calc.quincenaDe(new Date(2026, 9, 16))).toMatchObject({ inicio: 16, fin: 31, diasRestantes: 16 }); // octubre
    expect(calc.quincenaDe(new Date(2026, 8, 16))).toMatchObject({ inicio: 16, fin: 30, diasRestantes: 15 }); // septiembre
    expect(calc.quincenaDe(new Date(2026, 1, 16))).toMatchObject({ inicio: 16, fin: 28, diasRestantes: 13 }); // febrero
    expect(calc.quincenaDe(new Date(2028, 1, 16))).toMatchObject({ inicio: 16, fin: 29, diasRestantes: 14 }); // febrero bisiesto
    expect(calc.quincenaDe(new Date(2026, 9, 31))).toMatchObject({ diasRestantes: 1 });
  });
});

describe('calculadora de la landing — el formulario de la página', () => {
  const escribir = (id: string, valor: string) => {
    const campo = document.getElementById(id) as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const cifra = () => document.getElementById('cifra')?.textContent;
  const detalle = () => document.getElementById('detalle')?.textContent;

  it('propone los días de la quincena de hoy desde el principio', () => {
    expect((document.getElementById('dias') as HTMLInputElement).value).toMatch(/^\d{1,2}$/);
    expect(document.getElementById('quincena-texto')?.textContent).toMatch(/estás en la quincena del \d+ al \d+ de /);
  });

  it('muestra el gasto diario al escribir dinero y días', () => {
    escribir('dinero', '3600');
    escribir('fijos', '');
    escribir('dias', '15');

    expect(cifra()).toBe('$240.00');
    expect(detalle()).toContain('entre 15 días');
  });

  it('con pagos fijos los resta y lo dice', () => {
    escribir('dinero', '6,000');
    escribir('fijos', '2400');
    escribir('dias', '15');

    expect(cifra()).toBe('$240.00');
    expect(detalle()).toContain('después de $2,400.00 de pagos fijos');
  });

  it('con un día usa el singular', () => {
    escribir('dinero', '500');
    escribir('fijos', '');
    escribir('dias', '1');

    expect(detalle()).toContain('entre 1 día,');
  });

  it('si los pagos fijos pasan del dinero, lo marca en rojo y lo explica', () => {
    escribir('dinero', '1000');
    escribir('fijos', '2000');
    escribir('dias', '7');

    expect(document.getElementById('resultado')?.classList.contains('negativo')).toBe(true);
    expect(detalle()).toContain('superan el dinero que tienes');
  });

  it('un dato mal escrito da una pista, no un número raro', () => {
    escribir('dinero', 'tres mil');
    escribir('fijos', '');
    escribir('dias', '15');

    expect(cifra()).toBe('—');
    expect(detalle()).toContain('Revisa el dinero que tienes');
    expect(document.getElementById('resultado')?.classList.contains('negativo')).toBe(false);
  });

  it('el botón vuelve a poner los días de la quincena de hoy', () => {
    escribir('dias', '3');
    const antes = (document.getElementById('dias') as HTMLInputElement).value;
    (document.getElementById('usar-dias') as HTMLButtonElement).click();

    expect(antes).toBe('3');
    expect(Number((document.getElementById('dias') as HTMLInputElement).value)).toBeGreaterThanOrEqual(1);
    expect((document.getElementById('dias') as HTMLInputElement).value).not.toBe('3');
  });
});
