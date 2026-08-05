# ADR-004 — Periodos anclados a calendario

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** modelo de periodos presupuestales y manejo de tiempo

---

## Contexto

El periodo **quincenal mexicano** es el caso dominante del producto. Es también donde más fácilmente se cometen bugs silenciosos.

**Ambigüedad crítica:** *quincenal* (24 pagos al año) **no es** *catorcenal* (26 pagos al año). El pago quincenal está anclado al calendario y no cambia aunque el mes tenga 28, 30 o 31 días. Las quincenas tienen **longitud variable entre 13 y 16 días**.

## Opciones consideradas

1. **Duración fija:** inicio + N días.
2. **Regla de anclaje a calendario** por tipo de periodo.

## Decisión

**Opción 2.** Cada periodo se define por **tipo + regla de anclaje**, nunca por duración.

| Tipo | Regla de anclaje |
|---|---|
| **Quincenal** | Días de calendario: **1–15 y 16–fin de mes** (default). Longitud variable 13–16 días |
| **Semanal** | Anclado a un día de la semana |
| **Mensual** | Con manejo explícito de fin de mes y febrero |
| **Personalizado** | Rango de fechas explícito |

### Por qué 1–15 / 16–fin de mes como default

Alinea los periodos con los meses naturales, de modo que los reportes mensuales cuadran sin acrobacias. Es configurable, pero la mayoría de usuarios no cambiará el default, así que importa que sea el correcto.

**Nota:** los corrimientos de fecha de pago **no afectan esta decisión**, porque el evento de ingreso está separado del periodo (ver ADR-007).

## Consecuencias

### Positivas

- Coincide con la nómina real del usuario, que es el propósito central del producto.
- **Sin drift acumulado.** Con duración fija, después de un año el periodo estaría desfasado varios días respecto a la quincena real de la persona, y la cifra mostrada dejaría de significar algo.

### Negativas

- Más complejo de implementar y probar. Requiere tests con casos frontera: febrero, meses de 31 días, año bisiesto.
- La longitud variable complica comparar periodos entre sí (una quincena de 13 días no es comparable en bruto con una de 16). **Los reportes deben normalizar o advertirlo explícitamente.**

## Complemento obligatorio: manejo de tiempo

- **Todo se almacena en UTC**, resuelto a la zona IANA del usuario al leer.
- **México eliminó el horario de verano** (último cambio: 30 de octubre de 2022). El centro del país quedó permanentemente en **UTC−6**.
- **Excepciones:** Baja California y municipios fronterizos de Chihuahua, Coahuila, Nuevo León y Tamaulipas siguen el DST de Estados Unidos.
- **LATAM:** Chile sí observa DST. Brasil lo abolió en 2019. Paraguay lo discontinuó en octubre de 2024. Argentina (2009) y Uruguay (2015) no lo tienen.
- **Mantener `tzdata` actualizado.** Las reglas cambian con poco aviso: el decreto mexicano de 2022 se publicó con ~2 días de anticipación.

## Cierre de periodos

Estrategia **híbrida: cálculo perezoso (lazy) + job idempotente de catch-up**.

- El cron es un **disparador, no la capa de decisión**. Corre en UTC; la aplicación decide si la ejecución procede.
- Los jobs pueden **duplicarse o saltarse**. Todo job debe ser idempotente: upserts, estado por fila (`closed_at`), advisory locks, y fecha objetivo pasada explícitamente (nunca `now()` dentro del job).
- Usuarios inactivos con periodos vencidos hace meses: el cálculo perezoso lo resuelve al abrir la app. El catch-up cubre solo side-effects (notificaciones, resúmenes).

## Referencias

- Documento Maestro v2, §6.11 y §7.4
- LFT Art. 88 (pago adelantado a día hábil anterior)
- ADR-007 (separación periodo / ingreso)
