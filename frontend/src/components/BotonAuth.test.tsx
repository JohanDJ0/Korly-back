import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { BotonAuth } from '@/components/BotonAuth';

describe('BotonAuth', () => {
  it('por defecto es un botón de tecla dorado que no envía formularios por accidente (type=button)', () => {
    render(<BotonAuth>Entrar</BotonAuth>);

    const boton = screen.getByRole('button', { name: 'Entrar' });
    expect(boton).toHaveClass('btn-3d');
    expect(boton).not.toHaveClass('btn-3d--oscuro');
    expect(boton).toHaveAttribute('type', 'button');
  });

  it('el texto va dentro de un span: es lo que se hunde junto con la cara', () => {
    render(<BotonAuth>Entrar</BotonAuth>);

    expect(screen.getByRole('button').firstElementChild?.tagName).toBe('SPAN');
  });

  it('puede ser de envío, y deshabilitado no responde al clic', async () => {
    const alClic = vi.fn();
    const usuario = userEvent.setup();
    render(
      <BotonAuth type="submit" disabled onClick={alClic}>
        Guardar
      </BotonAuth>
    );

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toHaveAttribute('type', 'submit');
    expect(boton).toBeDisabled();
    await usuario.click(boton);
    expect(alClic).not.toHaveBeenCalled();
  });

  it('la variante oscura y la plana cambian de estilo', () => {
    render(
      <>
        <BotonAuth variante="oscuro">Crear cuenta</BotonAuth>
        <BotonAuth variante="plano">Cerrar sesión</BotonAuth>
      </>
    );

    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toHaveClass('btn-3d', 'btn-3d--oscuro');
    const plano = screen.getByRole('button', { name: 'Cerrar sesión' });
    expect(plano).toHaveClass('btn-plano');
    expect(plano).not.toHaveClass('btn-3d');
  });

  it('con "to" es un enlace del router con el mismo aspecto', () => {
    render(
      <MemoryRouter>
        <BotonAuth to="/login" variante="oscuro">
          Volver a iniciar sesión
        </BotonAuth>
      </MemoryRouter>
    );

    const enlace = screen.getByRole('link', { name: 'Volver a iniciar sesión' });
    expect(enlace).toHaveAttribute('href', '/login');
    expect(enlace).toHaveClass('btn-3d', 'btn-3d--oscuro');
  });
});
