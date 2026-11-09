-- "Spicy" and "Kid friendly" were hand-set dish flags; they are tags now. Carry the live ones over, then drop the flags.
INSERT INTO `version_tags` (`id`, `created_at`, `updated_at`, `version_id`, `tag`, `key`)
SELECT lower(hex(randomblob(16))), CAST(strftime('%s','now') AS integer) * 1000, CAST(strftime('%s','now') AS integer) * 1000, v.`id`, 'spicy', 'spicy'
FROM `versions` v
WHERE json_extract(v.`flags`, '$.spicy.value') = 1
  AND NOT EXISTS (SELECT 1 FROM `version_tags` t WHERE t.`version_id` = v.`id` AND t.`key` = 'spicy' AND t.`deleted_at` IS NULL);
--> statement-breakpoint
INSERT INTO `version_tags` (`id`, `created_at`, `updated_at`, `version_id`, `tag`, `key`)
SELECT lower(hex(randomblob(16))), CAST(strftime('%s','now') AS integer) * 1000, CAST(strftime('%s','now') AS integer) * 1000, v.`id`, 'kid friendly', 'kid friendly'
FROM `versions` v
WHERE json_extract(v.`flags`, '$.kid_friendly.value') = 1
  AND NOT EXISTS (SELECT 1 FROM `version_tags` t WHERE t.`version_id` = v.`id` AND t.`key` = 'kid friendly' AND t.`deleted_at` IS NULL);
--> statement-breakpoint
UPDATE `versions`
SET `flags` = json_remove(`flags`, '$.spicy', '$.kid_friendly'), `updated_at` = CAST(strftime('%s','now') AS integer) * 1000
WHERE json_type(`flags`, '$.spicy') IS NOT NULL OR json_type(`flags`, '$.kid_friendly') IS NOT NULL;
