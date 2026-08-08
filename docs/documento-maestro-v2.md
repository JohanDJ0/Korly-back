# DOCUMENTO MAESTRO v2 — SaaS de Gestión Financiera Personal y Empresarial

> **Fase 1 (pre-código).** Documento de arquitectura, producto y estrategia elaborado como "fuente de verdad" previo a escribir código. Mercado inicial **México**, expansión **LATAM**. v1 del producto: **web, captura 100% manual, un solo desarrollador**.

---

## CONTROL DE VERSIONES

| Versión | Fecha | Cambios |
|---|---|---|
| v1 | Investigación inicial | Documento base de 20 secciones |
| **v2** | **Actual** | Tres correcciones de fondo tras la fase de conversaciones con usuarios |

### Qué cambió en v2 y por qué

Tras varios meses de conversaciones con usuarios reales en la zona de Puebla, se detectaron tres desviaciones entre el documento v1 y la realidad observada. Las secciones afectadas están marcadas con `[v2]`.

**Corrección 1 — Segmento objetivo acotado.**
v1 asumía implícitamente un mercado amplio de "personas que quieren administrar su dinero". La observación de campo mostró que **la mayoría de las personas en la zona no lleva ningún registro financiero y no percibe que le falte**. Convertir a ese grupo implicaría crear un hábito desde cero, que es el tipo de producto más difícil y de peor retención que existe.

Sin embargo, **sí existe un subgrupo con la conducta ya demostrada**: quienes llevan libreta, notas del celular o Excel. Es un segmento más pequeño pero con dolor real y fricción concreta. **El producto se diseña para ese segmento**, no para el mercado general.

**Corrección 2 — Motor del producto cambiado de envelope/zero-based a flujo de caja.**
v1 recomendaba un híbrido envelope/zero-based estilo YNAB. **Esa recomendación era incorrecta para este usuario.** Pedirle a alguien que asigne su quincena entre 8 categorías antes de registrar su primer gasto es una barrera de entrada enorme; YNAB funciona con usuarios que ya son metódicos con su dinero, perfil que aquí es minoritario.

La conducta realmente observada es: *se recibe la quincena, se gasta, y cuando el saldo se ve bajo se frena el gasto para "llegar" al siguiente pago*. **Eso ya es presupuestar por flujo de caja** — pero hecho de cabeza, tarde y mal calibrado. El producto no debe enseñar un método nuevo: debe hacer bien, en tiempo real y desde el día 1 del periodo, el cálculo que el usuario ya hace tarde y a ojo.

**Corrección 3 — Recordatorios contextuales promovidos al núcleo del MVP.**
v1 los ubicaba en fase 2. Dado que **todo el producto descansa sobre una conducta de registro manual**, y que el punto de falla número uno de la categoría es la fatiga de captura, el mecanismo que sostiene el hábito no es accesorio: **es parte del producto**. Sin registro no hay dato; sin dato la cifra que muestra la app es falsa; y una app financiera que muestra un número falso es peor que no tener nada.

---

## TL;DR

- **El segmento objetivo NO es "todos los que quieren ahorrar", sino quien ya lleva registro manual** (libreta, notas, Excel) y sufre su fricción. Segmento pequeño, pero con conducta demostrada.
- **El motor del MVP es presupuesto por flujo de caja con una sola cifra visible ("puedes gastar $X hoy")**, no envelope/zero-based. Las categorías son opcionales, para analizar después.
- **Los recordatorios contextuales son núcleo, no fase 2.** El hábito de registro es el producto.
- **Monolito modular en Node.js/TypeScript + Fastify (no Express, no NestJS) sobre PostgreSQL** con ledger inmutable de partida doble, montos en enteros, API REST + OpenAPI, y front web React + Vite (SPA), preparado para React Native/Expo.
- **Difiere el plan Business y la agregación bancaria.** Intentar B2C y B2B a la vez con un solo dev es el mayor riesgo de producto del proyecto.
- **Dos decisiones del planteamiento inicial se corrigen:** las categorías personalizadas NO deben ser solo Premium, y obligar a crear un presupuesto en el primer paso genera fricción innecesaria.

---

## 1. Visión del producto `[v2]`

### 1.1 Definición

Producto SaaS de gestión financiera personal **basada en el ciclo de ingreso periódico** (quincenal principalmente, también semanal y mensual) que responde en todo momento a una sola pregunta: **¿cuánto puedo gastar hoy sin quedarme corto antes del siguiente ingreso?**

La v1 es **web, captura 100% manual, un solo desarrollador**.

### 1.2 Segmento objetivo (beachhead)

**Usuario primario:** persona que **ya lleva registro manual de sus gastos** —libreta, notas del celular, Excel— y sufre su fricción: no puede consultar rápido cuánto lleva, no calcula bien cuánto le queda por día, pierde el registro, no puede analizar después.

**Perfil típico observado:** ingreso quincenal, alta proporción de gasto en efectivo, uso de tarjeta de crédito con meses sin intereses, y un cálculo mental del saldo restante que se hace **tarde** (cuando el saldo ya se ve bajo) en lugar de temprano.

**Usuario explícitamente NO objetivo en la v1:** quien no lleva ningún registro y no percibe el problema. Puede llegar después por difusión, pero **no se diseña el producto para convencerlo**.

**Implicación de negocio (advertencia):** este segmento es pequeño. Las métricas de retención agregadas se verán malas mientras el segmento objetivo esté mezclado con descargas casuales. **Es obligatorio segmentar las métricas** (§21) para no tomar decisiones sobre un promedio engañoso.

### 1.3 Tesis de valor

La mayoría de apps en México (a) solo rastrean gastos sin dar la cifra accionable (Monefy, Money Manager), o (b) dependen de conexión bancaria frágil (Fintonic **salió de México**; el Open Finance transaccional sigue sin reglas secundarias). Hay hueco para una app que, **sin conexión bancaria**, resuelva el ciclo quincenal mexicano con una sola cifra clara, trazabilidad tipo libro mayor, y un mecanismo real de sostenimiento del hábito.

### 1.4 Diferenciadores propuestos

1. **Periodo quincenal mexicano first-class** (anclado a calendario, no "cada 15 días").
2. **Cifra única de gasto disponible** en tiempo real.
3. **Tarjetas de crédito y MSI** modelados nativamente.
4. **Recordatorios contextuales** que informan en lugar de regañar.
5. **Trazabilidad del sobrante** vía ledger.
6. Finanzas compartidas como palanca de conversión (fase posterior).

---

## 2. Investigación del mercado (México / LATAM)

**Inclusión financiera y efectivo (crítico para captura manual).** Según la **ENIF 2024 (INEGI/CNBV)**, 76.5% de la población de 18–70 años tiene al menos un producto financiero formal. Pero el efectivo domina: del 100% de compras de $501 o más, **73.5% se realizaron en efectivo**, 19.0% con tarjeta física y 7.6% por transferencia/app; 7 de cada 10 pagos menores a $400 aún se realizan en efectivo. El uso de apps financieras entre quienes tienen cuenta pasó de 54.3% (2021) a 69.1% (2024).

**Implicación estratégica:** una porción alta del gasto mexicano es en efectivo e **invisible para cualquier agregador bancario**. Esto valida —contra la intuición— que la captura manual no es solo una limitación de recursos: **captura una realidad que la agregación bancaria no ve**.

**Informalidad:** ~54.8% de la población ocupada está en empleo informal (ENOE 2025), reforzando el peso del efectivo y del ingreso irregular.

**Disposición a pagar:** baja en B2C (§18); el pricing debe regionalizarse (PPP). YNAB cobra $14.99 USD/mes o $109 USD/año ≈ $2,000 MXN, un ancla internacional inviable como precio directo en México.

---

## 3. Benchmark de aplicaciones similares `[v2]`

### 3.1 Apps en México/LATAM

| App | Modelo | Precio | Notas México |
|---|---|---|---|
| Fintonic | Agregación + alertas | Gratis | **Salió de México** (y de Chile mar-2023) |
| Mobills | Manual + sync | Freemium | +3M usuarios; múltiples tarjetas |
| Spendee | Carteras compartidas | ~15–23 USD/mes | Fuerte en gasto compartido |
| Monefy | Manual, simple | Freemium | Principiantes, captura rápida |
| Money Manager | Manual, doble registro | Freemium | Enfoque contable |
| Wallet (BudgetBakers) | Manual + sync | Freemium | Reportes detallados |
| Nu / Klar / Hey Banco | Neobanco + apartados | Gratis | "Apartados"/metas integrados |
| Splitwise | Gastos compartidos | Freemium | Estándar de facto |

### 3.2 Apps internacionales de referencia

| App | Metodología | Precio 2025/26 | Aprendizaje |
|---|---|---|---|
| **PocketGuard** | **"What's left"** | Free / Plus 12.99 mes o 74.99 año | **Referencia principal del MVP:** una sola cifra accionable |
| YNAB | Zero-based, rollover | $14.99/mes o $109/año; trial 34 días | Rollover y disciplina; **modelo descartado para MVP** |
| Monarch Money | Tracking + planning | 14.99/mes o 99.99/año | Sharing de hogar |
| Copilot Money | Tracking, AI | 13/mes o 95/año; iOS/Mac | UX premium |
| Goodbudget | Envelope digital | Free (20 sobres) / pago | Envelope fiel sin banco |
| Actual Budget | Envelope, open-source | Gratis (self-host) | Modela tarjetas con elegancia |
| EveryDollar | Zero-based (Ramsey) | Freemium | Onboarding simple |

### 3.3 Metodologías comparadas

| Metodología | Descripción | Carga cognitiva inicial | ¿MVP? |
|---|---|---|---|
| **Flujo de caja** | Proyección entradas/salidas; cifra disponible por día | **Baja** | **Sí — motor principal** |
| Envelope (sobres) | Asignar dinero a categorías antes de gastar | Alta | Modo avanzado, fase posterior |
| Zero-based (ZBB) | Cada peso recibe un trabajo hasta llegar a cero | Muy alta | Modo avanzado, fase posterior |
| 50/30/20 | Heurística necesidades/deseos/ahorro | Baja | Plantilla opcional de onboarding |
| Kakeibo | Anotación manual reflexiva | Baja | Elementos en la captura (motivo) |

### 3.4 Recomendación `[v2 — CORREGIDA]`

**Motor principal: presupuesto por flujo de caja con cifra única.**

> **Corrección explícita respecto a v1.** El documento v1 recomendaba híbrido envelope/zero-based como motor. **Se descarta para el MVP.** Razón: exige asignación previa entre categorías, lo que impone una decisión compleja *antes* de que el usuario obtenga cualquier valor. Con el segmento objetivo definido en §1.2 —gente que anota en libreta, no gente metódica tipo YNAB— esa barrera mata la activación.

**Cómo funciona el motor:**

1. El usuario registra su ingreso del periodo (la quincena).
2. Registra gastos conforme ocurren, sin categorizar obligatoriamente.
3. La app calcula y muestra, de forma permanente y dominante: **dinero disponible restante, días restantes, y gasto diario sostenible**.

La cifra `disponible ÷ días restantes` es el corazón del producto. Es exactamente el cálculo que el usuario ya hace de cabeza, pero disponible desde el día 1 en lugar del día 11.

**Elementos secundarios:** categorías opcionales (para análisis posterior, nunca obligatorias en la captura); 50/30/20 como plantilla sugerida en onboarding, jamás forzada; motivo/nota opcional al estilo kakeibo.

**Evolución:** el modo envelope/zero-based se ofrece **después**, como opción avanzada, a los usuarios que ya engancharon y piden más control. No al revés.

---

## 4. Funcionalidades propuestas `[v2]`

### 4.1 Núcleo del MVP

| Funcionalidad | Justificación |
|---|---|
| **Registro de ingreso del periodo** | Punto de partida del cálculo |
| **Captura de gasto en ≤2 toques** | Fricción de captura = riesgo #1 |
| **Cifra única de disponible / día** | Es el producto |
| **Periodo quincenal anclado a calendario** | Realidad mexicana; ver §7.4 |
| **Recordatorios contextuales** `[v2 — promovido de fase 2]` | Sostiene el hábito de registro |
| **Cierre de periodo + resumen inmutable** | Cierre del ciclo, valor de reflexión |
| **Decisión del sobrante (ahorrar / arrastrar)** | Requisito original, alto valor percibido |
| **Categorías opcionales** (predeterminadas + personalizadas, para todos) | Análisis sin bloquear captura |
| **Ahorro con metas básico** | Requisito original |

### 4.2 Fuera del MVP (explícito)

Esta lista es tan importante como la anterior. **Es la defensa contra el crecimiento descontrolado del alcance:**

- Plan Business completo (multi-tenant, roles, aprobaciones)
- Agregación bancaria automática
- Multi-moneda avanzada
- Gamificación compleja
- OCR de tickets
- Finanzas compartidas
- Reportes avanzados y dashboards densos

### 4.3 Funcionalidades ausentes del planteamiento original

Detectadas como brechas (§12): gastos recurrentes/suscripciones; deudas y tarjetas + MSI; finanzas compartidas; importación/exportación; definición de "presupuesto excedido"; relación explícita ingreso↔presupuesto.

---

## 5. Arquitectura recomendada

**Monolito modular ("modular monolith"), no microservicios.** Para un solo dev, los microservicios serían un error grave: multiplican superficie operativa (despliegues, redes, observabilidad distribuida, consistencia eventual) sin beneficio a esta escala. El monolito modular da límites de módulo claros (periodos, ledger, ahorro, notificaciones, suscripciones, identidad) dentro de un único despliegue.

**Backend desacoplado con API REST**, consumido por web y luego móvil. Toda la lógica vive en el backend. Patrones (DDD ligero): capas (dominio/aplicación/infraestructura), casos de uso, repositorios, **eventos internos + patrón outbox** para side-effects, e **idempotencia** en webhooks y jobs. **Evitar Kubernetes por completo.** Preferir servicios gestionados.

**Decisiones Tipo 1 (difíciles de revertir) — invertir en diseño ahora:** modelo de datos y ledger, precisión monetaria, identidad desacoplada del proveedor de auth, multi-tenancy, contrato de API pública.

**Decisiones Tipo 2 (reversibles) — no sobre-optimizar:** framework de frontend, hosting, librerías de UI, proveedor de cron.

---

## 6. Tecnologías recomendadas y justificación

### 6.1 Base de datos — Veredicto: **PostgreSQL**

| Criterio | PostgreSQL | MySQL/MariaDB | MongoDB |
|---|---|---|---|
| ACID / transacciones multi-fila | Excelente | Bueno | Débil |
| Integridad referencial | Nativa, fuerte | Buena | No es su fuerte |
| NUMERIC/DECIMAL exacto | Sí | Sí | Decimal128, ecosistema débil |
| Row Level Security | Sí | No | No |
| JSONB / generated cols / mat. views | Sí | Parcial | Documento nativo |
| Particionado / TimescaleDB | Sí | Limitado | Sharding nativo |
| Ecosistema Node/TS | Excelente | Bueno | Excelente |

Para un dominio financiero con partida doble, integridad referencial y transacciones son **no negociables**. **Nunca usar float para dinero**: usar NUMERIC/DECIMAL y, mejor aún, **almacenar montos como enteros en unidades mínimas** (centavos).

### 6.2 Hosting de BD

| Proveedor | Costo aprox. | Notas |
|---|---|---|
| **Supabase** | Pro $25/mes | Postgres + Auth + Storage; Postgres vainilla, sin lock-in de API |
| Neon | ~$19/mes; ~$46 always-on | Serverless, branching; cold starts reales |
| Railway | Hobby $5 mínimo | Corre también backend/worker |
| Render | ~$10/mes | Simple, menos regiones |
| AWS RDS/Aurora | Mayor | Lock-in y complejidad |

**Recomendación:** **Supabase** para el MVP. Región US-East (baja latencia a México).

### 6.3 ORM — Veredicto: **Drizzle** (o Kysely)

| Opción | Recomendación |
|---|---|
| **Drizzle** | **Recomendado:** SQL transparente, migraciones auditables |
| Kysely | Ideal para control total de SQL |
| Prisma | Gran DX; opción válida si prefieres abstracción |
| TypeORM | Evitar en proyecto nuevo |

Para dinero, poder **revisar cada migración como SQL** inclina hacia Drizzle/Kysely. Regla: nunca romper type safety con `as`/`any`; abstraer en la capa de repositorio.

### 6.4 Backend — Veredicto: **Fastify**

Express funciona pero es minimalista (sin validación/serialización de esquema nativa). **Fastify** entrega 40–80% más throughput, validación por JSON Schema nativa (Typebox → tipos TS) y ergonomía similar. **NestJS aporta estructura enterprise pero su boilerplate mataría la productividad de un solo dev.** La estructura se logra con disciplina de monolito modular, no con el framework.

### 6.5 API — Veredicto: **REST + OpenAPI**

Correcto por el **cliente móvil futuro**. **tRPC sería problemático**: acopla cliente/servidor en un monorepo TS y se rompe con móvil nativo o terceros. GraphQL añade complejidad innecesaria. OpenAPI permite generar tipos/SDKs. Versionar (`/v1`) desde el día 1.

### 6.6 Frontend web — Veredicto: **React + Vite (SPA)**

La app está **100% detrás de login** (SEO irrelevante) y el equipo es una persona; un SPA con Vite es más simple, barato y rápido que Next.js. **Librerías:** TanStack Query, Zustand, React Hook Form + Zod, Tailwind + shadcn/ui, Recharts o Tremor para gráficas.

### 6.7 Móvil futuro — Veredicto: **React Native + Expo**

Reutiliza validación (Zod), tipos y lógica con el web (60–70%). **Decisiones de backend que lo facilitan:** paginación por cursor, offline-first (IDs generados en cliente, sync idempotente), push notifications, deep links.

> **Nota `[v2]`:** dado que los recordatorios son núcleo (§4.1), y que las push notifications reales requieren app móvil, el MVP web debe apoyarse en **email y notificaciones web push**, con el móvil como salto de calidad del mecanismo de hábito. Ver §13.4.

### 6.8 Autenticación — Veredicto: **desacoplar identidad**

**Clerk (2026):** free tier de **50,000 MRU** (Monthly Retained Users, unidad más estrecha que MAU) desde feb-2026; Pro $25/mes; overage **$0.02/usuario**.

| Proveedor | Costo a escala | Riesgo LATAM |
|---|---|---|
| Clerk | 50k MRU free; luego $0.02/usuario | Costo puede superar ingreso |
| **Supabase Auth** | 50k MAU free; **$0.00325/MAU >100k** | Coherente si Supabase es la BD |
| Better Auth | Costo = tu Postgres | Sin costo por usuario; construyes UI |
| Auth0 | Tiers caros | No apto a escala LATAM |

**Regla no negociable:** el `user_id` interno debe ser propio (UUID en tu BD), **nunca** el ID del proveedor. Mapear con tabla de identidades para migrar sin refactor.

### 6.9 Pagos — Veredicto: **Stripe + PAC para CFDI**

Stripe opera en México con **OXXO, SPEI y tarjetas**. **Pero Stripe no emite CFDI 4.0**: requiere integrar un PAC (ej. gigstack) que timbre por cada cobro. **Merchant of Record** (Paddle, Lemon Squeezy, ~5% + $0.50) asume impuestos globales pero puede no resolver el CFDI mexicano.

**Recomendación:** iniciar con **Stripe + PAC** para México; evaluar MoR al expandir a LATAM. **El estado de suscripción es source of truth en tu propia BD**, sincronizado por **webhooks idempotentes**.

### 6.10 Infraestructura

| Etapa | Stack | Costo/mes | Qué se rompe primero |
|---|---|---|---|
| 0–1k | Vercel (front) + Railway (API) + Supabase (BD) | $25–60 | Nada |
| 1k–10k | + Sentry + colas + Redis | $100–300 | Jobs y pooling |
| 10k–100k | Compute dedicado, read replicas, particionado | $500–2,000+ | BD y costo de auth |

**Cron:** gestionado (Vercel Cron, Railway, QStash). **Colas:** **pg-boss** (mismo Postgres, cero infra extra). **Observabilidad:** Sentry desde el día 1.

### 6.11 Cierre automático de periodos — punto crítico

**Veredicto: híbrido "cálculo perezoso (lazy) + job idempotente de catch-up".**

- **El cron es solo un disparador, no la capa de decisión.** Corre en UTC, se ejecuta con frecuencia, y la aplicación decide si la ejecución procede. Las zonas horarias se manejan en código, no en crontab.
- **Los jobs corren "aproximadamente" una vez**: pueden duplicarse o saltarse. Kubernetes documenta explícitamente que pueden crearse dos Jobs o ninguno, y que los jobs deben ser idempotentes.
- **Idempotencia:** upserts (`INSERT ... ON CONFLICT`), estado por fila (`closed_at`, `last_processed_period`), advisory locks, y pasar la fecha objetivo explícita (no `now()` dentro del job).

**Zonas horarias — México:** el país **eliminó el horario de verano**; último cambio el **30-oct-2022**. El centro quedó permanentemente **UTC−6**. **Excepciones:** Baja California y municipios fronterizos de Chihuahua, Coahuila, Nuevo León y Tamaulipas siguen el DST de EE.UU. **En LATAM:** Chile sí observa DST; Brasil lo abolió en 2019; Paraguay lo discontinuó en oct-2024; Argentina (2009) y Uruguay (2015) sin DST.

**Conclusión:** guardar todo en UTC, resolver a la zona IANA del usuario (`America/Mexico_City`, `America/Santiago`) al leer, y **mantener tzdata actualizado**.

**Usuarios inactivos con periodos vencidos:** el **cálculo perezoso** lo resuelve al abrir la app; el catch-up idempotente cubre solo side-effects (notificaciones, resúmenes).

---

## 7. Modelo conceptual del negocio (sin DDL)

### 7.1 Ledger inmutable de partida doble

Se recomienda **partida doble con libro mayor append-only** incluso para una app "sencilla". Casi todos los sistemas serios (Stripe, Square, Modern Treasury, TigerBeetle, Beancount) lo usan porque un modelo ingenuo de "tabla de transacciones con saldos mutables" genera descuadres imposibles de auditar: la fuente de verdad de una cuenta es la suma de sus asientos, no una columna de saldo desnormalizada.

Cuentas (efectivo, banco, tarjeta, meta de ahorro, periodo) y **asientos**:

| Operación | Asiento |
|---|---|
| Gasto | Débito categoría/periodo, crédito cuenta de origen |
| Ingreso | Débito cuenta, crédito ingreso |
| Arrastre de sobrante | Periodo A → Periodo B |
| Aporte a meta | Periodo/cuenta → meta |
| Retiro de ahorro | Meta → cuenta, con motivo en metadata |

La **trazabilidad completa** emerge naturalmente: cada peso tiene origen, destino y fecha.

### 7.2 Error conceptual: presupuesto ≠ dinero real

**Inconsistencia del planteamiento original:** se mezcla "presupuesto" (plan) con "dinero real" (saldo). El sobrante **no es necesariamente dinero disponible** si el usuario no rastrea sus cuentas.

**Solución: dos modos.** (a) **Simple** (el sobrante es cifra de plan; el ahorro es "intención de ahorro"); (b) **Avanzado con cuentas** (el sobrante corresponde a dinero real). El ledger soporta ambos; el modo simple usa una cuenta implícita.

> **Nota `[v2]`:** con el motor de flujo de caja, el **modo simple es el default del MVP**. El usuario registra ingreso y gastos; la app no pretende conocer sus saldos bancarios reales.

### 7.3 Ciclo de vida del periodo

Estados: **borrador → activo → cerrado → archivado**.

| Situación | Decisión |
|---|---|
| Resumen al cerrar | **Snapshot inmutable**, no recalculado |
| Gasto retroactivo a periodo cerrado | Registrar como ajuste en periodo actual; nunca mutar el snapshot |
| Editar/borrar gasto de periodo cerrado | Prohibido hard delete; **asiento de reversión** (append-only) |

### 7.4 Modelado de periodos (quincenal mexicano)

**Ambigüedad crítica:** *quincenal* (24 pagos/año) **no** es *catorcenal* (26 pagos/año). El pago quincenal está **anclado al calendario** (días 15 y último del mes, o 1 y 15); no cambia aunque el mes tenga 28, 30 o 31 días. Las quincenas tienen **longitud variable (13–16 días)**.

**Bug clásico a evitar:** modelar quincenal como "inicio + 15 días" produce drift acumulado. **Debe ser anclado a calendario.**

Por LFT Art. 88, si el pago cae en fin de semana o festivo se adelanta al día hábil anterior (relevante para recordatorios, no para el corte).

**Recomendación:** modelar periodos con **tipo + regla de anclaje** (semanal por día; quincenal anclado a calendario; mensual con manejo de fin de mes y febrero; **personalizado** por rango) y ofrecer alineación al ciclo de nómina en el onboarding.

### 7.5 Multi-moneda, precisión, redondeo

Montos como **enteros en unidades mínimas** + código ISO de moneda por cuenta/asiento; nunca float. Redondeo explícito y documentado.

### 7.6 Soft delete, auditoría, retención

Nada de hard delete en dominio financiero: **soft delete + ledger append-only + historial de cambios**. Retención conforme a LFPDPPP (§19).

### 7.7 Multi-tenancy (Business, diferido)

| Estrategia | Aislamiento | Complejidad solo dev | Recomendación |
|---|---|---|---|
| `tenant_id` + **RLS de Postgres** | Bueno | Baja | **Recomendado** |
| Esquema por tenant | Mejor | Media-alta | No MVP |
| Base por tenant | Máximo | Muy alta | No |

**`tenant_id` + Row Level Security** fuerza aislamiento a nivel BD (defensa en profundidad contra IDOR/BOLA). **Implementar desde el día 1 aunque Business se difiera**, porque retrofittearlo es doloroso.

---

## 8. Diseño funcional de cada módulo `[v2]`

| Módulo | Alcance | ¿MVP? |
|---|---|---|
| **Identidad** | `user_id` propio desacoplado; organizaciones para Business | Sí (sin orgs) |
| **Periodos** | Creación, anclaje a calendario, cálculo de fin, estados, cierre, snapshot | Sí |
| **Movimientos (ledger)** | Gastos/ingresos/transferencias como asientos; captura rápida | Sí |
| **Motor de flujo de caja** | Cálculo de disponible, días restantes, gasto diario sostenible | **Sí — es el corazón** |
| **Notificaciones** | Recordatorios contextuales, alertas de ritmo de gasto | **Sí `[v2]`** |
| **Sobrante** | Decisión ahorrar/arrastrar como asiento trazable | Sí |
| **Ahorro** | Metas con objetivo y % avance, aportes/retiros con motivo | Sí (básico) |
| **Categorías** | Predeterminadas + personalizadas para todos, **opcionales en captura** | Sí |
| **Reportes** | Historial de periodos, comparativas, exportación | Parcial |
| **Suscripciones** | Estado en BD propia, webhooks idempotentes | Fase 3 |
| **Business** | Áreas, responsables, permisos, aprobaciones, trazabilidad | Fase 6 (condicionado) |

---

## 9. Planes Free, Pro y Business

**Principio rector:** el límite debe estar en el **eje de valor que escala con el uso**, no en features arbitrarias. No limitar lo que crea el hábito; limitar lo que crece con el compromiso.

### 9.1 Cuestionamiento: categorías personalizadas solo Premium — **VEREDICTO: mala idea**

Son fundamentales para que el registro refleje la vida del usuario; restringirlas **daña la activación** cuando aún no confía en pagar. Goodbudget y Monefy permiten categorización sin muro.

**Recomendación:** categorías personalizadas **gratis para todos** (límite alto, ~30) y monetizar en ejes que escalan.

### 9.2 Empaquetado propuesto

| Feature | Free | Pro | Business |
|---|---|---|---|
| Periodos activos | 1–2 | Ilimitados | Ilimitados |
| Categorías personalizadas | Sí (límite alto) | Ilimitadas | Ilimitadas |
| Recordatorios básicos | Sí | Sí | Sí |
| Recordatorios avanzados / alertas de ritmo | No | Sí | Sí |
| Metas de ahorro | 1–2 | Ilimitadas | Ilimitadas |
| Historial de reportes | 12 meses | Completo | Completo |
| Exportación CSV/PDF | No | Sí | Sí |
| Finanzas compartidas | No | Sí | Equipos |
| Recurrentes / MSI | Básico | Completo | Completo |
| Roles y aprobaciones | — | — | Sí |
| **Precio sugerido** | $0 | **~$79–99 MXN/mes o ~$690–890/año** | ~$199–399 MXN/usuario/mes |

> **Nota `[v2]`:** los recordatorios **básicos van en Free**. Son el mecanismo que sostiene el hábito; ponerlos tras un muro de pago destruiría la retención del plan gratuito y, con ella, cualquier posibilidad de conversión.

### 9.3 Justificación de precio

YNAB (~$2,000 MXN/año) es el techo internacional; un Pro anual de ~$690–890 MXN captura valor sin exceder la disposición local. Anual con descuento (mejor retención y caja).

**Prueba gratuita 17–30 días.** Evidencia: Adapty (2025) reporta que planes semanales pasan de 23% a 42% de retención a día 30 con trial; RevenueCat (2026) señala que trials de 17–32 días convierten 70% mejor que los de 3 días (42.5% vs 25.5%). Business of Apps advierte que trials de 30 días tienen ~51% de cancelaciones vs 26% en los de 3 días — a ponderar.

---

## 10. Sistema de roles

Los cuatro roles del planteamiento original **mezclan plan de suscripción con rol de permisos** (error conceptual). **Separar "plan" (entitlement) de "rol" (permiso).**

| Rol (org Business) | Permisos |
|---|---|
| Propietario (Owner) | Todo, facturación, gestión de org |
| Administrador de org | Usuarios, periodos, aprobaciones |
| Aprobador / Manager | Aprobar gastos de su área |
| Colaborador / Miembro | Registrar gastos, ver lo asignado |
| Solo lectura / Auditor | Ver y exportar, sin editar (contador externo) |
| Admin del sistema (interno) | Soporte/operación; **separado del dominio del cliente** |

**Roles adicionales justificados:** "Aprobador" y "Solo lectura/Auditor" (los despachos contables externos son comunes en México). El plan personal solo necesita Owner + Miembro invitado.

---

## 11. Riesgos detectados `[v2]`

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Fatiga de captura manual → abandono** | **Muy alta** | **Muy alto** | Captura ≤2 toques, recordatorios contextuales, plantillas de recurrentes |
| **Segmento objetivo demasiado pequeño** `[v2]` | Media | Alto | Aceptar crecimiento lento; medir por segmento, no por promedio |
| **Datos incompletos → cifra falsa** `[v2]` | Alta | Muy alto | Indicador de "confianza del dato"; nunca mostrar cifra como certeza absoluta |
| Baja disposición a pagar / alto churn B2C | Alta | Alto | Retención primero, trial, PPP |
| Sobre-ingeniería por un solo dev | Alta | Alto | Monolito modular, servicios gestionados, MVP mínimo |
| Business dispara 3–5× el alcance | Alta | Alto | Diferir Business |
| Costo de auth con Free grande en LATAM | Media | Alto | Identidad desacoplada |
| Descuadres por modelo ingenuo | Media | Muy alto | Ledger inmutable |
| Bugs de quincenal / zonas horarias | Alta | Medio | Anclaje a calendario; UTC + tz IANA |
| Notificaciones percibidas como spam `[v2]` | **Alta** | Medio | Contextuales, no repetitivas; silenciarse solas; ver §13.4 |
| Dependencia de Clerk/Stripe | Media | Medio | Abstracción, source of truth propio |
| CFDI no resuelto por Stripe | Alta | Medio | Integrar PAC desde el inicio de cobros |
| Cumplimiento LFPDPPP (ley 2025) | Media | Medio | Aviso de privacidad, ARCO, cifrado |

---

## 12. Brechas encontradas

1. **Ingreso↔periodo sin definir** en el planteamiento original.
2. **Presupuesto ≠ dinero real** (§7.2).
3. **Sin gastos recurrentes/suscripciones** — fuente #1 de fugas.
4. **Sin deudas ni pagos a crédito.**
5. **Sin tarjetas de crédito ni MSI** — dominante en México; gran diferenciación (una compra a 12 MSI genera 12 compromisos futuros).
6. **Sin finanzas compartidas** — demandado y palanca de conversión.
7. **Sin importación/exportación ni portabilidad.**
8. **Sin estrategia offline/sync** para móvil.
9. **Recordatorios subestimados** — corregido en v2: son núcleo.
10. **"Presupuesto excedido" indefinido** — recomendación: **advertir, nunca bloquear** (bloquear castiga registrar la realidad).
11. **Sin definición al editar/borrar gastos de periodos cerrados** (§7.3).
12. **Ambigüedad quincenal/catorcenal** (§7.4).
13. **Zonas horarias y DST** (§6.11).
14. **Roles mezclan plan con permisos** (§10).
15. **Categorías personalizadas tras muro de pago** perjudican activación (§9.1).
16. **Riesgo de "ni B2C ni B2B"** al intentar ambos.
17. **Onboarding que obliga a crear presupuesto primero** genera fricción (§13.3).
18. **Sin métricas segmentadas** para decidir continuar/pivotar (§21).
19. **Sin manejo de la confianza del dato** `[v2]` — si el usuario no anotó todo, la cifra miente y el producto pierde credibilidad.

---

## 13. UX, psicología y retención `[v2]`

### 13.1 Por qué fallan las apps de captura manual

RevenueCat (State of Subscription Apps 2025) reporta que las apps de finanzas retienen solo **4.2% de usuarios a 30 días** (banca digital lidera con 11.6%; el presupuesto puro va rezagado). Apptopia (2024) sitúa el D30 promedio en 38% con metodología distinta; Sensor Tower muestra al top-10 de finanzas perdiendo ~71% de DAU entre D1 y D30; Adjust (2026) reporta caída del D30 de 3% a 2% interanual.

**La causa dominante en presupuesto es la fatiga de captura**, no la falta de features.

### 13.2 Mitigaciones de fricción

| Mecanismo | Prioridad |
|---|---|
| Captura en ≤2 toques con monto como primer campo | MVP |
| Categoría y nota **opcionales y posteriores** | MVP |
| Plantillas de gastos recurrentes | Fase 2 |
| Importación CSV | Fase 2 |
| Widget de acceso directo | Fase móvil |
| Entrada por voz | Fase móvil |
| OCR de tickets | Fase 2+ (Pro) |

### 13.3 Onboarding

**Cuestionamiento al planteamiento original:** obligar a crear un presupuesto en el primer paso es fricción alta y puede matar la activación.

**Recomendación:** diferir la autenticación y el setup pesado; onboarding de **≤3 pantallas**; el "aha moment" es **ver la primera cifra de disponible**, que requiere solo dos datos: cuánto recibiste y cuándo es tu próximo ingreso. Todo lo demás (categorías, metas, ahorro) se configura después o nunca.

### 13.4 Recordatorios contextuales `[v2 — nuevo, núcleo]`

**Principio: el recordatorio informa, no regaña.**

| Antipatrón | Alternativa correcta |
|---|---|
| "No has anotado hoy" | "Llevas $1,240 de $3,000, te quedan 9 días" |
| Misma hora todos los días | Ventana adaptada al patrón del usuario |
| Notificar aunque ya registró | **Silenciarse solo** si hubo actividad ese día |
| Solo recordar | Traer siempre la cifra accionable |

**Reglas de diseño obligatorias:**

1. **Cada notificación entrega valor por sí sola.** Si el usuario no abre la app, aun así aprendió algo útil.
2. **Se silencia sola** cuando ya hubo registro en el periodo relevante.
3. **Frecuencia decreciente ante ignorancia repetida.** Si el usuario no responde a 3 seguidas, bajar cadencia antes de que las desactive. Una notificación desactivada rara vez se reactiva.
4. **Alertas de ritmo, no solo de registro:** "vas gastando más rápido de lo sostenible" es la alerta de mayor valor y la que los usuarios pidieron explícitamente en las conversaciones de campo.
5. **Nunca notificar con datos incompletos como si fueran certeros** (§11, riesgo de cifra falsa).

**Canales por fase:** MVP web → email + web push. Fase móvil → push nativa (salto de calidad importante para el mecanismo de hábito).

### 13.5 Behavioral economics aplicado

- **Mental accounting (Thaler, 1985/1999; Nobel 2017):** el dinero en una cuenta mental no es sustituto perfecto del de otra. → Metas etiquetadas y separación visual del ahorro.
- **Lugar seguro y etiquetado (Dupas & Robinson, 2013, AER):** simplemente ofrecer un lugar seguro para guardar dinero aumentó el ahorro en salud vía efecto de contabilidad mental; el etiquetado solo ayudó cuando los fondos iban a emergencias. → Las metas funcionan, pero **no bloquear en exceso**; la liquidez importa.
- **Commitment devices (Ashraf, Karlan & Yin, 2006, QJE):** el producto SEED elevó saldos +81% al año, pero el efecto se disipó a +33% (no significativo) a 2.5 años. J-PAL (2021): compromisos suaves (etiquetas, recordatorios) logran objetivos similares a menor costo y riesgo. → **Refuerza la decisión de v2 de apostar por recordatorios sobre bloqueos duros.**
- **Present bias + loss aversion (Thaler & Benartzi, 2004, "Save More Tomorrow"):** el plan SMarT elevó tasas de ahorro de 3.5% a 13.6% en ~40 meses ligando aumentos de ahorro a aumentos de sueldo. → Feature: "aumenta tu ahorro con tu próxima quincena". *(Nota: la identificación causal de esta cifra es debatida por auto-selección de participantes.)*

### 13.6 Gamificación — postura crítica

Eleva engagement de forma robusta, pero **puede fracasar**: Hanus & Fox hallaron menor motivación y peores resultados en cursos gamificados; una racha rota por un glitch técnico desmotiva (Silverman & Barasch, 2023); en fintech puede empujar conductas imprudentes — 11:FS (2024) advierte que alguien podría transferir dinero que no puede permitirse solo por no romper su racha de ahorro.

**Recomendación:** gamificación **atada a comportamiento financiero real**, con **días de gracia / freeze de racha**, sin badges vacíos y **sin gamificar decisiones de riesgo**. Fuera del MVP.

### 13.7 Visualización de datos

**Útiles:** gasto acumulado vs. línea ideal (burn-down), barra de progreso del periodo, sparkline de ritmo, comparativa periodo a periodo, treemap de categorías.

**Inútiles o engañosas:** pastel con muchas categorías, gráficas 3D, ejes truncados.

**Accesibilidad:** no depender solo del color; jerarquía clara con lo accionable arriba.

---

## 14. Roadmap de desarrollo `[v2]`

| Fase | Alcance | Duración |
|---|---|---|
| **F0 – Fundaciones** | Pila base (Fastify + Postgres + Drizzle), identidad desacoplada, ledger, `tenant_id`+RLS, CI/CD, Sentry, métricas | 3–4 sem |
| **F1 – MVP (walking skeleton)** | Ingreso del periodo + captura ≤2 toques + **motor de flujo de caja** + periodo quincenal + **recordatorios básicos** + cierre + sobrante | **6–8 sem** |
| **F2 – Hábito y retención** | Recordatorios avanzados / alertas de ritmo, recurrentes, categorías y análisis, ahorro con metas, exportación | 5–6 sem |
| **F3 – Monetización** | Stripe + PAC/CFDI, planes Free/Pro, trial, dunning, webhooks idempotentes | 4–5 sem |
| **F4 – Diferenciadores MX** | Tarjetas de crédito + MSI, finanzas compartidas | 5–7 sem |
| **F5 – Móvil** | React Native/Expo, offline básico, push nativa, widget | 8–10 sem |
| **F6 – Business (condicionado)** | Multi-tenant completo, roles/aprobaciones, centros de costo | 10–14 sem |

> **Cambio respecto a v1:** el MVP se **redujo de 8–10 a 6–8 semanas** al eliminar la asignación por sobres, mover el ahorro con metas a F2 y quitar el dashboard de F1. A cambio, **los recordatorios subieron de F2 a F1**. El MVP debe construirse como **corte vertical completo desplegado en producción**, no módulo por módulo.

**Business solo si el B2C alcanza los criterios de éxito (§21) y hay demanda B2B validada con pilotos reales.**

---

## 15. Priorización de funcionalidades `[v2]`

### 15.1 MoSCoW del MVP

- **Must:** ingreso del periodo, captura ≤2 toques, motor de flujo de caja (cifra única), periodo quincenal anclado a calendario, recordatorios básicos, cierre + resumen, decisión del sobrante, ledger, auth, métricas instrumentadas.
- **Should:** categorías opcionales, ahorro con metas básico, reportes históricos simples.
- **Could:** exportación, recurrentes, alertas de ritmo.
- **Won't (MVP):** Business, agregación bancaria, gamificación, multi-moneda, OCR, finanzas compartidas, dashboards densos, modo envelope.

### 15.2 RICE

Reach 1–10, Impact 0.25–3, Confidence 0–1, Effort en semanas.

| Feature | Reach | Impact | Conf. | Effort | **RICE** |
|---|---|---|---|---|---|
| **Motor de flujo de caja (cifra única)** | 10 | 3 | 0.9 | 2 | **13.5** |
| **Captura ultrarrápida** | 10 | 3 | 0.9 | 2 | **13.5** |
| **Recordatorios contextuales** `[v2 ↑]` | 9 | 3 | 0.8 | 2 | **10.8** |
| Cierre + resumen + sobrante | 10 | 3 | 0.9 | 3 | 9.0 |
| Periodo quincenal anclado | 10 | 2 | 0.9 | 2 | 9.0 |
| Alertas de ritmo de gasto | 8 | 2 | 0.8 | 2 | 6.4 |
| Gastos recurrentes | 8 | 2 | 0.8 | 2 | 6.4 |
| Ahorro con metas | 7 | 2 | 0.8 | 2 | 5.6 |
| Tarjetas / MSI | 6 | 3 | 0.6 | 4 | 2.7 |
| Finanzas compartidas | 5 | 2 | 0.6 | 4 | 1.5 |
| Business (multi-tenant/roles) | 3 | 3 | 0.4 | 12 | 0.3 |

Confirma: el MVP es **cifra + captura + recordatorio**. Business al final.

---

## 16. Recomendaciones para escalabilidad

- **BD:** particionar el ledger por tenant/fecha (pg_partman); materialized views para reportes; índices en claves de consulta; read replicas hacia ~10k usuarios.
- **Identidad desacoplada** para no quedar preso del costo por usuario en LATAM.
- **Colas y outbox** para desacoplar side-effects; idempotencia en todo job y webhook.
- **Notificaciones:** diseñar el envío como cola con deduplicación desde el inicio; es el módulo que más rápido se vuelve costoso y ruidoso al escalar.
- **API versionada + OpenAPI** para no romper móvil ni terceros.
- **Multi-tenant con RLS desde el diseño**, aunque Business se difiera.
- **Cache (Redis)** solo cuando la BD sea cuello de botella demostrado.
- **Observabilidad** desde el día 1.

---

## 17. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Descuadre financiero | Ledger inmutable de partida doble |
| Bugs de tiempo (quincenal, DST, inactivos) | UTC + tz IANA + anclaje a calendario + lazy/catch-up |
| Doble ejecución u omisión de jobs | Idempotencia, advisory locks, deadlines |
| IDOR/BOLA (fallo #1 en APIs financieras, OWASP API Top 10) | RLS + autorización por recurso + tests |
| Vendor lock-in (Clerk/Stripe/Supabase) | Abstracción, source of truth propio, Postgres vainilla |
| Migraciones peligrosas | Drizzle con migraciones revisables, staging, backups/PITR |
| Costo de escala (auth, BD) | Monitorear coste por usuario activo |
| Notificaciones duplicadas o fuera de hora | Cola con deduplicación + respeto de tz del usuario |

---

## 18. Riesgos de negocio

- **Baja disposición a pagar y alto churn B2C** (RevenueCat 2025: 4.2% D30): retención primero, PPP, trial, valor rápido; considerar B2B2C (bancos/fintech como canal) a futuro.
- **Segmento inicial pequeño `[v2]`:** crecimiento lento esperado. No confundir con fracaso; medir por segmento.
- **Free demasiado generoso** cuando el costo por usuario no es cero: acotar Free y monitorear punto de equilibrio.
- **Competencia de neobancos gratuitos** (Nu, Klar con "apartados"): diferenciarse por metodología, efectivo, MSI y agnosticismo bancario.
- **Riesgo regulatorio** si se cruza a mover dinero o agregar cuentas (§19).
- **Riesgo de foco** (B2C + B2B): diferir Business.

**Modelo financiero simplificado:** con Pro a ~$690–890 MXN/año y costos dominados por auth (Clerk $0 hasta 50k MRU, luego $0.02/usuario) y BD (~$25–60/mes base), el punto de equilibrio sin sueldo cargado son cientos de usuarios de pago. Dado que la conversión free→paid en fintech B2C suele ser de un dígito bajo, se requiere una base activa considerable. **Refuerza priorizar retención y activación sobre features.**

---

## 19. Seguridad, privacidad y cumplimiento

**Seguridad:** cifrado en tránsito (TLS) y reposo; gestión de secretos; rate limiting; **protección IDOR/BOLA**; validación de entrada (Zod/JSON Schema); logging sin PII; MFA; sesiones y refresh tokens seguros.

**LFPDPPP (México):** el **20 de marzo de 2025 se publicó** y el **21 de marzo de 2025 entró en vigor** una nueva Ley Federal de Protección de Datos Personales en Posesión de los Particulares, tras la reforma constitucional que **extinguió el INAI**; sus funciones pasaron a la **Secretaría Anticorrupción y Buen Gobierno**. Cambios: aviso de privacidad **simplificado** obligatorio cuando los datos se obtienen por medios electrónicos; consentimiento tácito como regla general; controles sobre terceros.

**Obligaciones prácticas:** aviso de privacidad, **derechos ARCO**, base legal de tratamiento, minimización, y reglas de transferencia internacional (la nube estará en EE.UU.).

**LATAM:** LGPD (Brasil), Ley 1581 (Colombia), Ley 19.628 y su reforma (Chile), Ley 25.326 (Argentina). Privacidad por defecto facilita cumplir todas.

**¿Cae bajo la Ley Fintech?** **Probablemente NO en la v1**: no custodia dinero ni agrega datos bancarios. Cruzaría la línea si (a) permite **mover dinero real** (podría requerir figura como IFPE) o (b) **conecta cuentas bancarias** vía agregación regulada.

**Asesoría financiera:** si la app da recomendaciones interpretables como asesoría financiera o de inversión hay riesgo legal. **Mitigación:** disclaimers claros ("información educativa, no asesoría financiera ni de inversión") y evitar recomendar productos de inversión específicos.

**Residencia/latencia:** regiones US-East para baja latencia a México.

---

## 20. Agregación bancaria futura (Open Finance MX/LATAM)

**Estado en México:** la Ley Fintech (2018) mandató datos abiertos, pero las **reglas secundarias para datos transaccionales siguen sin emitirse** por la CNBV (las disposiciones de junio 2022 cubrieron datos agregados/públicos). Los agregadores operan hoy mediante **acuerdos bilaterales**. México va detrás de Brasil y Colombia.

| Proveedor | Base | Estado | Costo |
|---|---|---|---|
| **Belvo** | Brasil/MX | Líder LATAM; **IFPE autorizado** por CNBV; +80M cuentas | Por uso (enterprise) |
| **Finerio Connect** | CDMX | +120 instituciones; API hub con Visa/OzoneAPI | Cuota mínima + variable |
| Prometeo | LATAM | Multi-país | Por uso |
| Fintoc | Chile/MX | IFPE-licensed | Por uso |
| Palenque | MX | Emergente | Por uso |

**Cómo diseñar hoy para agregar mañana sin refactor:**

1. El **ledger** ya modela "cuentas" y "asientos"; una cuenta agregada es **otra cuenta** cuyos movimientos entran como asientos.
2. Captura manual e importada comparten modelo, con el origen como metadata (`manual` | `agregado` | `importado`).
3. Un **puerto de "fuente de movimientos"** (arquitectura hexagonal) para enchufar Belvo/Finerio después.
4. Idempotencia y deduplicación desde el inicio.

**Recomendación:** mantener la agregación **fuera de la v1**; reevaluar cuando (a) existan reglas secundarias transaccionales, (b) el ARPU justifique el costo variable, y (c) haya base de usuarios de pago.

---

## 21. Métricas, criterios de éxito y próximos pasos `[v2]`

### 21.1 Métricas desde el día 1

**Regla `[v2]`: toda métrica debe poder segmentarse entre "usuario con hábito previo" (segmento objetivo) y "usuario casual".** El promedio agregado será engañoso y llevaría a decisiones equivocadas.

| Categoría | Métrica |
|---|---|
| **Activación** | % que registra ingreso + ≥1 gasto en las primeras 24h |
| **Aha moment** | % que llega a ver su primera cifra de disponible |
| **Retención** | D1 / D7 / D30, **segmentada** |
| **Hábito (la métrica clave)** | Días con al menos un registro / días del periodo |
| **Completitud del dato** | % de días del periodo con registro (proxy de si la cifra es confiable) |
| **Notificaciones** | Tasa de apertura, tasa de desactivación (alerta si sube) |
| **Ciclo** | Tasa de cierre de periodo completado |
| **Monetización** | Conversión free→pro, churn, LTV/CAC |

### 21.2 Criterios de continuar / pivotar / abandonar

| Hito | Criterio |
|---|---|
| **F1 → F2** | Si en el segmento objetivo el **hábito < 40% de días con registro** y el D30 < 15% tras iterar captura y recordatorios → **pivotar**: el problema es la fricción de registro, no las features |
| **F2 → F3** | Retención estable pero sin señales de intención de pago → revisar empaquetado **antes** de invertir en billing |
| **F3 → F4/F5** | Activar diferenciadores MX y móvil solo con D30 saludable en el segmento y conversión free→pro de dígito medio |
| **F6 Business** | Solo con demanda B2B validada (cartas de intención o pilotos reales), nunca especulativo |

### 21.3 Próximos pasos inmediatos

1. **Escribir los ADRs (Architecture Decision Records)** de las seis decisiones Tipo 1: ledger de partida doble, dinero como enteros, identidad desacoplada, modelo de periodos anclado a calendario, `tenant_id` + RLS, REST v1 versionado. Una página cada uno: contexto, opciones, decisión, consecuencias.
2. **Fase 2 del documento: modelo conceptual del dominio.** Entidades, invariantes ("un periodo cerrado nunca cambia de saldo"), máquina de estados del periodo, catálogo de eventos del ledger.
3. **Fase 3: contrato de API (OpenAPI) + wireframes de baja fidelidad** de solo tres pantallas: onboarding, captura rápida y cierre de periodo.
4. **Fase 4: walking skeleton.** Corte vertical completo desplegado en producción: login → registrar ingreso → capturar gasto → ver cifra → cerrar periodo → decidir sobrante. Feo pero end-to-end.
5. **Diario de diseño personal:** retomar el registro manual propio durante una quincena mientras se diseña. No como validación, sino como material de UX: identificar exactamente en qué momentos da flojera anotar y qué gastos se escapan.
6. **Congelar la lista de "no haremos"** (§4.2) por escrito. Es la defensa contra el crecimiento del alcance dentro de dos meses.

---

## 22. Conclusiones `[v2]`

El planteamiento original es sólido en visión, pero v2 corrige tres desviaciones importantes detectadas en campo:

1. **El segmento no es el mercado general**, sino quien ya lleva registro manual. Es más pequeño, pero es demanda real y no aspiracional.
2. **El motor no es envelope/zero-based, sino flujo de caja con cifra única.** El producto no enseña un método nuevo: hace bien y a tiempo el cálculo que el usuario ya hace tarde y a ojo.
3. **Los recordatorios no son una feature secundaria, son el mecanismo que sostiene el producto**, porque todo depende de una conducta de registro manual.

Se mantienen los huecos conceptuales señalados en v1 que siguen requiriendo decisión: mezclar presupuesto con dinero real, modelar mal el quincenal, poner categorías tras muro de pago, mezclar planes con roles, y el riesgo de perder foco intentando B2C y B2B a la vez.

Las decisiones tecnológicas se sostienen (Postgres, Fastify sobre Express, Vite SPA, REST+OpenAPI, RN/Expo), con dos advertencias: **cuestionar el costo de Clerk en LATAM** y **resolver CFDI con un PAC**.

Para un solo desarrollador, la clave sigue siendo **construir bien lo difícil de revertir —datos, dinero, identidad, API— y mantener todo lo demás simple y gestionado**, difiriendo Business y agregación bancaria hasta validar retención.

---

## Nota metodológica sobre fuentes y limitaciones

- **Datos de mercado México:** ENIF 2024 (INEGI/CNBV), ENOE 2025, Forbes México, Santander. Salida de Fintonic de México según fuentes de prensa (jun-2026).
- **Precios** de apps y proveedores (Clerk, Supabase, YNAB, Neon, Paddle, Lemon Squeezy) verificados contra páginas de pricing y análisis 2025–2026. **Cambian con frecuencia; re-verificar antes de decidir.**
- **Advertencia sobre unidades de facturación:** Clerk mide **MRU** (usuarios retenidos), mientras Supabase y Auth0 miden **MAU**. Comparar peras con peras al modelar costos.
- **Conflicto de datos señalado:** el D30 de apps de finanzas varía fuertemente según fuente (RevenueCat 2025: 4.2%; Apptopia 2024: 38%; Adjust 2026: 2%), por diferencias en definición de "app de finanzas" (neobanco vs presupuesto puro) y atribución post-ATT. **Tratar como rango, no como cifra única.**
- **Behavioral economics:** estudios citados (Thaler; Ashraf-Karlan-Yin 2006 QJE; Dupas-Robinson 2013 AER; Thaler-Benartzi 2004). Algunas cifras tienen identificación causal debatida.
- **Investigación de campo v2:** conversaciones informales con usuarios de la zona de Puebla a lo largo de varios meses. **Limitación reconocida:** muestra no probabilística, sin registro estructurado, y sujeta a sesgo de cortesía. Las conclusiones sobre conducta observada (cálculo mental tardío del saldo, dominancia del efectivo, uso de libreta) son direccionalmente confiables; las declaraciones de intención de uso **no deben tratarse como validación de disposición a pagar**.
- **Cifras de proveedores de gamificación** (material de marketing) omitidas o marcadas como no verificadas.
