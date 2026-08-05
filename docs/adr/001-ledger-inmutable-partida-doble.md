# ADR-001 — Ledger inmutable de partida doble

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** modelo de registro de movimientos de dinero

---

## Contexto

El sistema mueve dinero entre conceptos: gastos, ingresos, arrastre de sobrante al siguiente periodo, aportes a metas de ahorro y retiros. El requisito original pide **trazabilidad completa**.

La forma intuitiva de modelarlo es una tabla de transacciones más una columna de saldo que se actualiza en cada movimiento. Es la que produce descuadres silenciosos.

## Opciones consideradas

1. **Transacciones + saldo mutable.** Simple y rápido de escribir.
2. **Partida doble con asientos append-only.** El saldo es la suma de los asientos, no un dato almacenado.
3. **Event sourcing completo.**

## Decisión

**Opción 2.** Cada movimiento genera asientos que suman cero. Nada se edita ni se borra: una corrección es un asiento de reversión más el asiento nuevo.

Cuentas del sistema: efectivo, banco, tarjeta, meta de ahorro, periodo presupuestal.

| Operación | Asiento |
|---|---|
| Gasto | Débito categoría/periodo, crédito cuenta de origen |
| Ingreso | Débito cuenta, crédito ingreso |
| Arrastre de sobrante | Periodo A → Periodo B |
| Aporte a meta | Periodo/cuenta → meta |
| Retiro de ahorro | Meta → cuenta, con motivo en metadata |
| Corrección | Asiento de reversión + asiento nuevo |

## Consecuencias

### Positivas

- El saldo **no puede descuadrar** porque no existe como dato independiente.
- La trazabilidad del sobrante —el requisito de mayor valor percibido— sale gratis: cada peso tiene origen, destino y fecha.
- Auditoría completa sin construir nada adicional.

### Negativas

- Escribir un gasto deja de ser un `INSERT` y pasa a ser una transacción con varios asientos. Más código y más lento de desarrollar.
- Consultar "cuánto llevo gastado" requiere agregación. A escala se necesitarán vistas materializadas o saldos cacheados, y ahí regresa parte de la complejidad evitada.
- **Es la decisión que más tentará a abandonarse** en las primeras semanas de desarrollo. Abandonarla después implica migrar datos existentes a partida doble, que es doloroso.

## Justificación de mantenerla pese al costo

Es una decisión **Tipo 1**: irreversible en la práctica. El modo de fallo que previene —descuadres silenciosos que el usuario detecta antes que el desarrollador— es letal para la credibilidad de una aplicación financiera.

## Alternativa descartada

**Event sourcing completo:** potencia innecesaria para este dominio y complejidad que un solo desarrollador no sostiene.

## Referencias

- Documento Maestro v2, §7.1
- Práctica estándar en Stripe, Square, Modern Treasury, TigerBeetle, Beancount
