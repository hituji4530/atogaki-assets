// Worker と同じ app をブラウザ内で動かす。DB は sql.js（SQLite）、LINE への送信は DRY_RUN でスキップ
import { app } from '../src/app';
import type { Env } from '../src/env';
import { createD1 } from './d1-sqljs';
import schema from 'virtual:schema';

// line-builder スキルが差し込む設計（なければ同梱のサンプルで起動）
type Design = { account?: string; sql: string; firstFriend?: string };
const design = (window as unknown as { __DESIGN__?: Design }).__DESIGN__;

declare const initSqlJs: () => Promise<{ Database: new () => Parameters<typeof createD1>[0] }>;

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

async function boot() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(schema);
  if (design) db.exec(design.sql);
  const env: Env = {
    DB: createD1(db),
    LINE_CHANNEL_SECRET: 'demo',
    LINE_CHANNEL_ACCESS_TOKEN: 'demo',
    ADMIN_TOKEN: 'demo',
    DRY_RUN: 'true',
  };
  const call = (path: string, init?: RequestInit) => app.fetch(new Request(`https://demo.local${path}`, init), env, ctx);
  const post = (path: string, body: unknown) =>
    call(`/api${path}`, { method: 'POST', headers: { authorization: 'Bearer demo', 'content-type': 'application/json' }, body: JSON.stringify(body) });

  if (design) {
    // 設計デモ：1人が友だち追加した直後の状態から始める
    await post('/sim/event', { type: 'follow', userId: 'U_first', displayName: design.firstFriend || 'さくら' });
    return call;
  }

  // サンプル：2人が登録済みで、1日経過した状態から始める
  await post('/sim/event', { type: 'follow', userId: 'U_sakura', displayName: 'さくら' });
  await post('/sim/event', { type: 'postback', userId: 'U_sakura', data: 'tag=興味:ブログ&reply=ありがとうございます！ブログ向けの情報を優先してお届けしますね。', displayText: 'ブログ' });
  await post('/sim/event', { type: 'follow', userId: 'U_kenta', displayName: 'けんた' });
  await post('/sim/event', { type: 'message', userId: 'U_kenta', text: '資料ください' });
  await post('/sim/advance', { minutes: 24 * 60 + 1 });

  return call;
}

(window as unknown as { __DEMO__: Promise<unknown> }).__DEMO__ = boot();
