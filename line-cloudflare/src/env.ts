export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  ADMIN_TOKEN: string;
  // "true" のあいだは LINE に送信せず、ログにだけ残す（シミュレーターと時計の早送りが使える）
  DRY_RUN?: string;
}
