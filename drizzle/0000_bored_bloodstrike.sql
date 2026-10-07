CREATE TABLE `display_state` (
	`id` text PRIMARY KEY NOT NULL,
	`selection` text NOT NULL,
	`auto_advance` integer DEFAULT 1 NOT NULL,
	`interval_seconds` integer DEFAULT 10 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`live_url` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`screen_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `screen_id`)
);
