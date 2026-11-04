-- Built-in occasion dimensions (household_id NULL = shared by everyone). Ids are fixed ("builtin_<slug>") so the
-- seed is idempotent; the slug is the lower-case name with underscores, which the calendar matches meals against.
INSERT OR IGNORE INTO dimensions (id, created_at, updated_at, deleted_at, household_id, name, kind) VALUES
  ('builtin_leil_shabbat', 1767225600000, 1767225600000, NULL, NULL, 'Leil Shabbat', 'jewish'),
  ('builtin_shabbat_day', 1767225600000, 1767225600000, NULL, NULL, 'Shabbat day', 'jewish'),
  ('builtin_weeknight', 1767225600000, 1767225600000, NULL, NULL, 'Weeknight', 'jewish'),
  ('builtin_pesach', 1767225600000, 1767225600000, NULL, NULL, 'Pesach', 'jewish'),
  ('builtin_chanukah', 1767225600000, 1767225600000, NULL, NULL, 'Chanukah', 'jewish'),
  ('builtin_purim', 1767225600000, 1767225600000, NULL, NULL, 'Purim', 'jewish'),
  ('builtin_shavuot', 1767225600000, 1767225600000, NULL, NULL, 'Shavuot', 'jewish'),
  ('builtin_sukkot', 1767225600000, 1767225600000, NULL, NULL, 'Sukkot', 'jewish'),
  ('builtin_rosh_hashana', 1767225600000, 1767225600000, NULL, NULL, 'Rosh Hashana', 'jewish'),
  ('builtin_yom_tov', 1767225600000, 1767225600000, NULL, NULL, 'Yom Tov', 'jewish'),
  ('builtin_thanksgiving', 1767225600000, 1767225600000, NULL, NULL, 'Thanksgiving', 'civil'),
  ('builtin_kids_love_it', 1767225600000, 1767225600000, NULL, NULL, 'Kids love it', 'custom'),
  ('builtin_make_ahead', 1767225600000, 1767225600000, NULL, NULL, 'Make-ahead', 'custom'),
  ('builtin_sick_friends', 1767225600000, 1767225600000, NULL, NULL, 'Sick friends', 'custom');
