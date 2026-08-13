-- キャラ一覧・選択中キャラ・画像フォルダ設定を端末間で共有する。
CREATE TABLE IF NOT EXISTS sync_character_settings (
  setting_key TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_character_settings_updated_at
  ON sync_character_settings(updated_at);
