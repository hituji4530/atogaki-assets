import { Hono } from 'hono';
import type { Env } from './env';
import * as engine from './engine';
import { isDryRun, verifySignature } from './line';

export const app = new Hono<{ Bindings: Env }>();

// ---------- LINE Webhook ----------
app.post('/webhook', async (c) => {
  const body = await c.req.text();
  if (!(await verifySignature(c.env.LINE_CHANNEL_SECRET, body, c.req.header('x-line-signature') ?? null))) {
    return c.text('invalid signature', 401);
  }
  const { events = [] } = JSON.parse(body) as { events?: Parameters<typeof engine.handleEvent>[1][] };
  // LINE には即 200 を返し、処理はバックグラウンドで続ける
  const work = (async () => {
    for (const ev of events) {
      try { await engine.handleEvent(c.env, ev); } catch (e) { console.error('event failed', e); }
    }
  })();
  try { c.executionCtx.waitUntil(work); } catch { await work; }
  return c.text('ok');
});

// ---------- 管理 API ----------
const api = new Hono<{ Bindings: Env }>();

api.use('*', async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!c.env.ADMIN_TOKEN || auth !== `Bearer ${c.env.ADMIN_TOKEN}`) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

api.get('/stats', async (c) => {
  const db = c.env.DB;
  const [friends, blocked, tags, out] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM friends WHERE status = 'active'`),
    db.prepare(`SELECT COUNT(*) AS n FROM friends WHERE status = 'blocked'`),
    db.prepare(`SELECT t.name, COUNT(ft.user_id) AS n FROM tags t LEFT JOIN friend_tags ft ON ft.tag_id = t.id GROUP BY t.id ORDER BY n DESC`),
    db.prepare(`SELECT via, COUNT(*) AS n FROM messages WHERE direction = 'out' GROUP BY via`),
  ]);
  return c.json({
    friends: (friends.results[0] as { n: number }).n,
    blocked: (blocked.results[0] as { n: number }).n,
    tags: tags.results,
    sent: out.results,
    dryRun: isDryRun(c.env),
    now: await engine.now(c.env),
  });
});

api.get('/friends', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.*, (SELECT GROUP_CONCAT(t.name, '|') FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.user_id = f.user_id) AS tags
       FROM friends f ORDER BY f.followed_at DESC LIMIT 500`,
  ).all<Record<string, unknown> & { tags: string | null }>();
  return c.json(results.map((f) => ({ ...f, tags: f.tags ? f.tags.split('|') : [] })));
});

api.get('/friends/:id/messages', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, direction, via, body, created_at FROM messages WHERE user_id = ? ORDER BY id`,
  ).bind(c.req.param('id')).all<{ body: string }>();
  return c.json(results.map((m) => ({ ...m, body: JSON.parse(m.body) })));
});

api.post('/friends/:id/push', async (c) => {
  const { message } = await c.req.json<{ message: string }>();
  await engine.pushTo(c.env, c.req.param('id'), message);
  return c.json({ ok: true });
});

api.post('/friends/:id/tags', async (c) => {
  const { tag } = await c.req.json<{ tag: string }>();
  await engine.addTag(c.env, c.req.param('id'), tag);
  return c.json({ ok: true });
});

api.delete('/friends/:id/tags/:tag', async (c) => {
  await engine.removeTag(c.env, c.req.param('id'), c.req.param('tag'));
  return c.json({ ok: true });
});

api.get('/scenarios', async (c) => {
  const db = c.env.DB;
  const [sc, steps] = await db.batch([
    db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM enrollments e WHERE e.scenario_id = s.id) AS enrolled FROM scenarios s ORDER BY id`),
    db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM step_deliveries d WHERE d.step_id = s.id AND d.result = 'sent') AS sent
                  FROM scenario_steps s ORDER BY scenario_id, offset_minutes, id`),
  ]);
  return c.json((sc.results as { id: number }[]).map((s) => ({
    ...s, steps: (steps.results as { scenario_id: number }[]).filter((st) => st.scenario_id === s.id),
  })));
});

api.post('/scenarios', async (c) => {
  const { name, trigger } = await c.req.json<{ name: string; trigger?: string }>();
  await c.env.DB.prepare(`INSERT INTO scenarios (name, trigger) VALUES (?, ?)`).bind(name, trigger === 'follow' ? 'follow' : 'manual').run();
  return c.json({ ok: true });
});

api.post('/scenarios/:id/steps', async (c) => {
  const b = await c.req.json<{ offset_minutes: number; message: string; require_tag?: string; exclude_tag?: string }>();
  await c.env.DB.prepare(
    `INSERT INTO scenario_steps (scenario_id, offset_minutes, message, require_tag, exclude_tag, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(Number(c.req.param('id')), Number(b.offset_minutes) || 0, b.message, b.require_tag || null, b.exclude_tag || null, await engine.now(c.env)).run();
  return c.json({ ok: true });
});

api.delete('/steps/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM scenario_steps WHERE id = ?`).bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

api.get('/keywords', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM keyword_rules ORDER BY id`).all();
  return c.json(results);
});

api.post('/keywords', async (c) => {
  const b = await c.req.json<{ keyword: string; match_type?: string; reply?: string; add_tag?: string; start_scenario?: string }>();
  await c.env.DB.prepare(
    `INSERT INTO keyword_rules (keyword, match_type, reply, add_tag, start_scenario) VALUES (?, ?, ?, ?, ?)`,
  ).bind(b.keyword, b.match_type === 'exact' ? 'exact' : 'contains', b.reply || null, b.add_tag || null, b.start_scenario || null).run();
  return c.json({ ok: true });
});

api.delete('/keywords/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM keyword_rules WHERE id = ?`).bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

api.post('/broadcast', async (c) => {
  const { message, tag, exclude_tag } = await c.req.json<{ message: string; tag?: string; exclude_tag?: string }>();
  return c.json(await engine.broadcast(c.env, message, tag, exclude_tag));
});

// Cron を待たずにステップ配信を今すぐ実行
api.post('/run-scheduled', async (c) => c.json(await engine.runScheduled(c.env)));

// ---------- シミュレーター（DRY_RUN のときだけ） ----------
api.use('/sim/*', async (c, next) => {
  if (!isDryRun(c.env)) return c.json({ error: 'DRY_RUN=true のときだけ使えます' }, 403);
  await next();
});

// LINE から届くはずのイベントを擬似的に流す
api.post('/sim/event', async (c) => {
  const b = await c.req.json<{ type: string; userId: string; displayName?: string; text?: string; data?: string; displayText?: string }>();
  const ev = {
    type: b.type,
    replyToken: 'sim',
    source: { userId: b.userId },
    ...(b.type === 'message' ? { message: { type: 'text', text: b.text ?? '' } } : {}),
    ...(b.type === 'postback' ? { postback: { data: b.data ?? '', displayText: b.displayText } } : {}),
  };
  await engine.handleEvent(c.env, ev, b.displayName ? { displayName: b.displayName } : {});
  return c.json({ ok: true });
});

// 時計を進めてから配信処理を回す（「3日後」をすぐ確かめる用）
api.post('/sim/advance', async (c) => {
  const { minutes } = await c.req.json<{ minutes: number }>();
  await engine.advanceClock(c.env, Number(minutes) || 0);
  return c.json(await engine.runScheduled(c.env));
});

app.route('/api', api);
