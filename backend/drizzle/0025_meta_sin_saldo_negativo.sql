-- Red de seguridad en la base de datos: una cuenta de meta nunca debe quedar con
-- saldo negativo por un movimiento que le RESTA dinero. La aplicación ya lo valida
-- (aportar, retirar y pagar con una meta comprueban el saldo), pero un hueco en el
-- código no debe poder crear dinero que no existe: este trigger lo rechaza aunque
-- la validación de la aplicación falle o se olvide en un movimiento futuro.
--
-- Solo mira asientos NEGATIVOS (los que sacan dinero de la meta): un asiento
-- positivo nunca se rechaza, así una meta que ya estuviera en negativo por un dato
-- anterior puede recuperarse aportándole. El asiento recién insertado ya cuenta en
-- la suma (AFTER INSERT). Corre con los permisos de quien inserta, así que la RLS
-- sigue aplicando igual.
CREATE OR REPLACE FUNCTION asientos_meta_no_negativa() RETURNS trigger AS $$
BEGIN
  IF NEW.monto_valor_minimo < 0
     AND NEW.cuenta_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM cuentas c WHERE c.id = NEW.cuenta_id AND c.tipo = 'meta')
     AND (SELECT COALESCE(SUM(a.monto_valor_minimo), 0) FROM asientos a WHERE a.cuenta_id = NEW.cuenta_id) < 0
  THEN
    RAISE EXCEPTION 'Una meta no puede quedar con saldo negativo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER asientos_meta_no_negativa
AFTER INSERT ON "asientos"
FOR EACH ROW EXECUTE FUNCTION asientos_meta_no_negativa();
