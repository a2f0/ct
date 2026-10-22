CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  location_key TEXT NOT NULL UNIQUE,
  continent TEXT,
  country TEXT,
  region TEXT,
  region_code TEXT,
  city TEXT,
  timezone TEXT
);

ALTER TABLE clicks ADD COLUMN ip_address TEXT;
ALTER TABLE clicks ADD COLUMN location_id INTEGER REFERENCES locations(id);
CREATE INDEX clicks_location ON clicks(location_id);
