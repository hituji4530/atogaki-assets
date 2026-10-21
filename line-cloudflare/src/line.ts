// LINE Messaging API の薄いクライアント。DRY_RUN のときは実際には送らない。
import type { Env } from './env';

const API = 'https://api.line.me/v2/bot';

export type LineMessage = Record<string, unknown> & { type: string };

export const isDryRun = (env: Env) => env.DRY_RUN === 'true';

// x-line-signature = base64(HMAC-SHA256(channelSecret, body))
export async function verifySignature(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// LINE API の失敗。status を見て、再送するか・止めるかを決める
export class LineApiError extends Error {
  constructor(public status: number, public body: string, path: string) {
    super(`LINE API ${path} ${status}: ${body}`);
  }
}

type SendOptions = { retryKey?: string };

async function call(env: Env, path: string, payload: unknown, opts: SendOptions = {}) {
  if (isDryRun(env)) return;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
  };
  // 同じキーで受理済みなら LINE は 409 を返し、二重には送らない（キーは24時間有効。内容は変えずに再送する）
  if (opts.retryKey) headers['X-Line-Retry-Key'] = opts.retryKey;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new LineApiError(res.status, await res.text(), path);
}

// 返信（無料・通数にカウントされない）。replyToken は受信直後の1回だけ有効
export const reply = (env: Env, replyToken: string, messages: LineMessage[]) =>
  call(env, '/message/reply', { replyToken, messages: messages.slice(0, 5) });

// プッシュ（通数にカウントされる）
export const push = (env: Env, to: string, messages: LineMessage[], opts?: SendOptions) =>
  call(env, '/message/push', { to, messages: messages.slice(0, 5) }, opts);

// 複数人へ同じ内容を送る（最大500人/回）
export const multicast = (env: Env, to: string[], messages: LineMessage[], opts?: SendOptions) =>
  call(env, '/message/multicast', { to, messages: messages.slice(0, 5) }, opts);

export async function getProfile(env: Env, userId: string): Promise<{ displayName?: string }> {
  if (isDryRun(env)) return {};
  const res = await fetch(`${API}/profile/${userId}`, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  return res.ok ? res.json() : {};
}
