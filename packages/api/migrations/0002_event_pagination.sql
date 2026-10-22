DROP INDEX clicks_received;
DROP INDEX clicks_site_received;
DROP INDEX clicks_time;
DROP INDEX clicks_site_time;

CREATE INDEX clicks_time ON clicks(timestamp DESC, id DESC, site DESC);
CREATE INDEX clicks_site_time ON clicks(site, timestamp DESC, id DESC);
