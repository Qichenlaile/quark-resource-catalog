ALTER TABLE resources ADD COLUMN quark_clicks INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE resources ADD COLUMN link_reported INTEGER NOT NULL DEFAULT 0;
