import { app } from './app';
import type { Env } from './env';
import { runScheduled } from './engine';

export default {
  fetch: app.fetch,
  // wrangler.toml の [triggers] crons で毎分起動 → 時間が来たステップを送る
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env).then((r) => console.log('scheduled', r)));
  },
} satisfies ExportedHandler<Env>;
