// Lステップ的な振る舞いの本体：友だち管理・タグ・ステップ配信・キーワード応答・一斉配信
import type { Env } from './env';
import * as line from './line';
import type { LineMessage } from './line';

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
  await env.DB.batch(bodies.map((b) =>
    env.DB.prepare(`INSERT INTO messages (user_id, direction, via, body, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(userId, direction, via, JSON.stringify(b), t),
  ));
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

async function tagsOf(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    `SELECT t.name FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.user_id = ?`,
  ).bind(userId).all<{ name: string }>();
  return new Set(results.map((r) => r.name));
}

// ---------- ステップ配信 ----------
export async function startScenario(env: Env, userId: string, scenario: { id?: number; name?: string }) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO enrollments (user_id, scenario_id, started_at)
     SELECT ?, id, ? FROM scenarios WHERE id = ? OR name = ?`,
  ).bind(userId, await now(env), scenario.id ?? -1, scenario.name ?? '').run();
}

type DueStep = { user_id: string; step_id: number; message: string; require_tag: string | null; exclude_tag: string | null; display_name: string | null };

// 時間が来たステップを取り出して「配信済み」にし、送るメッセージを返す。
// 条件（タグ）に合わないステップは skipped として記録するだけ
async function takeDueSteps(env: Env, userId?: string) {
  const t = await now(env);
  const { results } = await env.DB.prepare(
    `SELECT e.user_id, s.id AS step_id, s.message, s.require_tag, s.exclude_tag, f.display_name,
            (e.started_at + s.offset_minutes * 60000) < (s.created_at - 600000) AS added_later
       FROM enrollments e
       JOIN scenario_steps s ON s.scenario_id = e.scenario_id
       JOIN friends f ON f.user_id = e.user_id AND f.status = 'active'
      WHERE e.status = 'active'
        AND e.started_at + s.offset_minutes * 60000 <= ?
        AND (? IS NULL OR e.user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM step_deliveries d WHERE d.user_id = e.user_id AND d.step_id = s.id)
      ORDER BY e.user_id, s.offset_minutes, s.id
      LIMIT 500`,
  ).bind(t, userId ?? null, userId ?? null).all<DueStep & { added_later: number }>();

  const byUser = new Map<string, LineMessage[]>();
  const tagCache = new Map<string, Set<string>>();
  for (const s of results) {
    if (!tagCache.has(s.user_id)) tagCache.set(s.user_id, await tagsOf(env, s.user_id));
    const tags = tagCache.get(s.user_id)!;
    // 後から追加したステップを、過去に登録した人へ一気に送らないためのガード
    const ok = !s.added_later
      && (!s.require_tag || tags.has(s.require_tag))
      && (!s.exclude_tag || !tags.has(s.exclude_tag));
    // 先に「配信済み」を確保してから送る（Cron と Webhook が同時に走っても二重送信しない）
    const claim = await env.DB.prepare(
      `INSERT OR IGNORE INTO step_deliveries (user_id, step_id, result, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(s.user_id, s.step_id, ok ? 'sent' : 'skipped', t).run();
    if (!ok || !claim.meta.changes) continue;
    const list = byUser.get(s.user_id) ?? [];
    list.push(render(s.message, s.display_name));
    byUser.set(s.user_id, list);
  }
  return byUser;
}

// Cron Trigger から毎分呼ばれる。同じ人宛ては1回のプッシュにまとめる（通数は「1リクエスト×1人」で数えられる）
export async function runScheduled(env: Env) {
  const due = await takeDueSteps(env);
  let sent = 0;
  for (const [userId, msgs] of due) {
    for (let i = 0; i < msgs.length; i += 5) {
      const chunk = msgs.slice(i, i + 5);
      try {
        await line.push(env, userId, chunk);
        await log(env, userId, 'out', 'push', chunk);
        sent++;
      } catch (e) {
        console.error('push failed', userId, e);
      }
    }
  }
  return { users: due.size, pushes: sent };
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
    for (const s of results) await startScenario(env, userId, { id: s.id });
  } else if (ev.type === 'unfollow') {
    await env.DB.prepare(`UPDATE friends SET status = 'blocked', updated_at = ? WHERE user_id = ?`).bind(t, userId).run();
    await log(env, userId, 'in', 'unfollow', [{ type: 'unfollow' }]);
    return;
  } else if (ev.type === 'message') {
    await ensureFriend(env, userId, t);
    await log(env, userId, 'in', 'message', [ev.message ?? {}]);
    const text = ev.message?.type === 'text' ? ev.message.text ?? '' : '';
    if (text) replies.push(...(await applyKeyword(env, userId, text)));
  } else if (ev.type === 'postback') {
    await ensureFriend(env, userId, t);
    const p = new URLSearchParams(ev.postback?.data ?? '');
    await log(env, userId, 'in', 'postback', [{ type: 'postback', ...ev.postback }]);
    if (p.get('tag')) await addTag(env, userId, p.get('tag')!);
    if (p.get('untag')) await removeTag(env, userId, p.get('untag')!);
    if (p.get('scenario')) await startScenario(env, userId, { name: p.get('scenario')! });
    if (p.get('reply')) replies.push(render(p.get('reply')!, await friendName(env, userId)));
  } else {
    return;
  }

  // 即時（0分後）のステップは reply に相乗りさせて無料で送る
  replies.push(...((await takeDueSteps(env, userId)).get(userId) ?? []));
  if (!replies.length) return;
  const first = replies.slice(0, 5);
  if (ev.replyToken) {
    await line.reply(env, ev.replyToken, first);
    await log(env, userId, 'out', 'reply', first);
  } else {
    await line.push(env, userId, first);
    await log(env, userId, 'out', 'push', first);
  }
  if (replies.length > 5) {
    const rest = replies.slice(5, 10);
    await line.push(env, userId, rest);
    await log(env, userId, 'out', 'push', rest);
  }
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

async function applyKeyword(env: Env, userId: string, text: string) {
  const { results } = await env.DB.prepare(`SELECT * FROM keyword_rules ORDER BY id`).all<KeywordRule>();
  const rule = results.find((r) => (r.match_type === 'exact' ? text.trim() === r.keyword : text.includes(r.keyword)));
  if (!rule) return [];
  if (rule.add_tag) await addTag(env, userId, rule.add_tag);
  if (rule.start_scenario) await startScenario(env, userId, { name: rule.start_scenario });
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
      const ids = results.slice(i, i + 500).map((f) => f.user_id);
      await line.multicast(env, ids, [msg]);
      for (const id of ids) await log(env, id, 'out', 'multicast', [msg]);
    }
  }
  return { recipients: results.length };
}
