CREATE TABLE IF NOT EXISTS "album" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text,
	"url" text,
	"session_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"preview_path" text,
	"tiff_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"resolution_x" integer NOT NULL,
	"resolution_y" integer NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"iso" integer,
	"aperture" real,
	"exposure" text,
	"focal_length" text,
	"camera" text,
	"lens" text,
	"white_balance" real,
	"tint" real,
	"is_archived" boolean DEFAULT false NOT NULL,
	"phash" text,
	"stack_id" integer,
	"is_stack_base" boolean DEFAULT false NOT NULL,
	"last_exported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_to_tag" (
	"image_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "image_to_tag_image_id_tag_id_pk" PRIMARY KEY("image_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"preview_path" text,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer NOT NULL,
	"album_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"integration" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pp3" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"pp3" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"image_id" integer NOT NULL,
	"is_marked_for_export" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'album_session_id_session_id_fk') THEN ALTER TABLE "album" ADD CONSTRAINT "album_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_session_id_session_id_fk') THEN ALTER TABLE "image" ADD CONSTRAINT "image_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_stack_id_image_id_fk') THEN ALTER TABLE "image" ADD CONSTRAINT "image_stack_id_image_id_fk" FOREIGN KEY ("stack_id") REFERENCES "public"."image"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_to_tag_image_id_image_id_fk') THEN ALTER TABLE "image_to_tag" ADD CONSTRAINT "image_to_tag_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_to_tag_tag_id_tag_id_fk') THEN ALTER TABLE "image_to_tag" ADD CONSTRAINT "image_to_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_image_id_image_id_fk') THEN ALTER TABLE "media" ADD CONSTRAINT "media_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_album_id_album_id_fk') THEN ALTER TABLE "media" ADD CONSTRAINT "media_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snapshot_image_id_image_id_fk') THEN ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_integration_external_id_idx" ON "album" USING btree ("integration","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recorded_at_idx" ON "image" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_is_archived_idx" ON "image" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_phash_idx" ON "image" USING btree ("phash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_rating_idx" ON "image" USING btree ("rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_imported_at_idx" ON "import" USING btree ("imported_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_date_idx" ON "import" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "import_file_path_idx" ON "import" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_integration_external_id_idx" ON "media" USING btree ("integration","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_is_archived_idx" ON "session" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_started_at_idx" ON "session" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshot_created_at_idx" ON "snapshot" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_name_idx" ON "tag" USING btree ("name");