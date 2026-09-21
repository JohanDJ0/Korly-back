import {
  Briefcase,
  Gift,
  GraduationCap,
  Heart,
  House,
  Laptop,
  PawPrint,
  PiggyBank,
  Plane,
  Popcorn,
  Receipt,
  Shirt,
  ShoppingBag,
  Tag,
  Car,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mismo set fijo que `ICONOS_CATEGORIA_VALIDOS` en
 * backend/src/modulos/categorias/categorias.ts — agregar uno nuevo
 * requiere actualizar ambos lados (el backend solo valida la clave,
 * nunca sabe qué ícono real le corresponde).
 */
export const ICONOS_CATEGORIA: { clave: string; etiqueta: string; Icono: LucideIcon }[] = [
  { clave: 'comida', etiqueta: 'Comida', Icono: UtensilsCrossed },
  { clave: 'transporte', etiqueta: 'Transporte', Icono: Car },
  { clave: 'vivienda', etiqueta: 'Vivienda', Icono: House },
  { clave: 'servicios', etiqueta: 'Servicios', Icono: Receipt },
  { clave: 'salud', etiqueta: 'Salud', Icono: Heart },
  { clave: 'entretenimiento', etiqueta: 'Entretenimiento', Icono: Popcorn },
  { clave: 'ropa', etiqueta: 'Ropa', Icono: Shirt },
  { clave: 'educacion', etiqueta: 'Educación', Icono: GraduationCap },
  { clave: 'ahorro', etiqueta: 'Ahorro', Icono: PiggyBank },
  { clave: 'compras', etiqueta: 'Compras', Icono: ShoppingBag },
  { clave: 'proyectos', etiqueta: 'Proyectos', Icono: Briefcase },
  { clave: 'mascotas', etiqueta: 'Mascotas', Icono: PawPrint },
  { clave: 'viajes', etiqueta: 'Viajes', Icono: Plane },
  { clave: 'regalos', etiqueta: 'Regalos', Icono: Gift },
  { clave: 'tecnologia', etiqueta: 'Tecnología', Icono: Laptop },
  { clave: 'otros', etiqueta: 'Otros', Icono: Tag },
];

const ICONO_POR_CLAVE = new Map(ICONOS_CATEGORIA.map((i) => [i.clave, i.Icono]));

/**
 * Palabras clave sobre el NOMBRE — respaldo para categorías que
 * todavía no tienen un ícono elegido explícitamente (`icono: null`,
 * p. ej. cualquiera creada antes de este campo). Nunca se ejecuta si
 * `icono` ya trae un valor: ver `iconoCategoria` más abajo.
 */
const PALABRAS_CLAVE: [RegExp, LucideIcon][] = [
  [/comida|super|mercado|restaurante|antojo/i, UtensilsCrossed],
  [/renta|casa|hogar|vivienda/i, House],
  [/luz|agua|gas\b|servicio/i, Receipt],
  [/transporte|uber|gasolina|camion|metro/i, Car],
  [/proyecto|trabajo|oficina|negocio/i, Briefcase],
  [/estudio|curso|escuela|universidad|libro|educaci/i, GraduationCap],
  [/ropa|compra|tienda/i, ShoppingBag],
  [/salud|doctor|medic/i, Heart],
];

/**
 * `icono` explícito (elegido por el usuario, ver FilaCategoria.tsx)
 * siempre gana sobre el emparejamiento por palabra clave — ese solo es
 * el respaldo para datos de antes de que este campo existiera.
 */
export function iconoCategoria(nombre: string | undefined, icono?: string | null): LucideIcon {
  if (icono) {
    const deIcono = ICONO_POR_CLAVE.get(icono);
    if (deIcono) return deIcono;
  }
  if (!nombre) return Tag;
  const encontrado = PALABRAS_CLAVE.find(([patron]) => patron.test(nombre));
  return encontrado?.[1] ?? Tag;
}
