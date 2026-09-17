import { useState, type ReactNode } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';

interface BotonConfirmarProps extends VariantProps<typeof buttonVariants> {
  children: ReactNode;
  pregunta: string;
  onConfirmar: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Reemplaza `window.confirm` — hallazgo real del usuario: el botón
 * "Eliminar" de una meta "no hacía nada". El código estaba bien; el
 * diálogo nativo del navegador es lo que fallaba en silencio (algunas
 * extensiones/entornos lo suprimen sin avisar, y `!window.confirm(...)`
 * trata eso exactamente igual que un "Cancelar" real — no hay forma de
 * distinguir "el usuario canceló a propósito" de "el diálogo nunca se
 * mostró"). Una confirmación inline en la propia UI no depende de
 * ninguna API del navegador, así que no puede fallar de esa forma.
 *
 * Mismo componente para las 6 confirmaciones que había en el código
 * (5 "Eliminar" + "Cerrar periodo" en Home.tsx) — antes cada una
 * reimplementaba `if (!window.confirm(...)) return`.
 */
export function BotonConfirmar({ children, pregunta, onConfirmar, disabled, variant, size, className }: BotonConfirmarProps) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{pregunta}</span>
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled}
          onClick={() => {
            setConfirmando(false);
            onConfirmar();
          }}
        >
          Sí, confirmar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} disabled={disabled} onClick={() => setConfirmando(true)}>
      {children}
    </Button>
  );
}
