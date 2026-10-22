CREATE TABLE clicks (
  site TEXT NOT NULL,
  id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  page TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT,
  PRIMARY KEY (site, id)
) WITHOUT ROWID;

CREATE INDEX clicks_time ON clicks(timestamp DESC);
CREATE INDEX clicks_site_time ON clicks(site, timestamp DESC);
CREATE INDEX clicks_site_page_time ON clicks(site, page, timestamp DESC);
CREATE INDEX clicks_received ON clicks(received_at DESC, id DESC);
CREATE INDEX clicks_site_received ON clicks(site, received_at DESC, id DESC);
