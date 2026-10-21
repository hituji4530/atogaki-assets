import { describe, expect, it } from 'vitest';
import { backoff, jstMonth, parseWindow, scheduleAt } from '../src/schedule';

const jst = (iso: string) => new Date(`${iso}+09:00`).getTime();
const window = parseWindow('09:00-21:00');

describe('scheduleAt', () => {
  it('登録直後のステップは時間帯の制限をかけない（返信に相乗りするため）', () => {
    expect(scheduleAt(jst('2026-10-21T23:30'), { offset_minutes: 0 }, window)).toBe(jst('2026-10-21T23:30'));
  });

  it('時間帯の中なら、登録から offset 分後', () => {
    expect(scheduleAt(jst('2026-10-21T10:00'), { offset_minutes: 1440 }, window)).toBe(jst('2026-10-22T10:00'));
  });

  it('夜21時以降になる配信は、翌朝9時に寄せる', () => {
    expect(scheduleAt(jst('2026-10-21T23:30'), { offset_minutes: 1440 }, window)).toBe(jst('2026-10-23T09:00'));
  });

  it('朝9時より前になる配信は、その日の9時に寄せる', () => {
    expect(scheduleAt(jst('2026-10-21T06:00'), { offset_minutes: 1440 }, window)).toBe(jst('2026-10-22T09:00'));
  });

  it('時刻指定があれば、offset 経過後の最初のその時刻', () => {
    expect(scheduleAt(jst('2026-10-21T15:00'), { offset_minutes: 1440, at_time: '10:00' }, window)).toBe(jst('2026-10-23T10:00'));
    expect(scheduleAt(jst('2026-10-21T08:00'), { offset_minutes: 1440, at_time: '10:00' }, window)).toBe(jst('2026-10-22T10:00'));
  });

  it('時間帯の設定が不正なら制限しない', () => {
    expect(parseWindow('')).toBeNull();
    expect(parseWindow('21:00-09:00')).toBeNull();
    expect(scheduleAt(jst('2026-10-21T23:30'), { offset_minutes: 60 }, null)).toBe(jst('2026-10-22T00:30'));
  });
});

describe('backoff / jstMonth', () => {
  it('再送間隔は 1分, 5分, 30分, 2時間, 6時間', () => {
    expect([1, 2, 3, 4, 5].map((a) => backoff(a) / 60_000)).toEqual([1, 5, 30, 120, 360]);
  });

  it('月の区切りは日本時間', () => {
    expect(jstMonth(jst('2026-11-01T00:30'))).toBe('2026-11');
  });
});
