-- 友だち（LINEユーザー）
CREATE TABLE friends (
  user_id      TEXT PRIMARY KEY,
  display_name TEXT,
  status       TEXT NOT NULL DEFAULT 'active', -- active | blocked
  followed_at  INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- タグ
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE friend_tags (
  user_id    TEXT NOT NULL,
  tag_id     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tag_id)
);

-- シナリオ（ステップ配信）
CREATE TABLE scenarios (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  trigger TEXT NOT NULL DEFAULT 'manual' -- follow | manual
);

-- offset_minutes: シナリオ開始からの経過分。require_tag / exclude_tag で分岐
CREATE TABLE scenario_steps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id    INTEGER NOT NULL,
  offset_minutes INTEGER NOT NULL,
  message        TEXT NOT NULL,
  require_tag    TEXT,
  exclude_tag    TEXT,
  created_at     INTEGER NOT NULL
);

CREATE TABLE enrollments (
  user_id     TEXT NOT NULL,
  scenario_id INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- active | stopped
  PRIMARY KEY (user_id, scenario_id)
);

CREATE TABLE step_deliveries (
  user_id    TEXT NOT NULL,
  step_id    INTEGER NOT NULL,
  result     TEXT NOT NULL, -- sent | skipped
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, step_id)
);

-- キーワード自動応答
CREATE TABLE keyword_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword        TEXT NOT NULL,
  match_type     TEXT NOT NULL DEFAULT 'contains', -- contains | exact
  reply          TEXT,
  add_tag        TEXT,
  start_scenario TEXT
);

-- 送受信ログ（チャット履歴）
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  direction  TEXT NOT NULL, -- in | out
  via        TEXT NOT NULL, -- message | postback | follow | reply | push | multicast
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_user ON messages (user_id, id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ===== サンプルデータ =====
INSERT INTO scenarios (id, name, trigger) VALUES (1, 'ウェルカム', 'follow');

INSERT INTO scenario_steps (scenario_id, offset_minutes, message, require_tag, exclude_tag, created_at) VALUES
  (1, 0, '{name}さん、友だち追加ありがとうございます！🐑
このアカウントでは、ブログと副業のリアルな話をお届けします。', NULL, NULL, 0),
  (1, 0, '{"type":"text","text":"よければ教えてください。いま一番興味があるのは？","quickReply":{"items":[{"type":"action","action":{"type":"postback","label":"ブログ","data":"tag=興味:ブログ&reply=ありがとうございます！ブログ向けの情報を優先してお届けしますね。","displayText":"ブログ"}},{"type":"action","action":{"type":"postback","label":"副業","data":"tag=興味:副業&reply=ありがとうございます！副業向けの情報を優先してお届けしますね。","displayText":"副業"}}]}}', NULL, NULL, 0),
  (1, 1440, '{name}さん、昨日は登録ありがとうございました。
「資料」と送ると、無料のスタートガイドをお渡しします📄', NULL, '資料請求', 0),
  (1, 2880, '【ブログに興味がある方へ】
最初の10記事で意識したい3つのことをまとめました。', '興味:ブログ', NULL, 0),
  (1, 2880, '【副業に興味がある方へ】
月1万円を最初に稼ぐまでのロードマップをまとめました。', '興味:副業', NULL, 0),
  (1, 4320, '登録から3日たちました。ここまで読んでくれてありがとうございます！
質問があれば、このトークにそのまま送ってくださいね。', NULL, NULL, 0);

INSERT INTO keyword_rules (keyword, match_type, reply, add_tag, start_scenario) VALUES
  ('資料', 'contains', 'お待たせしました！スタートガイドはこちらです👇
https://example.com/guide', '資料請求', NULL),
  ('こんにちは', 'exact', 'こんにちは、{name}さん！🐑', NULL, NULL);
