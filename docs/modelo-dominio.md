# Modelo Conceptual del Dominio

- **Estado:** aceptado
- **Fecha:** 2026-08-06
- **Depende de:** ADR-001 a ADR-007
- **Precede a:** contrato OpenAPI, wireframes, walking skeleton

Este documento traduce las decisiones de arquitectura (`docs/adr/`) en el modelo de dominio concreto: qué existe, qué reglas no se rompen, cómo transita el periodo, qué eventos mueve el ledger, y cómo se calcula la cifra que ve el usuario.

---

## 1. Entidades

| Entidad | Descripción |
|---|---|
| **Tenant** | Unidad de aislamiento (ADR-005). Cada usuario personal es su propio tenant en el MVP |
| **Usuario** | Identidad canónica con UUID propio (ADR-003). Pertenece a un tenant |
| **Identidad externa** | Mapeo entre usuario y proveedor de auth |
| **Periodo** | Unidad de planeación. Tipo, regla de anclaje, fecha inicio, fecha fin, estado (ADR-004) |
| **Ingreso** | Evento de llegada de dinero. Monto, fecha real, periodo que financia (ADR-007) |
| **Cuenta** | Contenedor de valor en el ledger: efectivo, banco, tarjeta, meta de ahorro, periodo |
| **Asiento** | Movimiento atómico e inmutable en el ledger (ADR-001) |
| **Movimiento** | Agrupación de asientos con sentido de negocio (un gasto, un aporte). Suma cero |
| **Categoría** | Clasificación opcional del movimiento. Predeterminada o personalizada |
| **Meta de ahorro** | Objetivo con monto meta, nombre, y cuenta asociada en el ledger |
| **Resumen de periodo** | Snapshot inmutable generado al cierre |

---

## 2. Invariantes

Reglas que no se rompen nunca. Se traducen directamente en constraints de base de datos.

**Del ledger**
1. La suma de los asientos de un movimiento es exactamente cero.
2. Ningún asiento se modifica ni se elimina jamás. Las correcciones son asientos de reversión.
3. El saldo de una cuenta es la suma de sus asientos. No existe columna de saldo como fuente de verdad.
4. Todo monto es entero en unidades mínimas, y lleva moneda.

**Del periodo**
5. Un periodo cerrado no cambia de saldo nunca.
6. Los periodos de un mismo usuario no se traslapan.
7. Todo periodo tiene fecha de fin calculada por su regla de anclaje, no por duración fija.
8. Un periodo solo transita a "cerrado" una vez. El cierre es idempotente.
9. **Solo puede haber un periodo activo por usuario a la vez** (MVP; se relaja en Business).
10. Un movimiento de gasto o ingreso solo puede registrarse contra un periodo en estado **activo**. *(añadida en revisión, ver §6)*

**Del ingreso**
11. Un ingreso pertenece a exactamente un periodo: el que financia.
12. Un periodo puede tener cero o varios ingresos. Cero es válido pero degradado.

**De aislamiento**
13. Toda entidad de dominio pertenece a exactamente un tenant.
14. Ninguna consulta cruza tenants.

**Del resumen**
15. El resumen de un periodo cerrado es inmutable. Un gasto retroactivo genera un ajuste en el periodo activo, nunca modifica el snapshot.

---

## 3. Máquina de estados del periodo

`Borrador → Activo → Cerrado → Archivado`

### Borrador
El periodo existe pero no ha iniciado. Editable o eliminable libremente — no tiene asientos todavía.
**Transición a Activo:** automática al llegar la fecha de inicio (cálculo perezoso), o manual si el usuario adelanta.

### Activo
El periodo corriente. Acepta gastos, ingresos, aportes a metas. Único estado donde se calcula y muestra la cifra de disponible.
**Regla:** solo un periodo activo por usuario (invariante 9). Consecuencia directa de que la cifra única no tiene sentido repartida entre dos periodos simultáneos.
**Transición a Cerrado:** al pasar la fecha de fin. Perezosa + job de catch-up para side-effects (notificaciones, resúmenes).

### Cerrado
No acepta movimientos nuevos. Se generó el resumen inmutable. Pendiente: decisión del sobrante.

- Si hay sobrante **positivo**, la app solicita decidir: **ahorrar** o **arrastrar**.
- Si el usuario no decide en N días, **default: arrastrar automáticamente** al siguiente periodo. Es la opción conservadora — el dinero permanece disponible, y no se toma una decisión financiera (mandarlo a ahorro) sin consentimiento explícito.
- Si el sobrante es **negativo** (déficit — se gastó más de lo que ingresó en todo el periodo, no solo un día con sobregiro momentáneo) *(añadido en revisión, ver §6)*: **se arrastra automáticamente al periodo siguiente, sin pedir decisión al usuario.** No existe la opción "ahorrar" para un déficit — no tiene sentido enviar una deuda a una meta de ahorro. El mecanismo de arrastre es el mismo asiento `Periodo A → Periodo B` del catálogo de eventos (§4), solo que con monto negativo: el periodo siguiente inicia con ese déficit descontado de su disponible desde el día 1.

**Transición a Archivado:** automática, tras resolver el sobrante y pasado un periodo de gracia.

### Archivado
Solo consulta histórica.

### Casos límite

| Situación | Resolución |
|---|---|
| Gasto retroactivo a periodo cerrado | Ajuste registrado en el periodo **activo**, con nota de fecha real. El resumen histórico no se toca (invariantes 5, 15) |
| Editar/borrar gasto de periodo cerrado | Asiento de reversión + asiento nuevo, ambos en el periodo activo |
| Periodo vencido hace meses (usuario inactivo) | Cálculo perezoso cierra todo al abrir la app. El catch-up **agrupa** notificaciones — nunca manda una ráfaga de resúmenes atrasados |
| Periodo activo sin ingreso registrado | No bloquea captura de gastos. La cifra de disponible no se muestra como certera (ver §5) |
| **Editar/borrar gasto del periodo activo** *(resuelto en revisión, ver §6)* | Permitido directo mientras el periodo siga activo — no requiere reversión, porque nada se ha cerrado todavía |
| **Segundo periodo creado mientras uno sigue activo** *(resuelto en revisión, ver §6)* | Rechazado explícitamente por invariante 9. El nuevo periodo queda en Borrador hasta que el activo cierre |
| **Periodo cierra con saldo negativo (déficit)** *(resuelto en revisión, ver §6)* | Arrastre automático al siguiente periodo, sin ofrecer "ahorrar". El disponible del periodo siguiente nace ya descontado |

---

## 4. Catálogo de eventos del ledger

| Evento | Asientos | Notas |
|---|---|---|
| Ingreso registrado | Cuenta del usuario ← origen externo | Asociado al periodo que financia (ADR-007) |
| Gasto registrado | Periodo ← cuenta de origen | Categoría opcional. Evento más frecuente con diferencia |
| Arrastre de sobrante | Periodo siguiente ← periodo cerrado | Generado al resolver el cierre |
| Aporte a meta | Meta ← periodo o cuenta | Ver §6 sobre si reduce el disponible |
| Retiro de meta | Cuenta ← meta | Lleva motivo en metadata |
| Reversión | Inverso exacto de un asiento previo | Referencia obligatoria al asiento original |

El residuo del truncamiento de la cifra diaria **no genera evento propio**: es solo de presentación y se diluye en el sobrante al cierre (confirmado, ver ADR-002).

Todo movimiento lleva `fecha_registro` (cuándo lo capturó el usuario) y `fecha_efectiva` (cuándo ocurrió realmente). Distinción que hace posible el gasto retroactivo y reportes honestos.

---

## 5. Motor de flujo de caja

### Fórmula base

```
disponible          = Σ ingresos del periodo − Σ gastos del periodo
días_restantes      = (fecha_fin del periodo − hoy) + 1     [zona horaria del usuario]
gastado_hoy         = max(0, −Σ asientos de gasto/reversión con fecha efectiva = hoy)
disponible_base_hoy = disponible + gastado_hoy               [deshace el efecto de hoy]
objetivo_hoy        = piso( disponible_base_hoy ÷ días_restantes )
cifra_diaria        = objetivo_hoy − gastado_hoy              [puede ser negativa: te pasaste hoy]
```

El `+1` evita división entre cero el último día del periodo.

### Decisión central: recálculo diario, no presupuesto fijo — pero el objetivo de HOY es fijo dentro del propio día

La cifra diaria **se recalcula en cada consulta**, con el disponible y los días restantes del momento — no se fija al iniciar el periodo. Si un día se gasta de más, la cifra del día siguiente **baja sola** para compensar.

*(Corrección, ver §6): la primera implementación calculaba `cifra_diaria = piso(disponible ÷ días_restantes)` directo, sin aislar `gastado_hoy` — así que gastar exactamente lo sugerido bajaba la cifra de "hoy" en la misma consulta, como si el gasto se hubiera repartido también hacia atrás, y un sobregiro grande podía mostrar un residuo pequeño pero todavía positivo, ocultando el tamaño real del exceso. Esto contradecía la frase anterior ("la cifra del día siguiente baja sola"): la compensación debe verse al día siguiente, no a mitad del mismo día. La fórmula corregida separa `objetivo_hoy` (fijo, calculado sobre lo que había antes de cualquier gasto de hoy) de `gastado_hoy`, y solo resta — nunca vuelve a dividir dentro del mismo día. Es exactamente la conducta que el usuario ya hace de cabeza, tarde: sabe cuánto se puede gastar hoy, y si se pasa, lo siente hoy como exceso, no como una meta que se movió sola; el ajuste real llega mañana.*

### Casos límite

| Caso | Comportamiento |
|---|---|
| Día 1 con ingreso registrado | Cifra normal desde el primer momento — es el aha moment del onboarding |
| Periodo activo sin ingreso | **No se muestra cifra de disponible.** Estado explícito: "Registra tu ingreso para ver cuánto puedes gastar." Captura de gastos no se bloquea |
| Sobregiro (disponible negativo) | Se muestra el negativo sin suavizar. La cifra diaria también es negativa: comunica que se está gastando de un futuro que aún no llega |
| Te excediste HOY, pero el disponible total sigue positivo | `cifra_diaria` puede ser negativa (`objetivo_hoy − gastado_hoy`) sin que `disponible` lo sea — son señales distintas y se presentan por separado, nunca coloreando una según el signo de la otra |
| Ingreso a medio periodo (bono, extra) | Se suma al disponible al registrarse; el recálculo diario lo reparte solo entre los días que quedan |
| Residuo de truncamiento | Se diluye en el sobrante al cierre, sin evento propio |

### Reglas de presentación

- La cifra diaria **nunca se muestra sin los días restantes al lado**.
- Cuando el estado es "sin ingreso registrado", ese llamado a la acción es el elemento más visible de la pantalla.

---

## 6. Huecos detectados en esta revisión

Tres preguntas surgieron al releer el modelo completo. Dos ya tienen resolución propuesta arriba; una queda abierta porque es decisión de producto, no de arquitectura.

**Resueltas e incorporadas:**
- *Edición de un gasto dentro del periodo activo* (no cerrado) no estaba cubierta — solo se había definido el caso de periodo cerrado. Se resuelve permitiendo edición directa mientras el periodo siga activo: no hay snapshot que proteger todavía.
- *Qué pasa si se intenta crear un segundo periodo mientras uno está activo* no estaba explícito, solo implícito en la invariante 9. Se agregó como invariante 10 y como fila en la tabla de casos límite.
- *Qué pasa si un periodo cierra con saldo negativo (déficit real, no solo sobregiro momentáneo dentro del periodo)*. Detectado durante la revisión de la implementación del módulo de gastos, al verificar que el sobregiro probado por los tests correspondía al comportamiento correcto dentro del periodo activo — surgió la pregunta de qué pasa al cierre. El modelo original de decisión de sobrante (§3) solo contemplaba montos positivos. Se resuelve arrastrando el déficit automáticamente, sin ofrecer la opción "ahorrar" (no aplica a una deuda).
- *La fórmula original de §5 redistribuía dentro del mismo día.* Detectado por el usuario probando la app real: gastar exactamente lo sugerido para hoy hacía bajar la cifra de "hoy" en la misma consulta, y un sobregiro grande el mismo día podía mostrar un residuo positivo pequeño en vez del tamaño real del exceso — contradiciendo la propia frase de §5 ("la cifra del día siguiente baja sola", no la de hoy). Se resuelve separando `objetivo_hoy` (fijo, sobre el disponible de antes de cualquier gasto de hoy) de `gastado_hoy` — ver la fórmula corregida arriba.

**Resuelta:**

**¿Un aporte a una meta de ahorro reduce el `disponible` del periodo? → Sí.**

Decisión confirmada: un aporte a meta se trata como un gasto más para efectos del motor de flujo de caja. El asiento sale de la cuenta del periodo hacia la cuenta de la meta, igual que un gasto sale hacia una cuenta externa.

**Razón:** si el aporte no redujera el disponible, el usuario podría "ahorrar" sin sentir ningún costo en su día a día, y eso rompería la conexión entre la decisión de ahorrar y la cifra que ve todos los días — justo el mecanismo que hace funcionar el producto. Consistente con la fórmula del §5 tal como está escrita, sin necesidad de un caso especial.

---

## 7. Qué queda fuera de este documento (y por qué)

- **Notificaciones:** las reglas de diseño ya están en el Documento Maestro §13.4; su lógica de disparo (umbrales, agrupación, silenciado) se detalla en la Fase de contrato de API, no aquí, porque depende de los endpoints disponibles.
- **Estructura de categorías predeterminadas:** lista concreta pendiente para wireframes, no es una decisión de dominio.
- **Multi-moneda:** fuera de alcance del MVP (Documento Maestro §4.2).
