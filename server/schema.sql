-- Running totals only. No install id, no timestamps, no rows per submission —
-- there is deliberately nothing here that could be correlated to a person.
CREATE TABLE IF NOT EXISTS site_counts (
  domain    TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0
);

-- One row per machine, carrying no site data. Deliberately in its own table so
-- there is no join that could reveal what any given install downloads.
CREATE TABLE IF NOT EXISTS installs (
  id          TEXT PRIMARY KEY,
  app_version TEXT NOT NULL,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);
