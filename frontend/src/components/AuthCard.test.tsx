import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthCard } from '@/components/AuthCard';

function montar(props: { sinPieLegal?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <AuthCard titulo="Bienvenido de vuelta" descripcion="Inicia sesión para ver cuánto puedes gastar hoy." {...props}>
        <p>contenido del formulario</p>
      </AuthCard>
    </MemoryRouter>
  );
}

describe('AuthCard (pantalla de acceso)', () => {
  it('muestra el título como encabezado principal, la descripción y el contenido', () => {
    montar();

    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenido de vuelta' })).toBeInTheDocument();
    expect(screen.getByText('Inicia sesión para ver cuánto puedes gastar hoy.')).toBeInTheDocument();
    expect(screen.getByText('contenido del formulario')).toBeInTheDocument();
  });

  it('lleva la marca arriba (ícono y nombre) y el dibujo interactivo en el panel de la izquierda', () => {
    const { container } = montar();

    expect(screen.getByText('Korly')).toBeInTheDocument();
    expect(container.querySelector('aside [data-testid="arte-interactivo"]')).not.toBeNull();
    expect(container.querySelector('.auth-shell')).not.toBeNull();
  });

  it('las figuras que se salen de la imagen van a color y en contornos, para que también cambien con el cursor', () => {
    const { container } = montar();

    const salientes = container.querySelector('[data-testid="arte-salientes"]')!;
    expect(salientes.querySelectorAll('svg.arte-saliente.arte-color')).toHaveLength(2);
    expect(salientes.querySelectorAll('svg.arte-saliente.arte-contornos')).toHaveLength(2);
  });

  it('al pie enlaza el aviso de privacidad y los términos', () => {
    montar();

    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/privacidad');
    expect(screen.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/terminos');
  });

  it('sin pie legal no repite esos enlaces (el formulario ya los trae)', () => {
    montar({ sinPieLegal: true });

    expect(screen.queryByRole('link', { name: 'Aviso de privacidad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Términos y condiciones' })).not.toBeInTheDocument();
  });
});
