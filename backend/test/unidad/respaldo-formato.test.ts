import { describe, expect, it } from 'vitest';
import { parsearRespaldo } from '../../src/modulos/respaldos/contenido.js';
import { cifrarRespaldo, descifrarRespaldo, RespaldoInvalidoError } from '../../src/modulos/respaldos/formato.js';

const CLAVE = 'una contraseña larga de prueba';

describe('formato cifrado del respaldo', () => {
  it('lo que se cifra se recupera igual, con acentos y texto largo', async () => {
    const plano = Buffer.from('Quincena de Año Nuevo — café ☕ '.repeat(500), 'utf8');

    const archivo = await cifrarRespaldo(plano, CLAVE);

    expect((await descifrarRespaldo(archivo, CLAVE)).equals(plano)).toBe(true);
  });

  it('el archivo no deja ver el contenido en claro', async () => {
    const archivo = await cifrarRespaldo(Buffer.from('monto_valor_minimo 123456 correo@ejemplo.com'), CLAVE);

    expect(archivo.toString('latin1')).not.toContain('correo@ejemplo.com');
    expect(archivo.subarray(0, 8).toString('ascii')).toBe('KORLYBAK');
  });

  it('el mismo contenido nunca da dos archivos iguales (sal e IV nuevos)', async () => {
    const plano = Buffer.from('igual');

    const [a, b] = await Promise.all([cifrarRespaldo(plano, CLAVE), cifrarRespaldo(plano, CLAVE)]);

    expect(a.equals(b)).toBe(false);
  });

  it('con una contraseña distinta no abre', async () => {
    const archivo = await cifrarRespaldo(Buffer.from('secreto'), CLAVE);

    await expect(descifrarRespaldo(archivo, 'otra contraseña distinta')).rejects.toThrow(/contraseña es incorrecta o el archivo está dañado/);
  });

  it('un solo byte alterado, en el texto cifrado o en el encabezado, impide abrirlo', async () => {
    const archivo = await cifrarRespaldo(Buffer.from('secreto de la quincena'), CLAVE);
    for (const posicion of [archivo.length - 20, 30, archivo.length - 1]) {
      const alterado = Buffer.from(archivo);
      alterado[posicion] = (alterado[posicion] ?? 0) ^ 0x01;

      await expect(descifrarRespaldo(alterado, CLAVE)).rejects.toBeInstanceOf(RespaldoInvalidoError);
    }
  });

  it('un archivo cortado o que no es un respaldo se rechaza con un mensaje claro', async () => {
    const archivo = await cifrarRespaldo(Buffer.from('datos'), CLAVE);

    await expect(descifrarRespaldo(archivo.subarray(0, 20), CLAVE)).rejects.toThrow(/no es un respaldo de Korly/);
    await expect(descifrarRespaldo(Buffer.from('hola mundo, esto no es un respaldo de nada'), CLAVE)).rejects.toThrow(/no es un respaldo de Korly/);
  });

  it('un encabezado con parámetros de scrypt absurdos se rechaza antes de gastar memoria', async () => {
    const archivo = Buffer.from(await cifrarRespaldo(Buffer.from('datos'), CLAVE));
    archivo[9] = 30; // log2(N) = 30 pediría terabytes

    await expect(descifrarRespaldo(archivo, CLAVE)).rejects.toThrow(/encabezado/);
  });

  it('exige una contraseña de al menos 12 caracteres', async () => {
    await expect(cifrarRespaldo(Buffer.from('x'), 'corta')).rejects.toThrow(/al menos 12 caracteres/);
  });
});

describe('contenido del respaldo (parsearRespaldo)', () => {
  const manifiesto = 'M{"korly_respaldo":1,"creado_en":"2026-10-08T00:00:00.000Z","servidor":"PostgreSQL 17","migraciones":28,"ultima_migracion":"abc"}';
  const tabla = 'T{"esquema":"public","nombre":"gastos","columnas":[{"nombre":"id","tipo":"uuid"}]}';

  it('lee un respaldo completo y conserva cada fila como texto, sin tocar los números grandes', () => {
    const contenido = Buffer.from([manifiesto, tabla, 'R{"id":"a","monto":9007199254740993}', 'R{"id":"b","monto":1}', 'F{"tablas":{"public.gastos":2}}', ''].join('\n'));

    const leido = parsearRespaldo(contenido);

    expect(leido.tablas).toHaveLength(1);
    expect(leido.tablas[0]?.filas[0]).toBe('{"id":"a","monto":9007199254740993}'); // sin perder precisión
    expect(leido.manifiesto.migraciones).toBe(28);
  });

  it('un archivo al que le falta el cierre (cortado) se rechaza', () => {
    const contenido = Buffer.from([manifiesto, tabla, 'R{"id":"a"}', ''].join('\n'));

    expect(() => parsearRespaldo(contenido)).toThrow(/falta su cierre/);
  });

  it('si las filas no coinciden con el conteo del cierre, se rechaza', () => {
    const contenido = Buffer.from([manifiesto, tabla, 'R{"id":"a"}', 'F{"tablas":{"public.gastos":2}}', ''].join('\n'));

    expect(() => parsearRespaldo(contenido)).toThrow(/tiene 1 filas y debería tener 2/);
  });

  it('una fila antes de su tabla o texto basura se rechazan', () => {
    expect(() => parsearRespaldo(Buffer.from([manifiesto, 'R{"id":"a"}', ''].join('\n')))).toThrow(/antes de su tabla/);
    expect(() => parsearRespaldo(Buffer.from([manifiesto, 'basura', ''].join('\n')))).toThrow(/dañado/);
    expect(() => parsearRespaldo(Buffer.from('sin manifiesto\n'))).toThrow(/manifiesto/);
  });
});
