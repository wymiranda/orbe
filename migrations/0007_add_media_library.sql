CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE media_asset_links (
  asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, owner_type, owner_id)
);

CREATE INDEX idx_media_asset_links_owner ON media_asset_links(owner_type, owner_id);
CREATE INDEX idx_media_asset_links_asset ON media_asset_links(asset_id);
