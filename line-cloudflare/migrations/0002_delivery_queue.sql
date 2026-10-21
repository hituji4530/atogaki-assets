-- 配信キュー化（docs/production-design.md 3章）。追加のみ。step_deliveries の削除は次のリリースで行う

-- ステップ: design.json との対応キー、停止、時刻指定
ALTER TABLE scenario_steps ADD COLUMN key TEXT;
ALTER TABLE scenario_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE scenario_steps ADD COLUMN at_time TEXT; -- '10:00' なら offset 経過後の、次のその時刻（日本時間）に送る
ALTER TABLE scenario_steps ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_steps_key ON scenario_steps (scenario_id, key);
CREATE INDEX idx_steps_scenario ON scenario_steps (scenario_id);

ALTER TABLE keyword_rules ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE keyword_rules ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- 配信キュー：ステップ配信の「予定」と「結果」を1行で持つ
CREATE TABLE deliveries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  step_id    INTEGER NOT NULL,
  due_at     INTEGER NOT NULL,                -- 本来の配信時刻
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | skipped | failed | canceled
  attempts   INTEGER NOT NULL DEFAULT 0,
  next_at    INTEGER NOT NULL,                -- 次に処理してよい時刻（失敗時はバックオフ後）
  retry_key  TEXT,                            -- X-Line-Retry-Key。同じ送信の再送では同じ値を使う
  error      TEXT,
  created_at INTEGER NOT NULL,
  sent_at    INTEGER,
  UNIQUE (user_id, step_id)
);
CREATE INDEX idx_deliveries_due  ON deliveries (status, next_at);
CREATE INDEX idx_deliveries_user ON deliveries (user_id, status);
CREATE INDEX idx_deliveries_step ON deliveries (step_id, status);

-- 管理画面と一斉配信の読み取りを減らす
CREATE INDEX idx_friend_tags_tag ON friend_tags (tag_id, user_id);
CREATE INDEX idx_friends_status  ON friends (status, followed_at);
CREATE INDEX idx_enrollments_scenario ON enrollments (scenario_id, status);
CREATE TABLE stats_monthly (
  ym  TEXT NOT NULL, -- '2026-10'（日本時間）
  via TEXT NOT NULL, -- reply | push | multicast
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ym, via)
);

-- 運用ログ（トークン無効・送信失敗など）
CREATE TABLE ops_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL, -- info | warn | error
  kind       TEXT NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);

-- 既存データの移行：配信済みの記録
INSERT INTO deliveries (user_id, step_id, due_at, status, next_at, created_at, sent_at)
  SELECT user_id, step_id, created_at, result, created_at, created_at, created_at FROM step_deliveries;

-- 既存データの移行：まだ届いていない予定
INSERT OR IGNORE INTO deliveries (user_id, step_id, due_at, status, next_at, created_at)
  SELECT e.user_id, s.id, e.started_at + s.offset_minutes * 60000, 'pending',
         e.started_at + s.offset_minutes * 60000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM enrollments e
    JOIN scenario_steps s ON s.scenario_id = e.scenario_id
    JOIN friends f ON f.user_id = e.user_id AND f.status = 'active'
   WHERE e.status = 'active';

-- 移行時点で期限を10分以上過ぎた未配信分は送らない（旧コードの added_later ガードで止まっていた分もここに入る）
UPDATE deliveries SET status = 'skipped', error = 'migrated_past_due'
 WHERE status = 'pending' AND due_at < CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 600000;

INSERT INTO stats_monthly (ym, via, n)
  SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch', '+9 hours'), via, COUNT(*)
    FROM messages WHERE direction = 'out' GROUP BY 1, 2;
