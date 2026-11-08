CREATE TABLE `meal_households` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`meal_id` text NOT NULL,
	`household_id` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_households_uq` ON `meal_households` (`meal_id`,`household_id`);--> statement-breakpoint
ALTER TABLE `meals` ADD `slot` text DEFAULT 'dinner' NOT NULL;--> statement-breakpoint
ALTER TABLE `meals` ADD `hosted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `meals` ADD `name_edited` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Meals that already exist get a slot from their time of day (no time means dinner, the old default).
UPDATE `meals` SET `slot` = 'breakfast' WHERE `time` IS NOT NULL AND `time` < 600;--> statement-breakpoint
UPDATE `meals` SET `slot` = 'lunch' WHERE `time` IS NOT NULL AND `time` >= 600 AND `time` < 960;--> statement-breakpoint
-- Existing meals keep their names as typed.
UPDATE `meals` SET `name_edited` = 1;
