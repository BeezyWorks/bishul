ALTER TABLE `persons` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `persons` ADD `birth_date_approx` integer DEFAULT false NOT NULL;