CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`entity_name` text,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
