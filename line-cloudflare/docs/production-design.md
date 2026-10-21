# line-cloudflare 本番運用化 改修設計書

設計：Fable（アドバイザー）／レビュー：Claude（2026-10-21）
目的：構築者が小さな店舗のLINEを納品し、「見守りプラン（月2,000〜5,000円）」で保守できる状態にする。判断の軸は **技術的な保守が1社あたり月10〜20分に収まること**。

## レビューメモ（Claude）

- 方針・優先度ともに妥当。特に「ステップ配信・一斉配信・予約配信・再送を、D1上の配信キュー1つに統一する」案は、試作の弱点（毎分の全件JOIN、失敗したら二度と送らない、同期の一斉配信）をまとめて解消できるので採用したい。
- 一番大きな判断は **6章の運用モデル（構築者のCloudflareアカウントに集約するか）**。これまでスキルでは「クライアント名義のアカウントに置く」と案内してきたので、方針転換になる。集約にする場合も、LINE公式アカウントは必ず店舗名義にし、契約に個人情報の預かりと返却手順を入れる。
- 集約にすると Workers Paid（月$5）が構築者の固定費になる。3社以上なら1社あたりは誤差。
- `X-Line-Retry-Key` は、LINEの公式ドキュメントでは「受理済みのキーで再送すると409が返る」「キーの有効期限は24時間」という仕様だったと記憶している。実装前に必ず確認する（10章の要確認に含まれている）。
- 作業量の合計は「本番投入前に必須」で約9〜10日（人の作業換算）。Claude Codeで実装する場合は、次の3段階に分けて、各段階でテストとデモ確認を挟むのがよい。
  1. **配信の作り直し**：P1（配信キュー）・P2（再送と冪等性）・P3（ポーリング廃止・集計の軽量化）＋テスト基盤（E2）
  2. **見守りと権限**：P4（/health と通知）・P5（オーナー／構築者のトークン）・P6（環境化と一括デプロイ）
  3. **オーナーの更新**：P7（ステップ・キーワードの編集）・P8（予約配信）

## 決定事項（2026-10-21、事業者確認済み）

| 論点 | 決定 |
|---|---|
| 運用モデル | **構築者のCloudflareアカウントに集約**（Workers Paid 月$5を全顧客で1契約）。LINE公式アカウントは店舗名義。契約に個人情報の預かりと返却手順を明記 |
| 異常の通知先 | **構築者のLINE**（構築者用のテスト公式アカウントから push。`ALERT_LINE_TOKEN` / `ALERT_LINE_TO`）＋外部の死活監視サービスのメール |
| オーナーの編集範囲 | **文面と時刻まで**（文面・offset・at_time・停止・予約配信・テスト送信）。require_tag / exclude_tag、シナリオ追加は構築者 |
| 配信時間帯 | **9:00〜21:00 に寄せる**（時間外になる配信は次の9:00以降に送る。`delivery_window` 既定値） |

## 実装状況

| 段階 | 内容 | 状況 |
|---|---|---|
| 1 | 配信の作り直し（P1・P2・P3、配信時間帯、テスト基盤） | **完了**（2026-10-21）。`migrations/0002_delivery_queue.sql`、`src/schedule.ts`、`test/` |
| 2 | 見守りと権限（P4・P5・P6） | 未着手 |
| 3 | オーナーの更新（P7・P8、E1） | 未着手 |

段階1での設計からの変更：
- 再送キーは「1回のプッシュ（同じ人宛てにまとめた最大5通）」ごとに振る。再送では同じ組み合わせ・同じキーで送る（LINE は同じキーの2回目を 409 で弾き、内容を変えずに再送することを求めているため）
- 一斉配信（P8）はまだ旧方式（同期送信）。段階3で配信キューに載せる
- usage_daily（読み書き行数の自己計測）は段階2の監視と一緒に入れる

以下は推奨どおりで進める（必要になったら見直す）：トーク履歴の保持は180日／移行時点で期限切れの未配信分は送らない／ブロック→再フォローでシナリオはやり直さない／名前入り一斉配信は許可し、画面に「時間がかかる」と表示。

---

## 1. 全体方針

- **優先するのは「見守り月10〜20分」を数字で成立させること**。そのために (a) Cronの読み取りを「期限が来た行だけ」にする配信キュー化、(b) 壊れたら構築者に届く監視、(c) 全顧客を1本のスクリプトで更新できる運用、の3つを本番投入前の必須とする。
- **運用モデルは「構築者の1つのCloudflareアカウントに集約＋Workers Paid（月$5、全顧客で1契約）」を推奨**。顧客ごとにWorkerとD1は分け、DBの相乗り（マルチテナント）はしない。
- **設計の一貫性**：ステップ配信・一斉配信・予約配信・再送を、すべて「D1上のキュー行をCronが取り出して送る」1つの仕組みに統一する。Queues・Durable Objects・KVは使わない。
- **やらないこと**：ユーザーテーブルを持つ本格的な権限管理、OAuthログイン、リッチメニュー管理、フォーム/予約/決済連携、分析ダッシュボード、Honoの置き換え、1DBマルチテナント。
- 既存のデモ（sql.js）と `build_line_demo.py` は壊さず、「初期構築SQL」と「稼働中への差分反映SQL」を分けて両立させる。

## 2. 改修項目の一覧と優先度

工数は「構築者1人がClaudeを使いながら実装・検証する」前提の概算。

### 本番投入前に必須

| # | 項目 | なぜ必要か（見守り工数との関係） | 概算 |
|---|---|---|---|
| P1 | 配信キュー化（`deliveries` テーブル）と `takeDueSteps` の全面書き換え | 現状の毎分JOIN＋NOT EXISTSは友だち1,000人×8ステップで1日2,000万行超の読み取りになり無料枠(500万)を確実に超える。2026年9月以降はクエリエラー＝配信停止＝構築者が毎日呼ばれる | 2〜3日 |
| P2 | 送信失敗の再送と冪等性（`X-Line-Retry-Key`、attempts、401での自動停止） | 現状 `step_deliveries` に先に `sent` を書くので失敗分は永久に届かない。「届いてない」調査が保守時間を食う最大要因 | P1と一体で1日 |
| P3 | 管理画面の10秒ポーリング廃止・`/api/stats` の全件集計をカウンタ化・インデックス追加 | `ui/app.html` の `setInterval(refresh, 10000)` が本番で `messages` 全件スキャンを1日8,640回呼ぶ。履歴10万行で1日8億行読み取りになり、P1より先に枠を使い切る | 0.5日 |
| P4 | ヘルスチェック `/health` と外部監視（無料の死活監視サービス）、構築者への通知 | 「止まっていたことに1週間気づかない」を防ぐ。これがないと見守りプランの約束が守れない | 1日 |
| P5 | トークン2種類（構築者／オーナー）とシミュレーターAPIの本番無効化の保証 | オーナーに渡すトークンで `/sim/*`・`/run-scheduled`・シナリオ削除ができる状態は事故のもと | 0.5日 |
| P6 | wrangler環境化と全顧客一括デプロイ・マイグレーションのスクリプト | 顧客ごとに手作業で `wrangler deploy` と `migrations apply` をすると顧客10社で月2時間を超える | 1日 |
| P7 | ステップ・キーワードの編集API（PUT）と管理画面の編集UI | 「削除して追加」は配信進行をリセットする。オーナーが文面を直せないと、文面修正依頼がすべて構築者に来る | API 0.5日＋UI 1日 |
| P8 | 予約配信（`broadcasts` / `broadcast_batches`）とバッチ送信 | 同期の一斉配信は人数が増えるとWorkerの制限で途中で止まり、どこまで送れたか分からなくなる | P1の上に1日＋UI 0.5日 |

### 早めに（本番稼働後1〜2か月以内）

| # | 項目 | なぜ | 概算 |
|---|---|---|---|
| E1 | design.json の **upsertモード**（稼働中アカウントへの差分反映）＋ `resync` ＋ 現在設定のエクスポート | 初期構築SQL（全DELETE）しかないと、納品後の設計変更を手作業SQLでやることになる | 1〜1.5日 |
| E2 | テスト基盤（vitest＋`demo/d1-sqljs.ts` 流用＋fetchスタブ） | 配信ロジックの改修を安心して全顧客に配るため | 1日 |
| E3 | 配信時刻の指定（ステップに `at_time`、例「翌日の10:00」）と配信可能時間帯 | 深夜登録→深夜に「1日後」が届く問題。店舗からの最初のクレームになりやすい。キュー化後なら安い | 0.5日 |
| E4 | テスト送信（自分のLINEに送る）・受信者数プレビュー | オーナーが安心して一斉配信を押せる | 0.5日 |
| E5 | `messages` の保持期間（既定180日）と週1削除、`usage_daily` による読み書き行数の自己計測 | D1 500MB・読み書き枠の「じわじわ増える」リスクを数字で見る | 0.5日 |
| E6 | 友だち一覧の検索とページング（現状 `LIMIT 500` 固定） | 友だち500人超で一覧に出ない人が出る | 0.5日 |

### 後回し（必要になったら）

- Cloudflare Access によるメールOTPログイン（トークン共有をやめたくなったら）
- Webhookイベントの重複排除（`webhookEventId`。LINEの再送を有効にする場合）
- 「Claudeに話しかけて直す」用のMCP／設計JSON経由の編集（E1のAPIがそのまま土台になる）
- 顧客別Cloudflareアカウント方式への切り出し手順（要望が出た顧客向け）

## 3. データモデルの変更

### 3.1 方針

- `step_deliveries`（配信済みの記録）を、**「これから送る予定」も持つ `deliveries`（キュー）** に置き換える。シナリオ登録時に全ステップ分の行を `pending` で先に作っておき、Cronは `status='pending' AND next_at <= now` をインデックスで引くだけにする。
- `enrollments.next_due_at` 方式（1人1ポインタ）は、ステップの追加・順序変更時にポインタの再計算が複雑になり、一斉配信や再送と仕組みを共有できないため採らない。キュー方式なら「ステップ追加＝未来分の行を足す」「時刻変更＝pending行の `due_at` を更新」で済む。
- 一斉配信は `broadcasts`（ジョブ）＋ `broadcast_batches`（500人ずつの束）。multicastは束単位で1リクエスト。

### 3.2 マイグレーション `migrations/0002_queue_and_ops.sql`（追加のみ。削除は次リリース）

```sql
-- ステップ: design.json との対応キー、無効化、時刻指定
ALTER TABLE scenario_steps ADD COLUMN key TEXT;                       -- 例 'welcome.3'（build_line_demo.py が採番）
ALTER TABLE scenario_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE scenario_steps ADD COLUMN at_time TEXT;                   -- '10:00' なら offset 経過後、次のその時刻(JST)に送る
ALTER TABLE scenario_steps ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_steps_key ON scenario_steps (scenario_id, key);
CREATE INDEX idx_steps_scenario ON scenario_steps (scenario_id);

ALTER TABLE keyword_rules ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE keyword_rules ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- 配信キュー（ステップ配信の「予定」と「結果」を1行で持つ）
CREATE TABLE deliveries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  step_id    INTEGER NOT NULL,
  due_at     INTEGER NOT NULL,                 -- 本来の配信時刻
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | sending | sent | skipped | failed | canceled
  attempts   INTEGER NOT NULL DEFAULT 0,
  next_at    INTEGER NOT NULL,                 -- 次に処理してよい時刻（初期値=due_at、失敗時はバックオフ後）
  retry_key  TEXT,                             -- X-Line-Retry-Key。初回送信時に採番し再送でも同じ値を使う
  error      TEXT,
  created_at INTEGER NOT NULL,
  sent_at    INTEGER,
  UNIQUE (user_id, step_id)
);
CREATE INDEX idx_deliveries_due  ON deliveries (status, next_at);   -- Cron がこれだけを読む
CREATE INDEX idx_deliveries_user ON deliveries (user_id, status);   -- reply 相乗り用
CREATE INDEX idx_deliveries_step ON deliveries (step_id, status);   -- 画面の「送信済み n」用

-- 一斉配信・予約配信
CREATE TABLE broadcasts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message      TEXT NOT NULL,
  tag          TEXT, exclude_tag TEXT,
  scheduled_at INTEGER NOT NULL,               -- 即時なら作成時刻
  status       TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | expanding | sending | done | canceled | failed
  cursor       TEXT,                           -- expanding 中の最後の user_id（500人ずつ進める）
  total INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL,                  -- owner | builder
  created_at   INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE broadcast_batches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  user_ids     TEXT NOT NULL,                  -- JSON配列。{name} 入りは1人、それ以外は最大500人
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  next_at      INTEGER NOT NULL,
  retry_key    TEXT, error TEXT
);
CREATE INDEX idx_batches_due ON broadcast_batches (status, next_at);

-- 画面・一斉配信の読み取り削減
CREATE INDEX idx_friend_tags_tag ON friend_tags (tag_id, user_id);
CREATE INDEX idx_friends_status  ON friends (status, followed_at);
CREATE TABLE stats_monthly (ym TEXT NOT NULL, via TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ym, via));

-- 運用: 使用量の自己計測、運用ログ
CREATE TABLE usage_daily (day TEXT PRIMARY KEY, rows_read INTEGER NOT NULL DEFAULT 0, rows_written INTEGER NOT NULL DEFAULT 0, pushes INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ops_log (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
-- settings に追加するキー: last_cron_at, line_token_status(ok|invalid), paused(0|1), app_version,
--   design_version, design_json, test_user_id, delivery_window('09:00-21:00'), message_retention_days('180')

-- 既存データの移行
INSERT INTO deliveries (user_id, step_id, due_at, status, next_at, created_at, sent_at)
  SELECT user_id, step_id, created_at, result, created_at, created_at, created_at FROM step_deliveries;
INSERT OR IGNORE INTO deliveries (user_id, step_id, due_at, status, next_at, created_at)
  SELECT e.user_id, s.id, e.started_at + s.offset_minutes * 60000, 'pending',
         e.started_at + s.offset_minutes * 60000, CAST(strftime('%s','now') AS INTEGER) * 1000
    FROM enrollments e
    JOIN scenario_steps s ON s.scenario_id = e.scenario_id
    JOIN friends f ON f.user_id = e.user_id AND f.status = 'active'
   WHERE e.status = 'active';
-- 移行時点で期限切れの未配信分は送らない（旧コードの added_later ガードで止まっていた分がここに該当する）
UPDATE deliveries SET status = 'skipped', error = 'migrated_past_due'
 WHERE status = 'pending' AND due_at < CAST(strftime('%s','now') AS INTEGER) * 1000 - 600000;
INSERT INTO stats_monthly (ym, via, n)
  SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch', '+9 hours'), via, COUNT(*) FROM messages WHERE direction = 'out' GROUP BY 1, 2;
```

`migrations/0003_drop_step_deliveries.sql`（次のリリースで）: `DROP TABLE step_deliveries;`

### 3.3 マイグレーション手順の原則

1. **追加は先、削除は1リリース遅らせる**。`migrations apply` → `deploy` の間（最大1分）に旧コードのCronやWebhookが走っても壊れないようにする。
2. 順番は「`wrangler d1 migrations apply --remote` → `wrangler deploy` → `/health` 確認」。スクリプト化（6章）。
3. 戻すときは `wrangler rollback`（コードのみ）。テーブルは追加のみなので旧コードはそのまま動く。データ破壊時は D1 Time Travel（無料7日）で `wrangler d1 time-travel restore`。
4. `0001_init.sql` のサンプルデータは今後のマイグレーションには入れない。デモ用サンプルはデモ側（`demo/browser.ts`）で入れる。

## 4. 配信処理の新設計

### 4.1 登録（キューに積む）

`engine.ts` の `startScenario` を拡張。enrollment を作ったら、同じ処理で予定行をまとめて作る（1文のINSERT…SELECT）:

```sql
INSERT OR IGNORE INTO deliveries (user_id, step_id, due_at, status, next_at, created_at)
SELECT ?, s.id, ? + s.offset_minutes * 60000, 'pending', ? + s.offset_minutes * 60000, ?
  FROM scenario_steps s WHERE s.scenario_id = ? AND s.enabled = 1;
```

`at_time` と `delivery_window` の補正（E3）は、この `due_at` を計算するTS側の純関数 `scheduleAt(startedAt, step, window)` で行い、ユニットテストの対象にする（JSTは固定+9時間でよい）。

`unfollow` 時（`handleEvent`）は `UPDATE deliveries SET status='canceled' WHERE user_id=? AND status='pending'` を足す。再フォローで再開するかは未決事項（10章）。

### 4.2 Cronの1回（`runScheduled`、`index.ts` から毎分）

```
runScheduled(env, t = await now(env)):
  if settings.paused == '1' → heartbeat だけ書いて終了
  1. 期限切れロックの解放: UPDATE deliveries SET status='pending' WHERE status='sending' AND next_at < t   （batches も同様）
  2. ステップ配信: SELECT id,user_id,step_id FROM deliveries WHERE status='pending' AND next_at <= t ORDER BY next_at LIMIT 20
       各行: claim → 条件判定 → push → 結果更新（4.3）
  3. 予約配信: scheduled かつ scheduled_at <= t の broadcasts を expanding にし、500人ずつ batches に展開（1回のCronで最大1,000人分）
       pending の batches を最大10件送信
  4. 5分に1回: settings.last_cron_at 更新、usage_daily に meta.rows_read / rows_written を加算
  5. 1日1回(JST 9:00): GET /v2/bot/info でトークン確認、messages の古い行を削除（LIMIT 1000）
```

「同じ人に同時に届くステップを1回のpushにまとめる」現仕様は維持する。2.の結果を `user_id` でまとめ、5吹き出しずつ送る。1回のCronでの送信上限（20件）は無料プランのサブリクエスト上限（50/呼び出し。D1呼び出しが数に含まれるかは**要確認**）に収めるため。Paidなら上限を200に上げる（`env.MAX_SENDS_PER_TICK`）。

### 4.3 二重送信防止と再送（`takeDueSteps` の置き換え）

1. **claim**（先取り）:
   ```sql
   UPDATE deliveries SET status='sending', attempts=attempts+1, retry_key=COALESCE(retry_key, ?), next_at=? + 300000
    WHERE id=? AND status='pending' RETURNING retry_key, attempts;
   ```
   `meta.changes = 0` なら別の実行が取った行なので飛ばす。CronとWebhook（reply相乗り）が同時に走っても1回しか送らない。
2. **条件判定**（require_tag / exclude_tag / 友だちが active か）は送信直前に評価。該当しなければ `skipped`。
3. **送信**: `line.push(env, to, msgs, { retryKey })`。`line.ts` の `call` にヘッダー `X-Line-Retry-Key` を追加し、失敗時は `LineApiError { status, body }` を投げる（今は文字列Errorのみ）。
4. **結果**:
   - 2xx → `sent`, `sent_at`, `messages` にログ、`stats_monthly` を加算
   - 409（同じretry_keyが受理済み）→ `sent` 扱い
   - 401/403 → 行は `pending` に戻し、`settings.line_token_status='invalid'`, `paused='1'`、`ops_log` error、通知（5章）。トークン再設定後に `paused` を戻せば同じ `retry_key` で続きから送れる
   - 400（メッセージ不正・送信先不正）→ `failed`（再送しない）、`ops_log`
   - 429 / 5xx / ネットワーク → `pending` に戻し `next_at = t + backoff(attempts)`（1分, 5分, 30分, 2時間, 6時間）。5回失敗で `failed` + 通知
5. 実行途中でWorkerが落ちた場合は `sending` のまま残るが、4.2の1.で5分後に `pending` に戻り、同じ `retry_key` で再送されるのでLINE側で重複排除される（retry keyの保持期間は**要確認**）。

`handleEvent` の「0分後のステップをreplyに相乗り」は `takeDueSteps(env, t, { userId })` として残す。`idx_deliveries_user` で自分の pending だけ読む。

### 4.4 一斉配信・予約配信（`broadcast` の置き換え）

- `POST /api/broadcasts` はジョブ行を1件作るだけで即返す（同期送信をやめる）。即時配信は `scheduled_at = now`。
- **展開**: `friends.status='active'` をタグ条件で絞り、`user_id > cursor ORDER BY user_id LIMIT 500` で読み、`{name}` を含まなければ500人を1束、含めば1人1束にして `broadcast_batches` に入れる。`cursor` を進め、尽きたら `sending`。
- **送信**: 束ごとに claim → `multicast`（または `push`）with `retry_key` → `sent`。結果ログは `messages` に **1文の多行INSERT** で書く。現状の「1人ずつ `log()`」はD1呼び出しが人数分になるので廃止。
- `{name}` 入りの一斉配信は1人1リクエストなので、無料プランでは毎分20人＝1,000人で50分かかる。画面に「名前入りは時間がかかります」と出す。Paidなら200/分。
- キャンセルは `scheduled` の間だけ可能。

### 4.5 1日の読み書き行数の概算

前提：1シナリオ8ステップ（直後2通）、新規友だちは月15%、受信メッセージは1日あたり友だち数の2%、管理画面を1日20回開く、一斉配信は月4回（最悪日に1回全員へ）。

| 処理 | 1,000人／日 | 5,000人／日 | 内訳の考え方 |
|---|---|---|---|
| Cron（空振り含む1,440回） | 読 3,000 / 書 300 | 同左 | 期限行の範囲検索は0〜1行。ハートビートは5分に1回 |
| 新規登録（5人／25人） | 読 75 / 書 75 | 読 375 / 書 375 | 1人あたり約15行 |
| ステップ配信（30通／150通） | 読 180 / 書 90 | 読 900 / 書 450 | 1通あたり読6／書3 |
| 受信と自動応答（20件／100件） | 読 180 / 書 80 | 読 900 / 書 400 | キーワード表はルール数ぶん読む |
| 管理画面20回 | 読 約70,000 / 書 0 | 読 約150,000 / 書 0 | 友だち一覧＋タグ、件数カウント。ポーリング廃止が前提 |
| 一斉配信（最悪日） | 読 2,000 / 書 1,000 | 読 10,000 / 書 5,000 | 読=友だち＋タグ、書=ログ1人1行 |
| **合計（最悪日）** | **読 約7.6万 / 書 約1,600** | **読 約16.5万 / 書 約6,500** | 無料枠 500万/10万 の 2%未満 / 7%以下 |

現状のコードは1,000人で読み取りが**1日約2,300万行**なので、キュー化で3桁減る。実測は `usage_daily`（D1の `meta.rows_read` を加算）で確認する。

## 5. 見守り（監視と通知）

### 5.1 何を検知するか

| 異常 | 検知方法 | 出どころ |
|---|---|---|
| Cron停止 | `settings.last_cron_at` が10分以上前 | `/health` が 503 を返す |
| トークン無効 | push の 401/403、または毎朝の `GET /v2/bot/info` | 即時 `paused` にして通知、`/health` 503 |
| 配信失敗の滞留 | `failed` が1件以上、または `pending` で `due_at` が30分以上過去 | `/health` 503 |
| D1の枠 | `usage_daily` の rows_read が 400万 / rows_written が 8万 を超えた日 | 通知（警告） |
| 本番なのにDRY_RUN | `DRY_RUN='true'` かつ `LINE_CHANNEL_ACCESS_TOKEN` が設定済み | `/health` 503（デプロイ事故の検知） |
| Webhookの署名不一致が連続 | `verifySignature` 失敗を `ops_log` に記録、1時間に10件超 | 通知（チャネルシークレット違い） |
| 容量 | `wrangler d1 info` を月次スクリプトで実行 | 月次レポート |

### 5.2 どこに通知するか

1. **外からの死活監視（必須・無料の外部サービス）**：`GET https://<worker>/health?k=<HEALTH_KEY>` を UptimeRobot 等（5分間隔）に登録。200なら `ok`、異常なら503で理由をJSONで返す。Cronが死んでもWorkerが死んでも検知できる唯一の層。
2. **Worker自身からの通知（異常の中身を伝える）**：`ALERT_WEBHOOK_URL`（Slack／DiscordのIncoming Webhook）。LINEで受けたい場合は `ALERT_LINE_TOKEN` / `ALERT_LINE_TO`（構築者自身のテスト用公式アカウントへ push）。全顧客で同じ値をデプロイスクリプトが設定する。
3. **外部サービスを使わない最小構成**：構築者アカウントに「見張りWorker」を1つ置き、15分ごとに全顧客の `/health` を叩いて異常なら2.で通知（構築者アカウント自体の停止は検知できない）。
4. 通知の重複防止：`settings.alert_state`（kind→last_sent_at）を持ち、同じ異常は状態が変わるまで再送しない。回復時に「復旧」を1回送る。

### 5.3 `/health` の実装

`app.ts` に Bearer不要のルートを追加（`HEALTH_KEY` のクエリ一致のみ）。返すもの：`version`, `dryRun`, `last_cron_at`, `queue: {pending_overdue, failed}`, `token_status`, `usage_today`。`GET /api/ops`（構築者用、詳細＋`ops_log` 直近100件）と同じ関数で作る。

## 6. 更新の配り方と運用モデル

### 6.1 アカウントをどこに置くか

| 観点 | A. 顧客ごとのCloudflareアカウント | B. 構築者アカウントに集約（推奨） |
|---|---|---|
| データの持ち主 | 顧客名義。契約終了時もそのまま残せる | 構築者が預かる。業務委託契約に個人情報の取扱い（目的・保管・返却/削除）を明記する必要 |
| 責任の所在 | 顧客のアカウント停止・支払い問題は顧客側 | 構築者のアカウント問題が全顧客に波及 |
| 無料枠 | 顧客ごとに5M読/10万書/日 | D1の枠はアカウント単位（要確認）。無料で集約すると全顧客で枠を分け合う＋Cron5本制限で5社まで。**Paid（$5/月、全顧客で1契約）が前提** |
| 保守の手間 | 顧客ごとにAPIトークンを預かり切り替え。顧客にアカウント作成を頼む必要あり | 1回のログイン、1本のループでデプロイ。ダッシュボードも1つ |
| 撤退・引き継ぎ | 顧客が別の業者に頼める | `wrangler d1 export` でSQLを渡し、相手のアカウントで `migrations apply`＋import。Webhook URLの差し替えで完了（手順書を用意） |

**推奨は B**。「月10〜20分」を守れるのはBだけであること、Paidの$5で「2026年9月のエラー化」というリスクが全顧客分まとめて消えること、提案テンプレートの「サーバー代は保守費に含みます」がすでにBを前提にしていること。一方 `skills/line-builder/references/line-rules.md` の「クライアントのデータはクライアント名義のアカウントに置く」はBと矛盾するので、「LINE公式アカウントは必ず店舗名義。Cloudflareは構築者が預かり、契約で定める」に書き換える。Aは「データを自社に置きたい」と明示する顧客向けのオプションとして残す。

### 6.2 1つのコード、顧客ごとの環境

`wrangler.toml` を環境方式にする：

```toml
name = "line-cloudflare"            # 既定環境はローカル開発用（DRY_RUN=true）
[vars]
DRY_RUN = "true"

[env.hidamari]
name = "line-hidamari"
vars = { DRY_RUN = "false", CLIENT = "hidamari" }
[[env.hidamari.d1_databases]]
binding = "DB"
database_name = "line-hidamari"
database_id = "…"
migrations_dir = "migrations"
[env.hidamari.triggers]
crons = ["* * * * *"]
```

- シークレット（`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `ADMIN_TOKEN`, `OWNER_TOKEN`, `HEALTH_KEY`, `ALERT_WEBHOOK_URL`）は `wrangler secret put X --env hidamari`。
- 新規顧客：`scripts/new-client.sh <slug>` が `d1 create` → toml に追記 → シークレット投入 → migrations → deploy → 初期SQL投入 → `/health` 確認。
- 全顧客更新：`scripts/deploy-all.sh` が `npm run typecheck && npm test` のあと `clients.txt` の各slugに対し `d1 migrations apply` → `deploy --env $s` → `curl /health`。ビルド時に `APP_VERSION`（git sha）を埋め、`/health` で各顧客のバージョンが分かるようにする。
- 失敗した顧客だけ `wrangler rollback --env $s`。

### 6.3 やらないこと

Workers for Platforms、マルチテナント単一Worker、CI/CDの自動本番デプロイ。

## 7. 権限

### 7.1 2つのトークン

認証ミドルウェアを、`ADMIN_TOKEN`（構築者）と `OWNER_TOKEN`（店長）のどちらかに一致したら `role = builder | owner` にする。比較は `timingSafeEqual`（`line.ts` の関数を共通化）。

| 操作 | owner | builder |
|---|---|---|
| 友だち一覧・履歴・タグ付け外し・個別送信 | ○ | ○ |
| ステップの文面・時刻・条件の編集、追加、無効化 | ○ | ○ |
| キーワードの編集・追加・無効化 | ○ | ○ |
| 一斉配信・予約配信の作成・取消、テスト送信 | ○ | ○ |
| シナリオの作成・削除、ステップの物理削除、タグの削除 | × | ○ |
| `/run-scheduled`, `/sim/*`, `/api/admin/*`（resync・design・pause・export） | × | ○ |
| `/api/ops`（運用ログ・使用量） | 閲覧のみ | ○ |

`GET /api/me` で `{ role, dryRun, version }` を返し、画面は role で項目を出し分ける。トークンは32文字以上のランダム文字列。画面に「ログアウト」ボタンを足す。

### 7.2 シミュレーターを本番で確実に無効にする

- 現状の `DRY_RUN` による403は維持しつつ、**builder ロールのみ**に限定（二重ガード）。
- `wrangler.toml` の既定環境だけ `DRY_RUN=true`、各 `[env.*]` は明示的に `"false"`。`deploy-all.sh` は `--env` なしの deploy を拒否する。
- `/health` が「DRY_RUN=true かつ本番トークンあり」を異常として返す。
- 時計ずらし（`settings.clock_offset`）は DRY_RUN でなければ `now()` が無視する（既にそうなっている）。

## 8. オーナーが自分で更新する仕組み

### 8.1 管理画面で編集できる範囲

- **ステップ編集** `PUT /api/steps/:id`（message, offset_minutes, at_time, require_tag, exclude_tag, enabled）。保存後に `resyncStep(stepId)`：
  - 時刻変更 → pending の `due_at`/`next_at` を再計算
  - 無効化 → pending を `canceled`
  - 再有効化／追加 → active な enrollment に対し **due が未来のものだけ** 作る（過去分は作らない）
  - 本文の変更は送信時に読むので何もしない
  - 「削除」はオーナーには「停止（無効化）」として見せる
- **キーワード編集** `PUT /api/keywords/:id`。`applyKeyword` は `enabled=1` だけを読む。
- **予約配信** `POST /api/broadcasts`（`scheduled_at` は `datetime-local` から変換）、一覧、取消。
- **プレビュー／テスト送信**：受信者数の表示、`settings.test_user_id` へのテスト送信。ボタン付きメッセージは、オーナー画面では本文だけ編集可能。
- **やらない範囲**：シナリオの追加・トリガー変更、タグの改名・削除、分岐の設計変更、JSONメッセージの直接編集、設定。これらは構築者が design.json 経由で行う。

### 8.2 design.json と本番データの差分反映（E1）

`build_line_demo.py` に `--mode init|upsert` を足す。

- **キーの導入**：各ステップに `key`（なければ `"<scenario名のslug>.<連番>"` を採番して design.json に書き戻す）。キーワードは `keyword`、シナリオは `name` がキー。
- **init**（現状どおり。デモと新規構築用）：DELETE対象に `deliveries`, `broadcasts`, `broadcast_batches` を追加。
- **upsert**（稼働中向け）：`ON CONFLICT … DO UPDATE` で更新、design.json に無いステップは `enabled=0`。enrollments / deliveries には触れない。`design_version` と `design_json` を settings に保存。
- **適用手順**：upsert SQL を実行 → `POST /api/admin/resync` → `/health`。
- **逆方向**：`GET /api/admin/design` が現在のDBを design.json の形で返す。構築者は設計変更の前に必ずこれを取り込む（オーナーが画面で直した文面を上書きしないため）。
- 将来の「Claudeに話しかけて直す」は、このエクスポート→編集→upsert の経路をそのまま使う。

## 9. テスト方針

- **時刻の注入**：`engine.ts` の公開関数に `t?: number` を足し、省略時のみ `now(env)`。`scheduleAt` と `backoff` は純関数にする。
- **DBはsql.jsをNodeで**：`demo/d1-sqljs.ts` の `createD1` をテスト用DBに流用（`meta.rows_read` は 0）。マイグレーションSQLを順に実行して起動。
- **LINE APIのスタブ**：`vi.stubGlobal('fetch', …)` で 200 / 401 / 429 / 500 / 409 を返し、再送・停止・冪等を検証。
- **必須のケース**：登録→直後2通がreplyで出る／1日後の行がCronで1回だけ送られる／CronとWebhookの同時claimで二重送信しない／401で `paused` になり再開後に同じ `retry_key` で送られる／ステップ時刻変更で pending の `due_at` が変わる／ステップ追加で過去分が作られない／一斉配信5,000人が500人×10束になり、失敗した束だけ再送される／upsert SQL を2回流しても結果が同じ。
- **デモ互換**：`scripts/build.mjs` で `migrations/*.sql` を連結した schema を生成してデモに読ませる。`/sim/advance` は「期限分が尽きるまで最大20周」回す。`npm test` にデモ起動のスモークを含める。

## 10. リスクと未確定事項

**要確認（実装前に公式ドキュメントで確認）**
- `X-Line-Retry-Key` の保持期間と、同一キー再送時の応答（409か200か）。push / multicast 両方で使えるか。
- Workers無料プランの「サブリクエスト50/回」にD1呼び出しが含まれるか。
- D1無料枠がアカウント単位かDB単位か。Paidの同梱量。
- Cron Triggers の上限（無料5／Paid250、アカウント単位）。
- Workers の `send_email` の制約。
- 無料の死活監視サービスの最短間隔とキーワード監視の可否。
- ブロック中ユーザーへの push の応答コード。
- 2026年9月のD1超過時の挙動。

**事業者に判断を仰ぐ点**
1. 運用モデル：推奨B（集約＋Paid $5/月）で進めてよいか。契約書に個人情報の預かりと返却手順を入れる前提。
2. 通知先：Slack/Discord Webhook か、構築者のLINEか、メールか。
3. 配信可能時間帯の既定（例 9:00〜21:00）と、「1日後」を翌日の固定時刻に寄せるか。
4. トーク履歴の保持期間（既定180日）。
5. 移行時点で期限切れの未配信ステップは送らない、でよいか。
6. ブロック→再フォローでシナリオを最初からやり直すか（現状はやり直さない）。
7. オーナーにステップの時刻・条件まで編集させるか、文面だけにするか。
8. 名前入り `{name}` の一斉配信を許すか（無料プランでは遅い）。

**設計上のリスク**
- 管理画面の読み取りは友だち数に比例するので、5,000人規模では「一覧は検索前提」（E6）にしないと枠を消費する。
- 1つのCronで処理しきれない量は時間をかけて消化する設計。即時性を求める顧客には事前に説明する。
- 集約モデルでは構築者アカウントの支払い失敗が全顧客に波及する。支払い方法の冗長化と、年1回の引き継ぎ手順の確認を運用ルールにする。
