# ADR-003 — Identidad desacoplada del proveedor de autenticación

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** modelo de identidad de usuario y relación con el proveedor de auth
- **Proveedor elegido inicialmente:** Supabase Auth (ver sección final)

---

## Contexto

El proyecto usará un proveedor externo de autenticación. El Documento Maestro identificó un riesgo de **costo por usuario en LATAM**, donde el ARPU es bajo y el plan Free debe mantenerse generoso para que el hábito de registro arraigue.

Es plausible cambiar de proveedor en un horizonte de dos años.

## Opciones consideradas

1. **Usar el ID del proveedor como clave del usuario** en toda la base de datos.
2. **UUID propio como identidad canónica**, con tabla de mapeo hacia identidades externas.

## Decisión

**Opción 2.** La base de datos tiene su propio `user_id` (UUID). Una tabla independiente relaciona ese usuario con una o más identidades externas (`proveedor` + `id_en_proveedor`).

## Consecuencias

### Positivas

- Cambiar de proveedor toca **una tabla**, no decenas de claves foráneas.
- Soporta que un mismo usuario tenga varios métodos de login.
- Soporta **usuarios sin proveedor externo**: cuentas de prueba, seeds de desarrollo, cuentas de soporte.

### Negativas

- Un `JOIN` extra o una capa de resolución en cada request autenticado. Overhead pequeño pero permanente.
- Tentación de saltarse la indirección "solo esta vez". **Basta hacerlo una vez para perder el beneficio completo.**

## Elección del proveedor inicial: Supabase Auth

Decidido tras comparar contra Clerk. Tres razones:

**1. Coherencia con la base de datos.** Supabase ya es la elección de Postgres gestionado (Documento Maestro §6.2). Auth vive en el mismo proyecto, mismo Postgres, mismo panel. Un proveedor menos que configurar, facturar y monitorear.

**2. Costo a escala en LATAM.** Clerk cobra **$0.02 por usuario** en overage; Supabase cobra **$0.00325 por MAU** arriba de 100k. Seis veces de diferencia. Clerk elevó su free tier a 50,000 MRU en febrero de 2026, lo que reduce la urgencia, pero **MRU es una unidad más estrecha que MAU** y el problema estructural persiste.

**3. Integración nativa con RLS.** ADR-005 depende de Row Level Security. Supabase Auth expone `auth.uid()` dentro de las políticas de PostgreSQL sin plomería adicional. Con Clerk hay que puentear el JWT hacia Postgres manualmente: funciona, pero es trabajo extra en la parte más delicada de la seguridad.

### Lo que se sacrifica

Clerk tiene mejor experiencia de desarrollo y componentes de UI listos (ahorro estimado: ~1 semana en pantallas de login, registro y recuperación). Su gestión de organizaciones es más madura, lo cual importaría si el plan Business fuera prioritario — no lo es, está en Fase 6.

**Este ADR hace la elección reversible.** Se opta por lo barato y coherente.

## Referencias

- Documento Maestro v2, §6.8
- ADR-005 (RLS)
