// 配信時刻と再送間隔の計算（DBに触れない純関数。テストしやすいよう engine から分けている）

const MIN = 60_000;
const DAY = 1440 * MIN;
const JST = 9 * 60 * MIN; // 日本時間は UTC+9 固定（夏時間なし）

export const DEFAULT_WINDOW = '09:00-21:00';

export type Window = { start: number; end: number }; // 日本時間の0時からの分

// '09:00-21:00' → { start: 540, end: 1260 }。空や不正な値は「制限なし」
export function parseWindow(value: string | null | undefined): Window | null {
  const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return start < end && end <= 1440 ? { start, end } : null;
}

// '10:00' → 600
function parseTime(value: string | null | undefined) {
  const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 日本時間でのその日の0時（UTCのミリ秒）と、0時からの分
function jstDay(ms: number) {
  const local = ms + JST;
  const midnight = local - (((local % DAY) + DAY) % DAY);
  return { midnight: midnight - JST, minutes: Math.floor((local - midnight) / MIN) };
}

// ステップの配信時刻。
// - 登録から offset 分後
// - at_time があれば、その後の最初の「その時刻（日本時間）」
// - 配信時間帯の外になったら、次の開始時刻に寄せる
// 登録直後（offset 0 で時刻指定なし）は返信に相乗りする分なので、時間帯の制限をかけない
export function scheduleAt(startedAt: number, step: { offset_minutes: number; at_time?: string | null }, window: Window | null) {
  let due = startedAt + step.offset_minutes * MIN;
  const at = parseTime(step.at_time);
  if (step.offset_minutes === 0 && at === null) return due;
  if (at !== null) {
    const { midnight } = jstDay(due);
    let candidate = midnight + at * MIN;
    if (candidate < due) candidate += DAY;
    due = candidate;
  }
  if (window) {
    const { midnight, minutes } = jstDay(due);
    if (minutes < window.start) due = midnight + window.start * MIN;
    else if (minutes >= window.end) due = midnight + DAY + window.start * MIN;
  }
  return due;
}

// 送信失敗の再送間隔（1分, 5分, 30分, 2時間, 6時間）。LINE の再送キーの有効期限24時間に収まる
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
export const backoff = (attempts: number) => BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), MAX_ATTEMPTS) - 1] * MIN;

// '2026-10'（日本時間の年月）
export const jstMonth = (ms: number) => new Date(ms + JST).toISOString().slice(0, 7);
