ALTER TABLE clicks ADD COLUMN app TEXT;
ALTER TABLE clicks ADD COLUMN environment TEXT CHECK (environment IN ('production', 'staging'));

-- Skyline was the only registered site, with one production origin.
UPDATE clicks SET environment = 'production' WHERE site = 'skyline';

-- Single-dimension indexes serve all-site filters, including the default
-- production overview; the composite serves site + environment + app filters.
CREATE INDEX clicks_app_time ON clicks(app, timestamp DESC, id DESC, site DESC);
CREATE INDEX clicks_environment_time ON clicks(environment, timestamp DESC, id DESC, site DESC);
CREATE INDEX clicks_site_environment_app_time ON clicks(site, environment, app, timestamp DESC, id DESC);
