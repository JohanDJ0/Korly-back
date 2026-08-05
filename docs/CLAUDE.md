# CLAUDE.md

Reglas y contexto del proyecto. Este archivo se lee automáticamente al iniciar una sesión.

> **Estado actual: FASE DE DOCUMENTACIÓN.** Todavía no existe código. El siguiente entregable es el modelo conceptual del dominio, no implementación. No generar código de features hasta que exista `docs/modelo-dominio.md`.

---

## Qué es este proyecto

Aplicación SaaS de gestión financiera personal basada en el ciclo de ingreso periódico (principalmente **quincenal mexicano**).

**Pregunta que responde el producto:** *¿cuánto puedo gastar hoy sin quedarme corto antes del siguiente ingreso?*

- **Mercado:** México, expansión posterior a LATAM
- **v1:** web, captura de gastos 100% manual (sin conexión bancaria)
- **Equipo:** un solo desarrollador
- **Segmento objetivo:** personas que **ya llevan registro manual** (libreta, notas, Excel) y sufren su fricción. **No** el mercado general

## Documentación de referencia

| Archivo | Contenido |
|---|---|
| `docs/documento-maestro-v2.md` | Visión, mercado, arquitectura, roadmap. Fuente de verdad |
| `docs/adr/` | Decisiones de arquitectura. **Leer antes de proponer cambios estructurales** |

---

## Decisiones NO negociables

Están justificadas en los ADRs. **No proponer alternativas sin leer el ADR correspondiente.**

| # | Decisión | ADR |
|---|---|---|
| 1 | **Ledger inmutable de partida doble.** Nada se edita ni se borra; las correcciones son asientos de reversión. El saldo es la suma de asientos, nunca una columna | ADR-001 |
| 2 | **Dinero como entero en centavos** + código ISO de moneda. Nunca float. Nunca un monto sin moneda | ADR-002 |
| 3 | **`user_id` propio (UUID)**, nunca el ID del proveedor de auth. Tabla de mapeo aparte | ADR-003 |
| 4 | **Periodos anclados a calendario** (quincenal = 1–15 / 16–fin de mes, longitud variable). Nunca "inicio + N días" | ADR-004 |
| 5 | **`tenant_id` + RLS en toda tabla de dominio** desde la primera migración | ADR-005 |
| 6 | **REST `/v1` + OpenAPI generado desde el código.** No tRPC, no GraphQL | ADR-006 |
| 7 | **Periodo ≠ ingreso.** Son entidades separadas. Los días restantes se cuentan contra el fin del periodo | ADR-007 |

### Reglas derivadas

- El **redondeo de la cifra diaria trunca hacia abajo**. El error debe favorecer al usuario.
- Un solo lugar en el código convierte entre entero y presentación.
- Todo en **UTC**, resuelto a la zona IANA del usuario al leer. México sin DST desde 2022 (excepto Baja California y franja fronteriza).
- **Los jobs pueden duplicarse o saltarse.** Todos deben ser idempotentes: fecha objetivo pasada como parámetro, nunca `now()` dentro del job.
- Nada de hard delete en el dominio financiero.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + **Fastify** (no Express, no NestJS) |
| Base de datos | **PostgreSQL** vía Supabase |
| Query layer | **Drizzle** (SQL transparente, migraciones auditables) |
| Auth | **Supabase Auth** |
| Frontend web | **React + Vite (SPA)** — la app está 100% detrás de login, SEO irrelevante |
| Estado | TanStack Query (servidor) + Zustand (cliente) |
| Formularios | React Hook Form + Zod |
| UI | Tailwind + shadcn/ui |
| Pagos | Stripe + PAC para CFDI (Fase 3) |
| Colas | pg-boss (mismo Postgres) |
| Móvil (Fase 5) | React Native + Expo |

**Arquitectura:** monolito modular. **No microservicios. No Kubernetes.**

---

## Prioridades del producto

1. **Captura en ≤2 toques.** La fatiga de registro es el riesgo #1: las apps de finanzas retienen ~4% de usuarios a 30 días. Cualquier fricción añadida a la captura debe justificarse.
2. **La cifra única es el producto.** Disponible, días restantes, gasto diario sostenible.
3. **Los recordatorios son núcleo, no accesorio.** Informan, no regañan. "Llevas $1,240 de $3,000, te quedan 9 días", nunca "no has anotado hoy". Se silencian solos si ya hubo registro.
4. **Categorías opcionales**, nunca obligatorias en la captura. Y disponibles en el plan gratuito.

## Fuera de alcance del MVP

No implementar sin discusión previa: plan Business (multi-tenant completo, roles, aprobaciones) · agregación bancaria · multi-moneda avanzada · gamificación · OCR de tickets · finanzas compartidas · dashboards densos · modo envelope/zero-based.

---

## Cómo trabajar en este proyecto

- **Leer el ADR antes de tocar algo estructural.** Si algo parece innecesariamente complejo, probablemente hay un ADR que explica por qué.
- Si una decisión de un ADR resulta equivocada, **no editar el ADR**: proponer uno nuevo que lo supersede.
- Preferir simplicidad operativa: el proyecto lo mantiene una sola persona.
- Señalar los problemas directamente. Este proyecto se ha construido cuestionando decisiones, no validándolas.
