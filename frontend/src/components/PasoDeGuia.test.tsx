import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PasoDeGuia, RESALTADO_GUIA } from '@/components/PasoDeGuia';

describe('PasoDeGuia', () => {
  it('muestra el texto y sus botones, y cada uno hace lo suyo', async () => {
    const principal = vi.fn();
    const secundaria = vi.fn();
    const saltar = vi.fn();
    const usuario = userEvent.setup();
    render(<PasoDeGuia titulo="Un título" texto="Un texto" etiquetaPrincipal="Siguiente" onPrincipal={principal} etiquetaSecundaria="Ahora no" onSecundaria={secundaria} onSaltar={saltar} />);

    expect(screen.getByRole('region', { name: 'Guía de Korly' })).toHaveTextContent('Un título');
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));
    await usuario.click(screen.getByRole('button', { name: 'Ahora no' }));
    await usuario.click(screen.getByRole('button', { name: 'Saltar guía' }));

    expect(principal).toHaveBeenCalledTimes(1);
    expect(secundaria).toHaveBeenCalledTimes(1);
    expect(saltar).toHaveBeenCalledTimes(1);
  });

  it('sin onSaltar no ofrece "Saltar guía" (el último paso)', () => {
    render(<PasoDeGuia texto="Fin" etiquetaPrincipal="Terminar" onPrincipal={() => undefined} />);

    expect(screen.queryByRole('button', { name: 'Saltar guía' })).not.toBeInTheDocument();
  });
});

describe('el resaltado de la guía', () => {
  it('es la clase del aro dorado que late (su animación se comprueba en el navegador: e2e/guia.e2e.ts)', () => {
    expect(RESALTADO_GUIA).toBe('resaltado-guia');
  });
});
