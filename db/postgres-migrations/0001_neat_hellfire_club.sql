CREATE TABLE "monitor_access" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text,
	"generation" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "monitor_access_singleton" CHECK ("monitor_access"."id" = 'main')
);
