-- Serves IP drill-down pages in click-time order, like the other dimension indexes.
CREATE INDEX clicks_ip_time ON clicks(ip_address, timestamp DESC, id DESC, site DESC);
