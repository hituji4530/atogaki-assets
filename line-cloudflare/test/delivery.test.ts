// 配信キューの振る舞い。サンプルのシナリオ「ウェルカム」（migrations/0001_init.sql）を使う：
//   直後×2、1日後（資料請求の人は除く）、2日後（興味:ブログ）、2日後（興味:副業）、3日後
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../src/engine';
import { advance, makeEnv, migration, setJst, stubLine } from './helpers';

const follow = (userId: string) => ({ type: 'follow', replyToken: `r-${userId}`, source: { userId } });
const postback = (userId: string, data: string) => ({ type: 'postback', replyToken: 'r', source: { userId }, postback: { data } });

type Delivery = { step_id: number; status: string; attempts: number; retry_key: string | null; due_at: number; next_at: number };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setJst('2026-10-21T10:00');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('友だち追加', () => {
  it('直後の2通を返信（無料）で送り、残りは予定として積む', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));

    expect(line.replies()).toHaveLength(1);
    expect(line.replies()[0].body.messages).toHaveLength(2);
    expect(line.pushes()).toHaveLength(0);
    const ds = rows<Delivery>(`SELECT * FROM deliveries WHERE user_id = 'U1' ORDER BY step_id`);
    expect(ds.map((d) => d.status)).toEqual(['sent', 'sent', 'pending', 'pending', 'pending', 'pending']);
    expect(rows(`SELECT via, n FROM stats_monthly`)).toEqual([{ via: 'reply', n: 1 }]);
  });

  it('処理中に時計が進んでも、直後の分は返信に乗る', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    let tick = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => (tick += 3));
    await engine.handleEvent(env, follow('U1'));
    expect(line.replies()[0]?.body.messages).toHaveLength(2);
  });

  it('ブロックすると未配信の予定を取り消し、再フォローしてもやり直さない', async () => {
    const { env, rows } = await makeEnv();
    stubLine();
    await engine.handleEvent(env, follow('U1'));
    await engine.handleEvent(env, { type: 'unfollow', source: { userId: 'U1' } });
    expect(rows(`SELECT COUNT(*) AS n FROM deliveries WHERE status = 'pending'`)).toEqual([{ n: 0 }]);

    await engine.handleEvent(env, follow('U1'));
    expect(rows(`SELECT COUNT(*) AS n FROM deliveries WHERE status = 'pending'`)).toEqual([{ n: 0 }]);
  });
});

describe('Cron でのステップ配信', () => {
  it('時間が来た分を1回だけプッシュし、再送キーを付ける', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));

    advance(1440);
    expect(await engine.runScheduled(env)).toMatchObject({ pushes: 1 });
    expect(line.pushes()).toHaveLength(1);
    expect(line.pushes()[0].retryKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(line.pushes()[0].body.messages[0].text).toContain('昨日は登録ありがとうございました');

    expect(await engine.runScheduled(env)).toMatchObject({ pushes: 0 });
    expect(line.pushes()).toHaveLength(1);
  });

  it('タグの条件で出し分ける（合わない予定は skipped）', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    await engine.handleEvent(env, postback('U1', 'tag=興味:ブログ'));

    advance(2880);
    await engine.runScheduled(env);
    const texts = line.pushes().flatMap((p) => p.body.messages.map((m) => m.text));
    expect(texts.some((t) => t?.includes('ブログに興味がある方へ'))).toBe(true);
    expect(texts.some((t) => t?.includes('副業に興味がある方へ'))).toBe(false);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 5`)).toEqual([{ status: 'skipped' }]);
  });

  it('同じ人に同時に届く分は1回のプッシュにまとめる', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    await engine.handleEvent(env, postback('U1', 'tag=興味:ブログ'));

    advance(4320); // 1日後・2日後(ブログ)・3日後がまとめて期限に
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(1);
    expect(line.pushes()[0].body.messages).toHaveLength(3);
  });

  it('深夜に登録した人には、翌日の夜ではなく翌々日の朝9時に届く', async () => {
    const { env, rows } = await makeEnv();
    stubLine();
    setJst('2026-10-21T23:30');
    await engine.handleEvent(env, follow('U1'));
    const [d] = rows<Delivery>(`SELECT due_at FROM deliveries WHERE step_id = 3`);
    expect(d.due_at).toBe(new Date('2026-10-23T09:00+09:00').getTime());
  });

  it('Cron が同時に2回走っても二重に送らない', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    await Promise.all([engine.runScheduled(env), engine.runScheduled(env)]);
    expect(line.pushes()).toHaveLength(1);
  });
});

describe('送信失敗', () => {
  it('500 なら同じ再送キーで1分後に送り直す', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    line.statuses.push.push(500);
    await engine.runScheduled(env);
    const [d] = rows<Delivery>(`SELECT * FROM deliveries WHERE step_id = 3`);
    expect(d).toMatchObject({ status: 'pending', attempts: 1 });
    expect(d.next_at).toBe(Date.now() + 60_000);

    await engine.runScheduled(env); // まだ1分たっていない
    expect(line.pushes()).toHaveLength(1);
    advance(1);
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(2);
    expect(line.pushes()[1].retryKey).toBe(line.pushes()[0].retryKey);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 3`)).toEqual([{ status: 'sent' }]);
  });

  it('再送は、1回の上限で途中が切れても前回と同じ組み合わせで送る', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    await engine.handleEvent(env, postback('U1', 'tag=興味:ブログ'));
    advance(4320);
    line.statuses.push.push(500);
    await engine.runScheduled(env); // 3通まとめたプッシュが失敗
    env.MAX_SENDS_PER_TICK = '1';
    advance(1);
    await engine.runScheduled(env);
    expect(line.pushes()[1].body.messages).toHaveLength(3);
    expect(line.pushes()[1].retryKey).toBe(line.pushes()[0].retryKey);
  });

  it('再送待ちの予定は、返信に相乗りさせない（二重に届かないように）', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    line.statuses.push.push(500);
    await engine.runScheduled(env);
    advance(5);
    await engine.handleEvent(env, { type: 'message', replyToken: 'r', source: { userId: 'U1' }, message: { type: 'text', text: 'こんにちは' } });
    expect(line.replies().at(-1)?.body.messages).toHaveLength(1);
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(2);
  });

  it('409（前回が受理済み）は送信済みとして扱う', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    line.statuses.push.push(409);
    await engine.runScheduled(env);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 3`)).toEqual([{ status: 'sent' }]);
  });

  it('401 なら配信を止め、再開後に同じ再送キーで続きから送る', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    line.statuses.push.push(401);
    expect(await engine.runScheduled(env)).toMatchObject({ paused: true });
    expect(await engine.getSetting(env, 'paused')).toBe('1');
    expect(rows(`SELECT kind FROM ops_log`)).toEqual([{ kind: 'token_invalid' }]);

    advance(10);
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(1); // 止まっている間は送らない

    await engine.resume(env);
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(2);
    expect(line.pushes()[1].retryKey).toBe(line.pushes()[0].retryKey);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 3`)).toEqual([{ status: 'sent' }]);
  });

  it('400 は再送しない', async () => {
    const { env, rows } = await makeEnv();
    const line = stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(1440);
    line.statuses.push.push(400);
    await engine.runScheduled(env);
    advance(60);
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(1);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 3`)).toEqual([{ status: 'failed' }]);
  });

  it('返信に失敗した直後の分は、Cron がプッシュで送り直す', async () => {
    const { env } = await makeEnv();
    const line = stubLine();
    line.statuses.reply.push(400);
    await expect(engine.handleEvent(env, follow('U1'))).rejects.toThrow();
    await engine.runScheduled(env);
    expect(line.pushes()).toHaveLength(1);
    expect(line.pushes()[0].body.messages).toHaveLength(2);
  });
});

describe('ステップの追加と停止', () => {
  it('後から足したステップは、これから届く人にだけ予定を足す', async () => {
    const { env, rows } = await makeEnv();
    stubLine();
    await engine.handleEvent(env, follow('U1'));
    advance(2 * 1440);
    const add = async (offset: number) => {
      await env.DB.prepare(`INSERT INTO scenario_steps (scenario_id, offset_minutes, message, created_at) VALUES (1, ?, 'new', ?)`).bind(offset, Date.now()).run();
      const { id } = rows<{ id: number }>(`SELECT MAX(id) AS id FROM scenario_steps`)[0];
      await engine.enqueueStepForEnrolled(env, id);
      return rows(`SELECT status FROM deliveries WHERE step_id = ?`, [id]);
    };
    expect(await add(1440)).toEqual([]); // 1日後の分はもう過ぎている
    expect(await add(5 * 1440)).toEqual([{ status: 'pending' }]);
  });

  it('停止したステップの予定は取り消す', async () => {
    const { env, rows } = await makeEnv();
    stubLine();
    await engine.handleEvent(env, follow('U1'));
    await engine.cancelStep(env, 6);
    expect(rows(`SELECT status FROM deliveries WHERE step_id = 6`)).toEqual([{ status: 'canceled' }]);
  });
});

describe('マイグレーション', () => {
  it('旧方式の配信記録と、これから届く予定を deliveries に移す', async () => {
    vi.useRealTimers(); // マイグレーションの SQL は SQLite 側の現在時刻を使う
    const { db, rows } = await makeEnv({ migrations: ['0001_init.sql'] });
    const now = Date.now();
    const day = 86_400_000;
    db.exec(`
      INSERT INTO friends (user_id, display_name, status, followed_at, updated_at) VALUES ('U1', 'さくら', 'active', ${now - 2 * day}, ${now});
      INSERT INTO enrollments (user_id, scenario_id, started_at) VALUES ('U1', 1, ${now - 2 * day});
      INSERT INTO step_deliveries (user_id, step_id, result, created_at) VALUES ('U1', 1, 'sent', ${now - 2 * day}), ('U1', 2, 'sent', ${now - 2 * day}), ('U1', 3, 'skipped', ${now - day});
      INSERT INTO messages (user_id, direction, via, body, created_at) VALUES ('U1', 'out', 'reply', '{}', ${now});
    `);
    db.exec(migration('0002_delivery_queue.sql'));
    const ds = rows<Delivery>(`SELECT step_id, status FROM deliveries ORDER BY step_id`);
    // 2日後の分（4, 5）はちょうど今が期限なので送る。3日後（6）は未来
    expect(ds.map((d) => [d.step_id, d.status])).toEqual([[1, 'sent'], [2, 'sent'], [3, 'skipped'], [4, 'pending'], [5, 'pending'], [6, 'pending']]);
    expect(rows(`SELECT via, n FROM stats_monthly`)).toEqual([{ via: 'reply', n: 1 }]);
  });
});
