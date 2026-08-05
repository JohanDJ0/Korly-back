# ADR-002 — Dinero como enteros en unidades mínimas

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** representación de montos monetarios

---

## Contexto

Los montos se guardan, suman, **dividen** (el cálculo `disponible ÷ días restantes` es una división) y se muestran. Los errores de redondeo en dinero erosionan la confianza de forma desproporcionada respecto a su magnitud real.

## Opciones consideradas

1. **`float` / `double`.** Descartado sin discusión: `0.1 + 0.2 ≠ 0.3` en aritmética binaria.
2. **`NUMERIC` / `DECIMAL` de PostgreSQL.**
3. **Entero en la unidad mínima de la moneda.**

## Decisión

**Opción 3.** Los montos se almacenan como **entero en la unidad mínima** (centavos para MXN), con el **código ISO de moneda siempre acompañando al monto**.

Ejemplo: `$1,240.00 MXN` se almacena como `124000` + `MXN`.

## Consecuencias

### Positivas

- Aritmética exacta, sin errores de redondeo acumulados.
- Sin sorpresas al serializar a JSON: JavaScript no tiene decimales nativos, y un `NUMERIC` de PostgreSQL llega como string o pierde precisión.
- Representación consistente entre backend, web y futuro cliente móvil.

### Negativas

- Cada punto de entrada y salida requiere conversión. **Olvidar una sola conversión produce un monto 100× mayor o menor.**
- Los datos crudos en la base son ilegibles para un humano (`124000`), lo que hace el debugging más incómodo.
- La división del motor de flujo de caja obliga a definir el redondeo explícitamente: `3000 ÷ 7` no es entero.

## Reglas derivadas (obligatorias)

1. **Un solo lugar en el código** convierte entre entero y representación para presentación. Ninguna conversión ad hoc.
2. El **redondeo de la cifra diaria se trunca hacia abajo** (ver ADR-004 y modelo de dominio). El error debe favorecer al usuario: mejor un pequeño sobrante que un sobregiro.
3. **Nunca se almacena un monto sin su moneda**, aunque hoy solo exista MXN.

## Pendiente para el modelo de dominio (Fase 2)

El residuo del truncamiento se acumula (7 × $0.57 ≈ $4). No desaparece del ledger, solo no se muestra en la cifra diaria. Debe definirse si el último día del periodo libera ese residuo o si se arrastra al sobrante. **Propuesta inicial: al sobrante.**

## Referencias

- Documento Maestro v2, §7.5
- ADR-004 (periodos), ADR-007 (periodo vs. ingreso)
