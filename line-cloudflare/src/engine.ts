// Lステップ的な振る舞いの本体：友だち管理・タグ・ステップ配信・キーワード応答・一斉配信
import type { Env } from './env';
import * as line from './line';
import type { LineMessage } from './line';
import { DEFAULT_WINDOW, MAX_ATTEMPTS, backoff, jstMonth, parseWindow, scheduleAt, type Window } from './schedule';

// ---------- 時計（DRY_RUN 中だけ早送りできる） ----------
export async function now(env: Env) {
  if (!line.isDryRun(env)) return Date.now();
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'clock_offset'`).first<{ value: string }>();
  return Date.now() + Number(row?.value ?? 0);
}

export async function advanceClock(env: Env, minutes: number) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('clock_offset', ?)
     ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + excluded.value`,
  ).bind(String(minutes * 60_000)).run();
}

// ---------- 設定 ----------
export async function getSetting(env: Env, key: string) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(env: Env, key: string, value: string) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(key, value).run();
}

async function opsLog(env: Env, level: 'info' | 'warn' | 'error', kind: string, detail: string, t: number) {
  await env.DB.prepare(`INSERT INTO ops_log (level, kind, detail, created_at) VALUES (?, ?, ?, ?)`)
    .bind(level, kind, detail.slice(0, 1000), t).run();
}

// ---------- メッセージ ----------
// 保存形式：プレーンテキスト、または LINE のメッセージオブジェクト JSON。{name} は表示名に置換
export function render(raw: string, name: string | null): LineMessage {
  const isJson = raw.trimStart().startsWith('{');
  const n = name || 'あなた';
  const text = raw.replaceAll('{name}', isJson ? JSON.stringify(n).slice(1, -1) : n);
  if (isJson) {
    try { return JSON.parse(text); } catch { /* テキストとして扱う */ }
  }
  return { type: 'text', text };
}

async function log(env: Env, userId: string, direction: 'in' | 'out', via: string, bodies: unknown[]) {
  if (!bodies.length) return;
  const t = await now(env);
  const stmts = bodies.map((b) =>
    env.DB.prepare(`INSERT INTO messages (user_id, direction, via, body, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(userId, direction, via, JSON.stringify(b), t),
  );
  // 送った数は月ごとに数えておく（管理画面で messages を全件集計しないため）。1回の送信＝1通
  if (direction === 'out') {
    stmts.push(env.DB.prepare(
      `INSERT INTO stats_monthly (ym, via, n) VALUES (?, ?, 1) ON CONFLICT(ym, via) DO UPDATE SET n = n + 1`,
    ).bind(jstMonth(t), via));
  }
  await env.DB.batch(stmts);
}

async function friendName(env: Env, userId: string) {
  const row = await env.DB.prepare(`SELECT display_name FROM friends WHERE user_id = ?`).bind(userId).first<{ display_name: string | null }>();
  return row?.display_name ?? null;
}

// ---------- タグ ----------
export async function addTag(env: Env, userId: string, name: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(name).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO friend_tags (user_id, tag_id, created_at) SELECT ?, id, ? FROM tags WHERE name = ?`,
  ).bind(userId, await now(env), name).run();
}

export async function removeTag(env: Env, userId: string, name: string) {
  await env.DB.prepare(
    `DELETE FROM friend_tags WHERE user_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)`,
  ).bind(userId, name).run();
}

// ---------- ステップ配信 ----------
// 登録した時点で、全ステップ分の「配信予定」を deliveries に積んでおく。
// Cron は「時間が来た予定」だけを読むので、友だちが増えても読み取り量はほぼ増えない

type StepTiming = { id: number; offset_minutes: number; at_time: string | null };

async function deliveryWindow(env: Env) {
  return parseWindow((await getSetting(env, 'delivery_window')) ?? DEFAULT_WINDOW);
}

// 予定を積む INSERT 文を作る（実行は呼び出し側で batch にまとめる）
function enqueueStatements(env: Env, userId: string, startedAt: number, steps: StepTiming[], t: number, window: Window | null, onlyFuture: boolean) {
  return steps
    .map((s) => ({ stepId: s.id, due: scheduleAt(startedAt, s, window) }))
    .filter((r) => !onlyFuture || r.due > t)
    .map((r) => env.DB.prepare(
      `INSERT OR IGNORE INTO deliveries (user_id, step_id, due_at, status, next_at, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).bind(userId, r.stepId, r.due, r.due, t));
}

async function runInChunks(env: Env, stmts: D1PreparedStatement[], size = 200) {
  for (let i = 0; i < stmts.length; i += size) await env.DB.batch(stmts.slice(i, i + size));
}

export async function startScenario(env: Env, userId: string, scenario: { id?: number; name?: string }, t?: number) {
  t ??= await now(env);
  const sc = await env.DB.prepare(`SELECT id FROM scenarios WHERE id = ? OR name = ? LIMIT 1`)
    .bind(scenario.id ?? -1, scenario.name ?? '').first<{ id: number }>();
  if (!sc) return;
  const res = await env.DB.prepare(`INSERT OR IGNORE INTO enrollments (user_id, scenario_id, started_at) VALUES (?, ?, ?)`)
    .bind(userId, sc.id, t).run();
  if (!res.meta.changes) return; // すでに登録済み（再フォローではやり直さない）
  const { results } = await env.DB.prepare(
    `SELECT id, offset_minutes, at_time FROM scenario_steps WHERE scenario_id = ? AND enabled = 1`,
  ).bind(sc.id).all<StepTiming>();
  await runInChunks(env, enqueueStatements(env, userId, t, results, t, await deliveryWindow(env), false));
}

// ステップを追加・再開したとき、登録済みの人に「これから届く分」だけ予定を足す（過去の分は送らない）
export async function enqueueStepForEnrolled(env: Env, stepId: number) {
  const t = await now(env);
  const step = await env.DB.prepare(`SELECT id, scenario_id, offset_minutes, at_time FROM scenario_steps WHERE id = ? AND enabled = 1`)
    .bind(stepId).first<StepTiming & { scenario_id: number }>();
  if (!step) return;
  const { results } = await env.DB.prepare(
    `SELECT e.user_id, e.started_at FROM enrollments e JOIN friends f ON f.user_id = e.user_id AND f.status = 'active'
      WHERE e.scenario_id = ? AND e.status = 'active'`,
  ).bind(step.scenario_id).all<{ user_id: string; started_at: number }>();
  const window = await deliveryWindow(env);
  await runInChunks(env, results.flatMap((e) => enqueueStatements(env, e.user_id, e.started_at, [step], t, window, true)));
}

export async function cancelStep(env: Env, stepId: number) {
  await env.DB.prepare(`UPDATE deliveries SET status = 'canceled' WHERE step_id = ? AND status = 'pending'`).bind(stepId).run();
}

type Claimed = { id: number; user_id: string; retry_key: string | null; attempts: number; msg: LineMessage };

type DueRow = {
  id: number; user_id: string; retry_key: string | null; attempts: number; message: string;
  require_tag: string | null; exclude_tag: string | null; enabled: number; display_name: string | null; friend_status: string | null;
};

const DUE_SELECT = `SELECT d.id, d.user_id, d.retry_key, d.attempts, s.message, s.require_tag, s.exclude_tag, s.enabled,
                           f.display_name, f.status AS friend_status
                      FROM deliveries d
                      JOIN scenario_steps s ON s.id = d.step_id
                      LEFT JOIN friends f ON f.user_id = d.user_id`;

const marks = (n: number) => Array(n).fill('?').join(',');

// 時間が来た予定を取り出し、「送信中」に切り替えて（claim）返す。
// claim は status = 'pending' の行だけを1文で更新するので、Cron と Webhook が同時に走っても同じ予定は1回しか取れない。
// 条件（タグ）に合わない予定は skipped、ブロック中の人や停止したステップは canceled にする。
// D1 の呼び出し回数を抑えるため、更新はまとめて行う
async function takeDueSteps(env: Env, t: number, opts: { userId?: string; limit: number }) {
  // 返信に相乗りさせるのは、まだ一度もプッシュしていない予定だけ（再送待ちの分は、二重に届かないようプッシュで送る）
  const due = opts.userId
    ? env.DB.prepare(`${DUE_SELECT} WHERE d.user_id = ? AND d.status = 'pending' AND d.next_at <= ? AND d.retry_key IS NULL ORDER BY d.next_at, d.id LIMIT ?`)
      .bind(opts.userId, t, opts.limit)
    : env.DB.prepare(`${DUE_SELECT} WHERE d.status = 'pending' AND d.next_at <= ? ORDER BY d.next_at, d.id LIMIT ?`).bind(t, opts.limit);
  let rows = (await due.all<DueRow>()).results;

  // 再送は前回と同じ組み合わせで送る必要があるので、LIMIT で途中が切れた組の残りも取る
  const keys = [...new Set(rows.map((r) => r.retry_key).filter((k): k is string => !!k))];
  if (keys.length) {
    const seen = new Set(rows.map((r) => r.id));
    const { results } = await env.DB.prepare(`${DUE_SELECT} WHERE d.status = 'pending' AND d.retry_key IN (${marks(keys.length)})`)
      .bind(...keys).all<DueRow>();
    rows = [...rows, ...results.filter((r) => !seen.has(r.id))];
  }
  if (!rows.length) return [];

  const users = [...new Set(rows.map((r) => r.user_id))];
  const { results: tagRows } = await env.DB.prepare(
    `SELECT ft.user_id, t.name FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.user_id IN (${marks(users.length)})`,
  ).bind(...users).all<{ user_id: string; name: string }>();
  const tags = new Map<string, Set<string>>();
  for (const r of tagRows) tags.set(r.user_id, (tags.get(r.user_id) ?? new Set()).add(r.name));

  const cancel: DueRow[] = [];
  const skip: DueRow[] = [];
  const take: DueRow[] = [];
  for (const r of rows) {
    const has = tags.get(r.user_id) ?? new Set<string>();
    if (!r.enabled || r.friend_status !== 'active') cancel.push(r);
    else if ((r.require_tag && !has.has(r.require_tag)) || (r.exclude_tag && has.has(r.exclude_tag))) skip.push(r);
    else take.push(r);
  }
  const updates: D1PreparedStatement[] = [];
  if (cancel.length) updates.push(env.DB.prepare(`UPDATE deliveries SET status = 'canceled' WHERE id IN (${ids(cancel)}) AND status = 'pending'`));
  if (skip.length) updates.push(env.DB.prepare(`UPDATE deliveries SET status = 'skipped', sent_at = ? WHERE id IN (${ids(skip)}) AND status = 'pending'`).bind(t));
  if (updates.length) await env.DB.batch(updates);
  if (!take.length) return [];

  // 5分たっても結果が書かれなければ（途中で落ちたら）、Cron がもう一度 pending に戻す
  const { results: got } = await env.DB.prepare(
    `UPDATE deliveries SET status = 'sending', attempts = attempts + 1, next_at = ? WHERE id IN (${ids(take)}) AND status = 'pending' RETURNING id`,
  ).bind(t + 5 * 60_000).all<{ id: number }>();
  const claimedIds = new Set(got.map((g) => g.id));
  return take.filter((r) => claimedIds.has(r.id)).map((r): Claimed => ({
    id: r.id, user_id: r.user_id, retry_key: r.retry_key, attempts: r.attempts + 1, msg: render(r.message, r.display_name),
  }));
}

const ids = (rows: { id: number }[]) => rows.map((r) => r.id).join(',');

// 再送キー（UUID）。ブラウザのデモが https でないページで動く場合に備えて getRandomValues で作る
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function releaseToPending(env: Env, rows: Claimed[], nextAt: number, error: string | null = null) {
  if (!rows.length) return;
  await env.DB.prepare(`UPDATE deliveries SET status = 'pending', next_at = ?, error = ? WHERE id IN (${ids(rows)})`)
    .bind(nextAt, error).run();
}

async function markSent(env: Env, rows: Claimed[], via: 'reply' | 'push', t: number) {
  await env.DB.prepare(`UPDATE deliveries SET status = 'sent', sent_at = ?, error = NULL WHERE id IN (${ids(rows)})`).bind(t).run();
  await log(env, rows[0].user_id, 'out', via, rows.map((r) => r.msg));
}

// 同じ人宛ては1回のプッシュにまとめる（通数は「1リクエスト×1人」で数えられる）。
// 再送するときは前回と同じ組み合わせ・同じ再送キーで送る（LINE は同じキーの2回目を 409 で弾く）
async function groupForPush(env: Env, claimed: Claimed[]) {
  const groups: { userId: string; key: string; rows: Claimed[] }[] = [];
  const byKey = new Map<string, Claimed[]>();
  const fresh = new Map<string, Claimed[]>();
  for (const c of claimed) {
    if (c.retry_key) byKey.set(c.retry_key, [...(byKey.get(c.retry_key) ?? []), c]);
    else fresh.set(c.user_id, [...(fresh.get(c.user_id) ?? []), c]);
  }
  for (const [key, rows] of byKey) groups.push({ userId: rows[0].user_id, key, rows });
  for (const [userId, rows] of fresh) {
    for (let i = 0; i < rows.length; i += 5) {
      const chunk = rows.slice(i, i + 5);
      const key = uuid();
      await env.DB.prepare(`UPDATE deliveries SET retry_key = ? WHERE id IN (${ids(chunk)})`).bind(key).run();
      groups.push({ userId, key, rows: chunk });
    }
  }
  return groups;
}

// 1回分のプッシュを送り、結果に応じて予定を更新する。'paused' はトークン無効で配信を止めたとき
async function sendGroup(env: Env, g: { userId: string; key: string; rows: Claimed[] }, t: number): Promise<'sent' | 'retry' | 'failed' | 'paused'> {
  try {
    await line.push(env, g.userId, g.rows.map((r) => r.msg), { retryKey: g.key });
    await markSent(env, g.rows, 'push', t);
    return 'sent';
  } catch (e) {
    const status = e instanceof line.LineApiError ? e.status : 0;
    const detail = `${g.userId} ${String(e)}`;
    if (status === 409) {
      // 前回の送信が実は受理されていた
      await markSent(env, g.rows, 'push', t);
      return 'sent';
    }
    if (status === 401 || status === 403) {
      // トークンが無効。予定はそのままにして配信を止め、トークンを直したら同じ再送キーで続きから送る
      await releaseToPending(env, g.rows, t, `HTTP ${status}`);
      await setSetting(env, 'paused', '1');
      await setSetting(env, 'line_token_status', 'invalid');
      await opsLog(env, 'error', 'token_invalid', detail, t);
      return 'paused';
    }
    if (status === 400 || g.rows[0].attempts >= MAX_ATTEMPTS) {
      await env.DB.prepare(`UPDATE deliveries SET status = 'failed', error = ? WHERE id IN (${ids(g.rows)})`).bind(detail.slice(0, 500)).run();
      await opsLog(env, 'error', 'delivery_failed', detail, t);
      return 'failed';
    }
    await releaseToPending(env, g.rows, t + backoff(g.rows[0].attempts), detail.slice(0, 500));
    await opsLog(env, 'warn', 'delivery_retry', detail, t);
    return 'retry';
  }
}

// Cron Trigger から毎分呼ばれる
export async function runScheduled(env: Env) {
  const t = await now(env);
  await setSetting(env, 'last_cron_at', String(t));
  if ((await getSetting(env, 'paused')) === '1') return { users: 0, pushes: 0, processed: 0, paused: true };

  // 途中で落ちて「送信中」のまま残った予定を戻す
  await env.DB.prepare(`UPDATE deliveries SET status = 'pending' WHERE status = 'sending' AND next_at < ?`).bind(t).run();

  const limit = Number(env.MAX_SENDS_PER_TICK ?? 10);
  const claimed = await takeDueSteps(env, t, { limit });
  const groups = await groupForPush(env, claimed);
  let pushes = 0;
  for (let i = 0; i < groups.length; i++) {
    const result = await sendGroup(env, groups[i], t);
    if (result === 'sent') pushes++;
    if (result === 'paused') {
      // 残りは送らずに予定へ戻す
      await releaseToPending(env, groups.slice(i + 1).flatMap((g) => g.rows), t);
      return { users: new Set(groups.map((g) => g.userId)).size, pushes, processed: claimed.length, paused: true };
    }
  }
  return { users: new Set(groups.map((g) => g.userId)).size, pushes, processed: claimed.length, paused: false };
}

// 配信を再開する（トークンを直したあと）
export async function resume(env: Env) {
  await setSetting(env, 'paused', '0');
  await setSetting(env, 'line_token_status', 'ok');
  await opsLog(env, 'info', 'resumed', '', await now(env));
}

// ---------- 受信イベント ----------
type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string; displayText?: string };
};

export async function handleEvent(env: Env, ev: LineEvent, hint: { displayName?: string } = {}) {
  const userId = ev.source?.userId;
  if (!userId) return;
  const t = await now(env);
  const replies: LineMessage[] = [];

  if (ev.type === 'follow') {
    const profile = { ...(await line.getProfile(env, userId)), ...hint };
    await env.DB.prepare(
      `INSERT INTO friends (user_id, display_name, status, followed_at, updated_at) VALUES (?, ?, 'active', ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET status = 'active', display_name = COALESCE(excluded.display_name, display_name), updated_at = excluded.updated_at`,
    ).bind(userId, profile.displayName ?? null, t, t).run();
    await log(env, userId, 'in', 'follow', [{ type: 'follow' }]);
    const { results } = await env.DB.prepare(`SELECT id FROM scenarios WHERE trigger = 'follow'`).all<{ id: number }>();
    for (const s of results) await startScenario(env, userId, { id: s.id }, t);
  } else if (ev.type === 'unfollow') {
    await env.DB.prepare(`UPDATE friends SET status = 'blocked', updated_at = ? WHERE user_id = ?`).bind(t, userId).run();
    await env.DB.prepare(`UPDATE deliveries SET status = 'canceled' WHERE user_id = ? AND status = 'pending'`).bind(userId).run();
    await log(env, userId, 'in', 'unfollow', [{ type: 'unfollow' }]);
    return;
  } else if (ev.type === 'message') {
    await ensureFriend(env, userId, t);
    await log(env, userId, 'in', 'message', [ev.message ?? {}]);
    const text = ev.message?.type === 'text' ? ev.message.text ?? '' : '';
    if (text) replies.push(...(await applyKeyword(env, userId, text, t)));
  } else if (ev.type === 'postback') {
    await ensureFriend(env, userId, t);
    const p = new URLSearchParams(ev.postback?.data ?? '');
    await log(env, userId, 'in', 'postback', [{ type: 'postback', ...ev.postback }]);
    if (p.get('tag')) await addTag(env, userId, p.get('tag')!);
    if (p.get('untag')) await removeTag(env, userId, p.get('untag')!);
    if (p.get('scenario')) await startScenario(env, userId, { name: p.get('scenario')! }, t);
    if (p.get('reply')) replies.push(render(p.get('reply')!, await friendName(env, userId)));
  } else {
    return;
  }

  // 時間が来ているステップ（友だち追加直後の分など）は reply に相乗りさせて無料で送る
  const steps = await takeDueSteps(env, t, { userId, limit: 10 });
  const room = Math.max(0, 5 - replies.length);
  const riding = ev.replyToken ? steps.slice(0, room) : [];
  // 返信に入りきらない分は予定に戻し、次の Cron でプッシュする
  await releaseToPending(env, steps.slice(riding.length), t);
  const messages = [...replies, ...riding.map((r) => r.msg)].slice(0, 5);
  if (!messages.length || !ev.replyToken) return;
  try {
    await line.reply(env, ev.replyToken, messages);
  } catch (e) {
    // 返信できなかったステップは Cron がプッシュで送り直す
    await releaseToPending(env, riding, t, String(e).slice(0, 500));
    throw e;
  }
  if (riding.length) await env.DB.prepare(`UPDATE deliveries SET status = 'sent', sent_at = ? WHERE id IN (${ids(riding)})`).bind(t).run();
  await log(env, userId, 'out', 'reply', messages);
}

async function ensureFriend(env: Env, userId: string, t: number) {
  // フォロー前から存在する友だち（ツール導入前の既存友だち）も受信時に取り込む
  const exists = await env.DB.prepare(`SELECT 1 FROM friends WHERE user_id = ?`).bind(userId).first();
  if (exists) return;
  const profile = await line.getProfile(env, userId);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO friends (user_id, display_name, status, followed_at, updated_at) VALUES (?, ?, 'active', ?, ?)`,
  ).bind(userId, profile.displayName ?? null, t, t).run();
}

type KeywordRule = { keyword: string; match_type: string; reply: string | null; add_tag: string | null; start_scenario: string | null };

async function applyKeyword(env: Env, userId: string, text: string, t: number) {
  const { results } = await env.DB.prepare(`SELECT * FROM keyword_rules WHERE enabled = 1 ORDER BY id`).all<KeywordRule>();
  const rule = results.find((r) => (r.match_type === 'exact' ? text.trim() === r.keyword : text.includes(r.keyword)));
  if (!rule) return [];
  if (rule.add_tag) await addTag(env, userId, rule.add_tag);
  if (rule.start_scenario) await startScenario(env, userId, { name: rule.start_scenario }, t);
  return rule.reply ? [render(rule.reply, await friendName(env, userId))] : [];
}

// ---------- 個別送信・一斉配信 ----------
export async function pushTo(env: Env, userId: string, raw: string) {
  const msg = render(raw, await friendName(env, userId));
  await line.push(env, userId, [msg]);
  await log(env, userId, 'out', 'push', [msg]);
}

// tag を指定するとそのタグを持つ人だけに送る（セグメント配信）
export async function broadcast(env: Env, raw: string, tag?: string, excludeTag?: string) {
  const { results } = await env.DB.prepare(
    `SELECT f.user_id, f.display_name FROM friends f
      WHERE f.status = 'active'
        AND (? IS NULL OR EXISTS (SELECT 1 FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.user_id = f.user_id AND t.name = ?))
        AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.user_id = f.user_id AND t.name = ?))`,
  ).bind(tag || null, tag || null, excludeTag || null, excludeTag || null).all<{ user_id: string; display_name: string | null }>();

  if (raw.includes('{name}')) {
    // 名前差し込みは1人ずつ内容が違うので push
    for (const f of results) {
      const msg = render(raw, f.display_name);
      await line.push(env, f.user_id, [msg]);
      await log(env, f.user_id, 'out', 'push', [msg]);
    }
  } else {
    const msg = render(raw, null);
    for (let i = 0; i < results.length; i += 500) {
      const to = results.slice(i, i + 500).map((f) => f.user_id);
      await line.multicast(env, to, [msg]);
      for (const id of to) await log(env, id, 'out', 'multicast', [msg]);
    }
  }
  return { recipients: results.length };
}
