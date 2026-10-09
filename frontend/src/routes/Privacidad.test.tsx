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

import { Privacidad } from '@/routes/Privacidad';
import { renderConProveedores } from '@/test/utilidades';

/**
 * No prueba redacción palabra por palabra: fija que el aviso siga diciendo lo que la ley nueva (DOF 2025-03-20)
 * pide y lo que revisamos contra la app el 2026-10-06. Si alguien lo borra por accidente, esto avisa.
 */
describe('Aviso de privacidad', () => {
  it('separa las finalidades necesarias de las voluntarias y pone ahí los recordatorios y el aviso de Pro', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText('Finalidades necesarias')).toBeInTheDocument();
    expect(screen.getByText('Finalidades voluntarias')).toBeInTheDocument();
    expect(screen.getByText(/Mandarte un recordatorio por correo/)).toBeInTheDocument();
    expect(screen.getByText(/Recibir tus comentarios y, si marcas la casilla, responderte/)).toBeInTheDocument();
    expect(screen.getByText(/Avisarte por correo cuando Korly Pro esté disponible/)).toBeInTheDocument();
  });

  it('dice que los datos están fuera de México y nombra a cada proveedor', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText(/guardan o procesan tus datos fuera de México, principalmente en Estados Unidos/)).toBeInTheDocument();
    for (const proveedor of ['Supabase', 'Railway', 'Vercel', 'Resend', 'Sentry', 'Stripe', 'Cloudflare Turnstile', 'Cloudflare y Google']) {
      expect(screen.getByText(proveedor, { selector: 'strong' })).toBeInTheDocument();
    }
  });

  it('avisa que el correo del recordatorio lleva cifras de su dinero y cuándo no se manda', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText(/incluye\s+cifras de tu dinero/)).toBeInTheDocument();
    expect(screen.getByText(/cada tres días en vez de todos los días/)).toBeInTheDocument();
  });

  it('nombra a la autoridad, los medios para limitar el uso, la mayoría de edad y el almacenamiento del navegador', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText(/Secretaría Anticorrupción y Buen Gobierno/)).toBeInTheDocument();
    expect(screen.getByText(/Oposición y limitar el uso/)).toBeInTheDocument();
    expect(screen.getByText(/mayores de 18 años/)).toBeInTheDocument();
    expect(screen.getByText(/No usamos cookies de publicidad ni\s+de analítica/)).toBeInTheDocument();
  });

  it('explica cuánto duran las copias de seguridad y que un cambio de finalidades pide aceptar otra vez', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText(/como máximo 30 días/)).toBeInTheDocument();
    expect(screen.getByText(/te pediremos que lo leas y lo aceptes de nuevo/)).toBeInTheDocument();
  });

  it('arriba va un resumen corto con el contacto y un índice; quién es el responsable queda en la última sección, no en el resumen', () => {
    renderConProveedores(<Privacidad />);

    const resumen = screen.getByRole('complementary', { name: 'Resumen' });
    expect(resumen).toHaveTextContent('No vendemos tus datos');
    expect(resumen).toHaveTextContent('privacidad@korly.com.mx');
    expect(resumen).not.toHaveTextContent('responsable');

    const indice = screen.getByRole('navigation', { name: 'Contenido' });
    const entradas = within(indice).getAllByRole('link');
    expect(entradas.length).toBeGreaterThanOrEqual(10);
    expect(entradas.at(-1)).toHaveTextContent('Responsable del tratamiento y contacto');
    expect(entradas.at(-1)).toHaveAttribute('href', '#responsable');

    const secciones = [...document.querySelectorAll('section')];
    expect(secciones.at(-1)).toHaveAttribute('id', 'responsable');
    expect(secciones.at(-1)).toHaveTextContent('Domicilio para oír y recibir notificaciones');
    // Ninguna otra sección repite el domicilio.
    expect(secciones.slice(0, -1).some((s) => s.textContent?.includes('Domicilio para oír'))).toBe(false);
  });

  it('mientras falten el nombre y el domicilio del responsable, se avisa que hay datos pendientes', () => {
    renderConProveedores(<Privacidad />);

    expect(screen.getByText('Pendiente.')).toBeInTheDocument();
  });
});
