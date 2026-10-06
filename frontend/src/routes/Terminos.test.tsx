import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { Terminos } from '@/routes/Terminos';
import { renderConProveedores } from '@/test/utilidades';

/** Fija lo importante de los términos, no la redacción: si alguien borra una cláusula por accidente, esto avisa. */
describe('Términos y condiciones', () => {
  it('aclara que Korly no es asesoría financiera ni mueve dinero', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText(/No es asesoría financiera, fiscal, contable ni legal/)).toBeInTheDocument();
    expect(screen.getByText(/no se conecta con tu banco, no mueve ni guarda tu dinero/)).toBeInTheDocument();
  });

  it('describe los límites del plan gratuito tal como los aplica la app', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText('Hasta 2 metas de ahorro.')).toBeInTheDocument();
    expect(screen.getByText('El historial de los últimos 12 meses.')).toBeInTheDocument();
    expect(screen.getByText('Hasta 30 categorías personalizadas.')).toBeInTheDocument();
    expect(screen.getByText(/Sin exportación de gastos e ingresos a CSV/)).toBeInTheDocument();
  });

  it('dice que Korly Pro todavía no se vende y que no se cobra sin contratarlo de forma expresa', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText(/Korly Pro todavía no se vende/)).toBeInTheDocument();
    expect(screen.getByText(/no se te cobrará nada sin\s+que lo contrates de forma expresa/)).toBeInTheDocument();
  });

  it('recomienda descargar los datos porque las copias de seguridad no se garantizan', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText('Descárgalos de vez en cuando.')).toBeInTheDocument();
  });

  it('respeta los derechos del consumidor y menciona a Profeco', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText(/derechos que la ley te reconoce como consumidor/)).toBeInTheDocument();
    expect(screen.getByText(/Profeco/)).toBeInTheDocument();
  });

  it('tiene índice y es detallado, pero no repite el aviso: sin domicilio, y remite al aviso de privacidad', () => {
    renderConProveedores(<Terminos />);

    const indice = screen.getByRole('navigation', { name: 'Contenido' });
    expect(within(indice).getAllByRole('link').length).toBeGreaterThanOrEqual(12);
    expect(document.body).not.toHaveTextContent('Domicilio');
    expect(screen.getAllByRole('link', { name: 'Aviso de privacidad' }).every((a) => a.getAttribute('href') === '/privacidad')).toBe(true);
  });

  it('el nombre de quien ofrece Korly va en la última sección, no arriba', () => {
    renderConProveedores(<Terminos />);

    const secciones = [...document.querySelectorAll('section')];
    expect(secciones.at(-1)).toHaveAttribute('id', 'contacto');
    expect(secciones.at(-1)).toHaveTextContent('Korly es un servicio de');
    expect(secciones.slice(0, -1).some((s) => s.textContent?.includes('Korly es un servicio de'))).toBe(false);
    expect(document.querySelector('header')).not.toHaveTextContent('Korly es un servicio de');
  });

  it('mientras falten datos del responsable, se avisa que hay datos pendientes', () => {
    renderConProveedores(<Terminos />);

    expect(screen.getByText('Pendiente.')).toBeInTheDocument();
  });
});
