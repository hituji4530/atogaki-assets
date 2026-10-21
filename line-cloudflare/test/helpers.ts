// テスト用：本番と同じマイグレーションを sql.js（SQLite）に流し、LINE API を偽物に差し替える
import { readdirSync, readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { vi } from 'vitest';
import { createD1 } from '../demo/d1-sqljs';
import type { Env } from '../src/env';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
export const migrationFiles = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
export const migration = (f: string) => readFileSync(new URL(f, MIGRATIONS), 'utf8');

export async function makeEnv(opts: { migrations?: string[] } = {}) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  for (const f of opts.migrations ?? migrationFiles()) db.exec(migration(f));
  const env: Env = {
    DB: createD1(db),
    LINE_CHANNEL_SECRET: 'secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'token',
    ADMIN_TOKEN: 'admin',
    DRY_RUN: 'false',
  };
  const rows = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] => {
    const st = db.prepare(sql);
    st.bind(params);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    st.free();
    return out;
  };
  return { env, db, rows };
}

export type LineCall = { path: string; retryKey: string | null; body: { to?: string; replyToken?: string; messages: { text?: string }[] } };

// LINE API の偽物。push / reply の応答ステータスを順番に指定できる（指定がなければ 200）
export function stubLine() {
  const calls: LineCall[] = [];
  const statuses: Record<string, number[]> = { push: [], reply: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace('/v2/bot', '');
    if (path.startsWith('/profile/')) return Response.json({ displayName: 'さくら' });
    const kind = path === '/message/reply' ? 'reply' : 'push';
    const headers = new Headers(init?.headers);
    calls.push({ path, retryKey: headers.get('X-Line-Retry-Key'), body: JSON.parse(String(init?.body)) });
    const status = statuses[kind].shift() ?? 200;
    return new Response(status === 200 ? '{}' : `{"message":"error ${status}"}`, { status });
  }));
  const of = (path: string) => calls.filter((c) => c.path === path);
  return { calls, statuses, pushes: () => of('/message/push'), replies: () => of('/message/reply') };
}

// 時計を日本時間で合わせる
export const setJst = (iso: string) => vi.setSystemTime(new Date(`${iso}+09:00`));
export const advance = (minutes: number) => vi.setSystemTime(Date.now() + minutes * 60_000);
