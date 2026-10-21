# line-cloudflare

Cloudflare（Workers + D1 + Cron Triggers）だけで動く、Lステップ風の LINE 公式アカウント運用ツールの最小構成です。
「Lステップ・エルメ・UTAGE がなくても Cloudflare だけでいける」という話を、中身が見える形で試すために作りました。

## しくみ

```
LINE公式アカウント ──Webhook──▶ Workers（/webhook）──▶ D1（友だち・タグ・シナリオ・履歴）
                    ◀─reply/push─┘        ▲
                                Cron Triggers（毎分）… 時間が来たステップをプッシュ
```

Lステップなどのツールがやっていることは、LINE の Messaging API の上に「友だちのデータベース」と「時間になったら送る仕組み」を載せることです。
Cloudflare の Workers（サーバー）・D1（データベース）・Cron Triggers（定期実行）でそれを用意すれば、同じことを自前で持てます。

| できること | 中身 |
| --- | --- |
| 友だち管理 | follow / unfollow を受けて登録・ブロック状態を記録 |
| タグ | キーワード、ボタン（postback）、管理画面から付け外し |
| ステップ配信 | 「登録から○分/時間/日後」に配信。タグで分岐（ある人だけ／ある人は除く） |
| キーワード自動応答 | 含む／完全一致。返信と同時にタグ付け・シナリオ開始 |
| 一斉・セグメント配信 | 全員、またはタグで絞って送信 |
| 管理画面 | 上記すべて＋送受信履歴。`DRY_RUN` 中はテスト用トーク画面と時計の早送り |

通数を節約する工夫：登録直後のステップや自動応答は **reply（無料）** で返し、同じ人に同時に届くステップは1回の push にまとめています。

## ファイル

- `src/app.ts` … Webhook と管理 API（Hono）
- `src/engine.ts` … タグ・ステップ配信・キーワード応答・一斉配信の本体
- `src/line.ts` … Messaging API クライアントと署名検証
- `src/index.ts` … Worker の入口（fetch と Cron）
- `migrations/0001_init.sql` … テーブル定義とサンプルのシナリオ・キーワード
- `ui/app.html` … 管理画面（`npm run build` で `public/index.html` に出力）
- `demo/` … 同じコードをブラウザ内（sql.js）で動かす単体デモ（`npm run build:demo` で `dist/demo.html`）

## 手元で試す（LINE アカウントなしで OK）

```sh
npm install
cp .dev.vars.example .dev.vars        # ADMIN_TOKEN=change-me のままでよい
npm run db:init:local
npm run dev                           # http://localhost:8787 を開き、トークン change-me で入る
```

`DRY_RUN = "true"` の間は LINE に何も送らず、左のトーク画面から「友だち追加」「メッセージ送信」「ボタンを押す」「時間を進める」を試せます。

## 本物の LINE につなぐ

1. [LINE Developers](https://developers.line.biz/) で Messaging API チャネルを作り、**チャネルシークレット** と **チャネルアクセストークン（長期）** を控える
2. Cloudflare 側の準備
   ```sh
   npx wrangler login
   npx wrangler d1 create line-cloudflare    # 出てきた database_id を wrangler.toml に貼る
   npm run db:init
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put ADMIN_TOKEN
   ```
3. `wrangler.toml` の `DRY_RUN` を `"false"` にして `npm run deploy`
4. LINE Developers の Webhook URL に `https://line-cloudflare.<あなたのサブドメイン>.workers.dev/webhook` を入れて「Webhookの利用」をオン
5. LINE Official Account Manager で「応答メッセージ」「あいさつメッセージ」をオフ（ウェルカムが二重に届かないように）
6. 自分のスマホで友だち追加 → 管理画面（デプロイ先の URL）に自分が出てくれば成功

## 費用の目安

- Cloudflare：Workers・D1・Cron は無料枠で小規模なら収まる
- LINE：無料プランは月200通まで。reply は通数にカウントされない。push・一斉配信は「1リクエスト×人数」でカウント

## このデモに入っていないもの

フォーム・予約・決済連携、リッチメニューの出し分け、流入経路分析、複数アカウント、権限管理、配信の時刻指定（「3日後の20時」など）。
これらまで揃ったものが欲しい場合は、同じく Cloudflare で動く OSS の [LINE Harness](https://github.com/Shudesu/line-harness-oss) も選択肢です。
