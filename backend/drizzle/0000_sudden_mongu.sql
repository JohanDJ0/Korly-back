CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identidades_externas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"proveedor" text NOT NULL,
	"id_en_proveedor" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identidades_externas_proveedor_id_unica" UNIQUE("proveedor","id_en_proveedor")
);
--> statement-breakpoint
ALTER TABLE "identidades_externas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identidades_externas" ADD CONSTRAINT "identidades_externas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidades_externas" ADD CONSTRAINT "identidades_externas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenants_lectura_propia" ON "tenants" AS PERMISSIVE FOR SELECT TO "app_backend" USING ("tenants"."id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenants_alta_aprovisionamiento" ON "tenants" AS PERMISSIVE FOR INSERT TO "app_backend" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "identidades_externas_acceso_backend" ON "identidades_externas" AS PERMISSIVE FOR ALL TO "app_backend" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "usuarios_aislamiento_tenant" ON "usuarios" AS PERMISSIVE FOR ALL TO "app_backend" USING ("usuarios"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("usuarios"."tenant_id" = current_setting('app.tenant_id', true)::uuid);