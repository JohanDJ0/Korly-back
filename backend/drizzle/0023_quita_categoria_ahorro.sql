-- La categoría predeterminada "Ahorro" engaña: un gasto con esa categoría solo se
-- gasta, no llega a ninguna meta (aportar a una meta es otra operación). Se quita
-- de las predeterminadas: las que nadie usó se borran; las que ya tienen gastos,
-- recurrentes o cargos asociados (una llave foránea impide borrarlas) pasan a ser
-- categorías personalizadas, para que su dueño pueda renombrarlas o eliminarlas
-- cuando deje de usarlas. Una categoría personalizada que el usuario llamó
-- "Ahorro" por su cuenta (es_predeterminada = false) no se toca.
DELETE FROM "categorias" c
WHERE c."nombre" = 'Ahorro'
  AND c."es_predeterminada"
  AND NOT EXISTS (SELECT 1 FROM "gastos" g WHERE g."categoria_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "gastos_recurrentes" r WHERE r."categoria_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "cargos_tarjeta" t WHERE t."categoria_id" = c."id");--> statement-breakpoint
UPDATE "categorias" SET "es_predeterminada" = false WHERE "nombre" = 'Ahorro' AND "es_predeterminada";
