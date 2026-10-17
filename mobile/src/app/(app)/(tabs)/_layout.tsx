import { Tabs } from 'expo-router';
import { CreditCard, History, House, MoreHorizontal, Target, type LucideIcon } from 'lucide-react-native';

import { colores } from '@/lib/tema';

/** Los mismos 5 destinos que la barra inferior de la web (frontend/src/lib/nav-destinos.ts). */
const PESTANAS: { nombre: string; titulo: string; Icono: LucideIcon }[] = [
  { nombre: 'index', titulo: 'Inicio', Icono: House },
  { nombre: 'historial', titulo: 'Historial', Icono: History },
  { nombre: 'metas', titulo: 'Metas', Icono: Target },
  { nombre: 'tarjetas', titulo: 'Tarjetas', Icono: CreditCard },
  { nombre: 'mas', titulo: 'Más', Icono: MoreHorizontal },
];

export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoTenue,
        tabBarStyle: { backgroundColor: colores.tarjeta, borderTopColor: colores.borde },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
      }}
    >
      {PESTANAS.map(({ nombre, titulo, Icono }) => (
        <Tabs.Screen key={nombre} name={nombre} options={{ title: titulo, tabBarIcon: ({ color, size }) => <Icono color={color} size={size - 2} /> }} />
      ))}
    </Tabs>
  );
}
