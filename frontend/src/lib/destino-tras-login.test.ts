import { describe, expect, it } from 'vitest';

import { destinoTrasLogin } from '@/lib/destino-tras-login';

describe('destinoTrasLogin', () => {
  it('respeta una ruta interna con su query (el enlace del recordatorio)', () => {
    expect(destinoTrasLogin({ desde: '/?gasto=1' })).toBe('/?gasto=1');
    expect(destinoTrasLogin({ desde: '/historial?x=2#a' })).toBe('/historial?x=2#a');
  });

  it('sin estado, o con un estado que no es de la app, cae en la raíz', () => {
    expect(destinoTrasLogin(undefined)).toBe('/');
    expect(destinoTrasLogin(null)).toBe('/');
    expect(destinoTrasLogin({})).toBe('/');
    expect(destinoTrasLogin({ desde: 5 })).toBe('/');
  });

  it('no sigue destinos externos ni protocolos relativos', () => {
    expect(destinoTrasLogin({ desde: 'https://malo.example/' })).toBe('/');
    expect(destinoTrasLogin({ desde: '//malo.example' })).toBe('/');
    expect(destinoTrasLogin({ desde: '/\\malo.example' })).toBe('/');
    expect(destinoTrasLogin({ desde: 'javascript:alert(1)' })).toBe('/');
  });

  it('no regresa a las pantallas de acceso (evita bucles)', () => {
    expect(destinoTrasLogin({ desde: '/login' })).toBe('/');
    expect(destinoTrasLogin({ desde: '/registro?x=1' })).toBe('/');
    expect(destinoTrasLogin({ desde: '/olvide-password' })).toBe('/');
  });
});
