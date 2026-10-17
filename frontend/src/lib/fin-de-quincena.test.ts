import { describe, expect, it } from 'vitest';

import { avisoFinDeQuincena, quincenaPorTerminar } from '@/lib/fin-de-quincena';

describe('aviso de fin de quincena', () => {
  it('no avisa antes de los últimos tres días ni después de que terminó', () => {
    expect(avisoFinDeQuincena('2026-10-15', '2026-10-11')).toBeNull();
    expect(avisoFinDeQuincena('2026-10-15', '2026-10-16')).toBeNull();
    expect(quincenaPorTerminar('2026-10-15', '2026-10-01')).toBe(false);
  });

  it('a 3 y 2 días: "está por terminar", con el último día y el día en que empieza la nueva', () => {
    expect(avisoFinDeQuincena('2026-10-15', '2026-10-12')).toEqual({
      titulo: 'Tu quincena está por terminar.',
      texto:
        'Le quedan 3 días: termina el 15 de octubre. No tienes que hacer nada: se cierra sola al terminar ese día. El 16 te pediremos empezar la nueva quincena y decidir qué hacer con lo que te haya sobrado: pasarlo a la siguiente o guardarlo en una meta.',
    });
    expect(avisoFinDeQuincena('2026-10-15', '2026-10-13')?.texto).toMatch(/^Le quedan 2 días: termina el 15 de octubre\./);
  });

  it('a 1 día: "termina mañana"', () => {
    expect(avisoFinDeQuincena('2026-10-15', '2026-10-14')).toEqual({
      titulo: 'Tu quincena termina mañana.',
      texto:
        'El 15 de octubre es su último día. No tienes que cerrarla: se cierra sola al terminar el día. El 16 te pediremos empezar la nueva quincena y decidir qué hacer con lo que te haya sobrado.',
    });
  });

  it('el último día: "hoy es el último día" y que el pago de la siguiente se registre mañana', () => {
    const aviso = avisoFinDeQuincena('2026-10-15', '2026-10-15');
    expect(aviso?.titulo).toBe('Hoy es el último día de tu quincena.');
    expect(aviso?.texto).toContain('Si ya te pagaron la siguiente, regístrala mañana al empezarla.');
  });

  it('en la segunda quincena la nueva empieza el 1 (también en febrero y en fin de año)', () => {
    expect(avisoFinDeQuincena('2026-10-31', '2026-10-29')?.texto).toContain('termina el 31 de octubre');
    expect(avisoFinDeQuincena('2026-10-31', '2026-10-29')?.texto).toContain('El 1 te pediremos');
    expect(avisoFinDeQuincena('2027-02-28', '2027-02-27')?.texto).toContain('El 1 te pediremos');
    expect(avisoFinDeQuincena('2026-12-31', '2026-12-30')?.texto).toContain('El 1 te pediremos');
  });
});
