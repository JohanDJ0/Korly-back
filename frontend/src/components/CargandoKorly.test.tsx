import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CargandoKorly } from '@/components/CargandoKorly';

describe('CargandoKorly', () => {
  it('avisa a los lectores de pantalla que está cargando, y el dibujo es decorativo', () => {
    const { container } = render(<CargandoKorly />);

    const estado = screen.getByRole('status');
    expect(estado).toHaveTextContent('Cargando');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('la etiqueta se puede cambiar según lo que se esté haciendo', () => {
    render(<CargandoKorly etiqueta="Entrando" />);

    expect(screen.getByRole('status')).toHaveTextContent('Entrando');
  });

  it('en línea respeta el tamaño pedido y no ocupa toda la pantalla', () => {
    const { container } = render(<CargandoKorly tamano={22} />);

    expect(screen.getByRole('status')).toHaveStyle({ width: '22px', height: '22px' });
    expect(container.querySelector('.auth-shell')).toBeNull();
  });

  it('a pantalla completa va sobre el fondo verde de acceso y se ve más grande', () => {
    const { container } = render(<CargandoKorly pantallaCompleta tamano={40} />);

    expect(container.querySelector('.auth-shell')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveStyle({ width: '72px', height: '72px' });
  });
});
