import { Briefcase, GraduationCap, House, ShoppingBag, Tag, UtensilsCrossed, type LucideIcon } from 'lucide-react';

/**
 * Las categorías son texto libre del usuario (backend/README.md,
 * "Categorías" — nunca un enum cerrado), así que no hay un mapeo
 * garantizado a un ícono. Esto es una mejora puramente visual por
 * palabra clave, con un ícono genérico de respaldo — nunca bloquea ni
 * cambia el nombre real que el usuario capturó.
 */
const PALABRAS_CLAVE: [RegExp, LucideIcon][] = [
  [/comida|super|mercado|restaurante|antojo/i, UtensilsCrossed],
  [/renta|casa|hogar|luz|agua|gas\b/i, House],
  [/proyecto|trabajo|oficina|negocio/i, Briefcase],
  [/estudio|curso|escuela|universidad|libro/i, GraduationCap],
  [/ropa|compra|tienda/i, ShoppingBag],
];

export function iconoCategoria(nombre: string | undefined): LucideIcon {
  if (!nombre) return Tag;
  const encontrado = PALABRAS_CLAVE.find(([patron]) => patron.test(nombre));
  return encontrado?.[1] ?? Tag;
}
