# ADR-005 — Aislamiento por `tenant_id` con Row Level Security desde el día 1

- **Estado:** aceptado
- **Fecha:** 2026-08-05
- **Decide:** estrategia de multi-tenancy y aislamiento de datos

---

## Contexto

El plan Business está diferido a la Fase 6 del roadmap. Sin embargo:

1. **Retrofittear multi-tenancy** sobre una base con miles de usuarios es de las migraciones más peligrosas que existen.
2. **IDOR/BOLA** —acceder a datos de otro usuario alterando un ID en la petición— es el **fallo #1 del OWASP API Security Top 10** y el escenario que hunde a una aplicación financiera.

## Opciones consideradas

1. **Solo `user_id`**, añadir tenancy cuando llegue Business.
2. **`tenant_id` en todas las tablas de dominio desde el inicio**, con RLS de PostgreSQL.
3. **Esquema o base de datos por tenant.**

## Decisión

**Opción 2.** Toda tabla de dominio lleva `tenant_id` desde la primera migración. En el MVP, **cada usuario personal es su propio tenant de un solo miembro**. RLS activo en la base de datos.

| Estrategia | Aislamiento | Complejidad para un dev | Veredicto |
|---|---|---|---|
| `tenant_id` + RLS | Bueno | Baja | **Elegida** |
| Esquema por tenant | Mejor | Media-alta | Descartada |
| Base por tenant | Máximo | Muy alta | Descartada |

## Consecuencias

### Positivas

- **Business se vuelve una feature de producto, no una reescritura.**
- RLS da **defensa en profundidad**: si un bug de autorización se escapa en la capa de aplicación, la base de datos simplemente no devuelve las filas. Para un desarrollador solo, sin code review de un tercero, esa red de seguridad tiene un valor alto.

### Negativas

- Complejidad desde el día 1 para un beneficio que se cobra hacia el mes 12. **Es una apuesta consciente.**
- RLS mal configurado se manifiesta como "no veo mis propios datos", que es confuso de depurar.
- **Cada consulta debe correr con el contexto de tenant seteado.** Un connection pool mal manejado aquí es una fuga de datos entre tenants. Requiere disciplina real y tests específicos.

## Reglas derivadas

1. Ninguna tabla de dominio se crea sin `tenant_id`.
2. El contexto de tenant se establece en un único punto del ciclo de request, nunca por consulta individual.
3. Debe existir un test que verifique que un tenant no puede leer datos de otro, ejecutado en CI.

## Alternativas descartadas

**Esquema o base por tenant:** aislamiento superior, carga operativa insostenible para una persona.

## Referencias

- Documento Maestro v2, §7.7
- OWASP API Security Top 10 — API1: Broken Object Level Authorization
- ADR-003 (identidad)
