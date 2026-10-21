# Lステップ導入事例：店舗型・地域型ビジネス（美容サロン／クリニック・治療院／ジム／飲食／教室）

> 調査メモ（2026-10-21）
> - 手法上の制約: この環境では linestep.jp・lflow.net などへの WebFetch と curl がどちらも失敗した（DNS エラー、またはプロキシ 403）。そのため、以下の内容は**検索エンジンの抜粋と要約から確認できた範囲**に限られる。本文の全文は読めていないので、数値の前提条件（期間・母数）が分からないものが多い。引用する前に原文を確認すること。
> - 出典の性質: linestep.jp 上の事例は、ほぼすべて**ツール提供元（株式会社Maneql）の自社サイト**に載っている。記事の多くは「Lステップ正規代理店・認定コンサルタント」が書いたもので、**宣伝目的の自己申告**である。第三者が検証した数値は1件も見つからなかった。代理店自身のサイト（MARKELINE / balsa / LFLOW / JPM など）の数値も同じく宣伝として扱う。
> - 「stock-sun.com」の事例は検索でヒットせず、内容を確認できていない。

## 業種別の事例一覧（表）

凡例: 【公】= linestep.jp（提供元サイト。多くは代理店の寄稿）、【代】= 構築代行会社の自社サイト、【他】= エルメなど他ツール。日付は記事 URL の日付。

### A. 美容サロン（美容室・ヘアカラー・まつげ・エステ）

| 事業者／業種・地域 | 導入前の課題・目的 | 主な集客経路 | 使った機能 | 改善した指標・数値 | 出典・時期 |
|---|---|---|---|---|---|
| ReSPEC by personalSALON（美容室・群馬県前橋市） | （抜粋では不明） | 既存客のLINE | 一斉／セグメント配信 | 「たった2通の配信で売上203万円」。カウンセリング時間の短縮、予約電話の減少 | 【公】[2024-10-23](https://linestep.jp/2024/10/23/lstep-case-hair-salon-respec/) |
| ベイコローレ Bei colore（ヘアカラー専門店・大阪／兵庫） | ドタキャン、回転率。代理店はジャパンパシフィックマネージメント（JPM） | ホットペッパービューティーにも掲載中（[HPB店舗ページ](https://beauty.hotpepper.jp/slnH000629883/)） | カレンダー予約への一本化、リマインド（前日・当日・直前）、LINE上のパーソナルカラー診断（事前ヒアリングの自動化） | 客単価1.8倍、売上倍増、1時間あたりの対応人数3人→4人。リマインドで「ドタキャンがほぼゼロ」 | 【公】[2024-10-01](https://linestep.jp/2024/10/01/lstep-case-hair-color/)／[9選まとめ(2021-03初出)](https://linestep.jp/2021/03/15/beautiful/) |
| FAST LASH（アイラッシュサロン・表参道／渋谷） | コロナ禍で売上が落ちた。2022年6月に導入 | （抜粋ではInstagram／HPBとの関係は確認できず） | 男女別のリッチメニューとシナリオ、目元診断、デザイン集、毎日ガチャ、カウンセリングシートと同意書のLINE化 | 新規数5.5倍、売上2.4倍。客単価とリピートも向上したとされる | 【公】[2024-02-15](https://linestep.jp/2024/02/15/lstep-case-eyelash-salon/)、[case_56](https://linestep.jp/lp/01/case_56.html) |
| 美容サロン（正規代理店の近藤氏が寄稿） | リピーターを獲得したい | 店頭（既存客） | 予約導線、リピート配信 | LINE経由の予約が全体の30%→50%（半年後）。公開初月の友だち登録100人という記述もあるが、検索要約どうしで食い違うため要確認 | 【公】[2024-08-20](https://linestep.jp/2024/08/20/lstep-case-beauty-salon-2/)、[X告知](https://x.com/lstep_jp/status/1826426225755390179) |
| シミケア専門の美容サロン | 運営者は広告運用の経験がなかった | Instagram（ストーリー）広告→LINE | 友だち追加直後の予約シナリオ、予約後の教育配信 | 友だち追加からの予約率43%、コース契約率66% | 【公】[2026-05-06](https://linestep.jp/2026/05/06/lstep-case-beauty-salon-3/) |
| 美容室（恵比寿・台湾・ラスベガス） | アナログ業務。多言語対応が必要 | 店舗（国内外） | 3カ国語対応の構築、業務の自動化 | 工数削減（抜粋に数値なし） | 【公】[2024-10-16](https://linestep.jp/2024/10/16/lstep-case-beautysalon/) |
| Respia（美容室・銀座） | 機能や情報がばらばらだった | 店頭 | ポイント、予約、ネットショップをLINEに集約 | 物販売上が向上（抜粋に数値なし） | 【公】[事例一覧](https://linestep.jp/lp/01/case.html) |

### B. 美容クリニック・歯科

| 事業者 | 課題・目的 | 集客経路 | 機能 | 指標・数値 | 出典 |
|---|---|---|---|---|---|
| 東京美容医療クリニック（代理店はLFLOWの米澤氏） | リピート率が低い（20%。本文中には「当時約30%」との記述もあり不一致）。顧客ごとの訴求ができていない。LINE公式アカウントを活かしきれていない | 既存患者 | 属性セグメント、施術履歴や最終来院日に応じた出し分け、1to1チャット。2023年4月ごろ導入 | リピート率20%→80%。新規:既存の比率7:3→3:7。キャンペーン1回あたりの予約50件→170件（LFLOW側の記述） | 【公】[2024-12-28](https://linestep.jp/2024/12/28/lstep-case-beauty-clinic/)、[case_72](https://linestep.jp/lp/01/case_72.html)、[X告知](https://x.com/lstep_jp/status/1875362178129330349)、【代】[LFLOWコラム](https://lflow.net/column/line-operation-for-beauty-clinic/) |
| エルムクリニック（美容クリニック） | KPIを達成したい | （不明） | 属性別の配信最適化 | 友だち数2.4倍、予約タップ数1.7倍、月商150〜200万円規模 | 【公】[2026-05-13](https://linestep.jp/2026/05/13/lstep-case-beauty-clinic-2/)、[case_157](https://linestep.jp/lp/01/case_157.html) |
| 歯科医院（名称不明） | 予約管理がアナログ。無断キャンセルが多い | （不明） | 予約管理機能 | 抜粋に数値なし | 【公】[予約事例11選 2025-03-28](https://linestep.jp/2025/03/28/reserve-case-study/) |
| 美容・歯科（JPMの実績ページ） | 予約システムを最適化したい | — | Lステップ＋予約システム | 「平均月商約1,500万円アップ」（代理店の宣伝。詳細は確認できず） | 【代】[JPM](https://jpm-marketing.jp/works/biyou-dental/) |

### C. 整体・接骨院・鍼灸・ストレッチ

| 事業者 | 課題・目的 | 集客経路 | 機能 | 指標・数値 | 出典 |
|---|---|---|---|---|---|
| 楓月（整体院・広島／仙台） | LINE広告に60万円かけても新規予約は1件だけ。LINE公式アカウントは導入済みで、Lステップは未導入だった | LINE友だち追加広告 | 友だち追加後のシナリオ、ガチャ | 広告費を1/3にして新規集客15倍（「新規予約15件」という表現もある）。友だち追加者の約30%がガチャを利用 | 【公】[2023-12-23](https://linestep.jp/2023/12/23/lstep-case-chiropractic-clinic/)、【代】[MARKELINE転載](https://www.lstepoffcial.com/case_post/4105/) |
| 篠丸接骨院／Uni-LABO（接骨院・整体・ジム） | 回数券の販売を強化したい | 来院患者 | 自動フォロー（顧客教育）配信 | 回数券購入率 約50%→約70%（+20pt） | 【公】[2022-11-20](https://linestep.jp/2022/11/20/shinomaru-interview/) ※2022年 |
| おはよう接骨院 | 予約サイト・HP・電話の併用でダブルブッキングが発生 | 予約サイト・HP・電話→LINEに一元化 | 予約管理、24時間受付 | ダブルブッキングを解消、当日予約が増加（数値なし） | 【公】[case_102](https://linestep.jp/lp/01/case_102.html) |
| Physical well-being（神経系ストレッチ専門店・茨城） | 既存予約システムとの二重管理 | 店頭 | 既存予約システムを解約してカレンダー予約に一本化、来店前リマインド、施術後15/30/60日のフォロー、口コミ案内 | 来店予約の約90%、イベント予約の70%がLINE経由に。来院率とリピート率が向上。売上は「半年で1.3倍」とする要約と「1.2倍以上」とする要約があり不一致 | 【公】[2024-11-18](https://linestep.jp/2024/11/18/lstep-case-stretch/)、[整体5選 2026-02-28](https://linestep.jp/2026/02/28/chiropractic-care-study/) |
| 鍼灸院（名称不明） | 初回カウンセリングが長い | — | 事前問診フォーム | カウンセリング時間1/2、成約率80% | 【公】[2024-04-25](https://linestep.jp/2024/04/25/lstep-case-acupuncture-clinic/) |
| 片木整体組（整体院） | 予約と顧客管理がばらばら | — | プロプランで予約と顧客管理を一本化 | 抜粋に数値なし | 【代】[line-consultant.biz](https://line-consultant.biz/lstep-pro-katagiseitaigumi/) |
| 整体師（Lキャストの事例。Lステップ本体ではない） | オンラインのサブスク会員を増やしたい | — | オートウェビナー | 2ヶ月で会員100人増 | 【公】[2025-03-07](https://linestep.jp/2025/03/07/lcast-case-chiropractor/) |

### D. パーソナルジム・フィットネス・スポーツ

| 事業者 | 課題・目的 | 集客経路 | 機能 | 指標・数値 | 出典 |
|---|---|---|---|---|---|
| ELEMENT（パーソナルジム・都内中心。店舗数は41店舗とする記述と約70店舗とする記述あり） | 店舗数が多く、エリアや属性に合った配信ができていなかった | HPのポップアップ→診断コンテンツ→LINE。オウンドメディア | 診断コンテンツ、友だち追加時アンケートでの検討エリア取得、LINE内での体験予約 | 1ヶ月で友だち追加275件・無料体験申込70件。体験申込は月70件。LINE登録は月500〜600名、問い合わせは月約80件。LINE経由の体験申込は累計2,000人超 | 【公】[case_12](https://linestep.jp/lp/01/case_12.html)、[2024-02-01](https://linestep.jp/2024/02/01/lstep-case-personal-gym/)、【代】[balsa インタビュー](https://balsa.co.jp/work/l-step/case-element/)、[balsa 2,000人](https://media.balsa.co.jp/ltep-case-element) |
| 女性が多いフィットネス＆パーソナルジム | 集客コストが高い | 無料体験来店者・既存会員をLINEへ誘導→紹介 | 双方特典の紹介制度、LINE導線 | 導入3ヶ月で無料体験1.5倍、集客コスト半減 | 【公】[2025-09-15](https://linestep.jp/2025/09/15/lstep-case-fitness-gym/) |
| ダンススタジオ／ダンスアカデミー | 体験会の参加者が伸びない | チラシ→LINE、リッチメニュー（校舎検索・料金） | ステップ配信、アンケート、リッチメニュー刷新 | 配信を受けた人の約20%が無料体験を予約（スタジオ）。無料体験予約率18%（アカデミー） | 【公】[スポーツ7選 2026-02-17](https://linestep.jp/2026/02/17/sports-case-study)、[教育8選 2026-04-03](https://linestep.jp/2026/04/03/education-case-study/)、【代】[cliand](https://cliand.co.jp/blog/lstep-casestudy-danceschool/) |
| パーソナルジム（紙チラシ起点） | — | 紙チラシ→LINE→体験申込フォーム | 回答フォーム | 抜粋に数値なし | 【代】[icchan-webdirector](https://icchan-webdirector.com/blog/personalgym_kamitirasi_lsuteppu.html) |

### E. 飲食店

| 事業者 | 課題・目的 | 集客経路 | 機能 | 指標・数値 | 出典 |
|---|---|---|---|---|---|
| CoCo壱番屋（4店舗を運営するFC・関谷氏） | 店舗別アカウントの管理 | 店頭 | 1アカウントで4店舗を管理、ガチャ、ポイントカード | 運用3ヶ月で友だち登録7,200人超 | 【公】[事例一覧](https://linestep.jp/lp/01/case.html)、[複数店舗3選 2026-03-15](https://linestep.jp/2026/03/15/multiple-stores-case-study/) |
| やっぱりステーキ（沖縄発） | 店舗ごとにアカウントが分かれていた（85店舗） | 店頭 | アカウントの一本化 | 運用コストを削減（数値なし） | 【公】[case_126](https://linestep.jp/lp/01/case_126.html) |
| まるみつ（岐阜県郡上市） | — | 店頭QRのみ | — | 友だち追加 月平均約40人 | 【公】[事例一覧](https://linestep.jp/lp/01/case.html) |
| シュークリーム専門店 | リピーターを育てたい | 店頭（新規オープン） | — | オープン初月にLINE登録3,000人 | 【公】[2025-09-29](https://linestep.jp/2025/09/29/lstep-case-cream-puff/) |
| たこ焼き屋「えでん」 | 待ち時間が長い | 店頭 | 事前予約 | 待ち時間の短縮、売上増（数値なし） | 【公】[事例一覧](https://linestep.jp/lp/01/case.html) |
| （匿名）居酒屋チェーン／カフェ／飲食店 | — | — | — | リピーター率20%→35%（MARKELINE、店名なし）。リピート率30%→55%（note、架空人物と思われる例）。予約完了率約3倍（LFLOW、リッチメニュー改修） | 【代】[MARKELINE](https://www.lstepoffcial.com/column/lstep-repeater/)、[note](https://note.com/rapid_nerine5395/n/nca896c788f87)、[LFLOW](https://lflow.net/column/column-lstep-katsuyou-jirei/) ※実在の事例かどうか確認できない |

### F. 参考：他ツール（Lステップではない）

| ツール／事業者 | 内容 | 出典 |
|---|---|---|
| L Message（エルメ）／Melhoria（女性専用整体サロン） | 友だち情報を簡易カルテに使う、誕生日1週間前のクーポン自動配布、最終来店から3ヶ月以上たった人に近況確認を自動送信。数値成果の記載はなし | 【他】[エルメ公式インタビュー](https://lme.jp/manual/interview-melhoria/)、[@Press](https://www.atpress.ne.jp/news/9756916) |
| エルメ／美容室 Number76 Tokyo | チャットによる事前カウンセリングで顧客満足度が向上（数値なし） | 【他】[lme.jp 美容室記事](https://lme.jp/media/line/hair-salon/) |
| プロライン | 店舗型の事例は検索では見つからなかった | — |

---

## どの店舗型業種の事例が多いか。数値付きの事例はどれか

### Takeaway
提供元サイトの事例では、**美容サロン（美容室・ヘアカラー・まつげ・エステ）と、整体・接骨院・ストレッチ**が特に多い。次いでパーソナルジム、美容クリニック、飲食店の順。数値付きの事例は美容系と整体系に集中している。歯科と習い事教室の事例は少なく、数値も弱い。

### Cited Findings
- 提供元は業種別のまとめ記事を出している。「美容・エステサロン9選」「整体・接骨院5選」「スポーツ事業7選」「教育事業8選」「複数店舗運営3選」「予約管理機能11選」など — [美容9選](https://linestep.jp/2021/03/15/beautiful/)、[整体5選](https://linestep.jp/2026/02/28/chiropractic-care-study/)、[スポーツ7選](https://linestep.jp/2026/02/17/sports-case-study)、[教育8選](https://linestep.jp/2026/04/03/education-case-study/)、[複数店舗3選](https://linestep.jp/2026/03/15/multiple-stores-case-study/)、[予約11選](https://linestep.jp/2025/03/28/reserve-case-study/)
- 数値付きの主な事例（いずれも提供元・代理店の自己申告）
  - 美容室ReSPEC：2通の配信で売上203万円 — [linestep.jp](https://linestep.jp/2024/10/23/lstep-case-hair-salon-respec/)
  - ベイコローレ：客単価1.8倍、売上倍増 — [linestep.jp](https://linestep.jp/2024/10/01/lstep-case-hair-color/)
  - FAST LASH：新規5.5倍、売上2.4倍 — [linestep.jp](https://linestep.jp/2024/02/15/lstep-case-eyelash-salon/)
  - シミケアサロン：予約率43%、コース契約率66% — [linestep.jp](https://linestep.jp/2026/05/06/lstep-case-beauty-salon-3/)
  - 美容クリニック：リピート率20%→80% — [linestep.jp](https://linestep.jp/2024/12/28/lstep-case-beauty-clinic/)
  - エルムクリニック：友だち数2.4倍、予約タップ数1.7倍 — [linestep.jp](https://linestep.jp/2026/05/13/lstep-case-beauty-clinic-2/)
  - 楓月：広告費1/3で新規15倍 — [linestep.jp](https://linestep.jp/2023/12/23/lstep-case-chiropractic-clinic/)
  - 篠丸接骨院：回数券購入率 約50%→約70% — [linestep.jp](https://linestep.jp/2022/11/20/shinomaru-interview/)
  - 鍼灸院：カウンセリング時間1/2、成約率80% — [linestep.jp](https://linestep.jp/2024/04/25/lstep-case-acupuncture-clinic/)
  - フィットネスジム：無料体験1.5倍、集客コスト半減 — [linestep.jp](https://linestep.jp/2025/09/15/lstep-case-fitness-gym/)
  - ELEMENT：1ヶ月で友だち275件・体験70件 — [linestep.jp](https://linestep.jp/lp/01/case_12.html)
  - CoCo壱番屋FC：3ヶ月で友だち7,200人超 — [linestep.jp](https://linestep.jp/lp/01/case.html)
- 提供元の事例記事は、多くが「Lステップ正規代理店」による寄稿として告知されている（例：美容クリニックの事例はLFLOWの米澤氏、美容サロンの事例は近藤氏） — [X告知1](https://x.com/lstep_jp/status/1875362178129330349)、[X告知2](https://x.com/lstep_jp/status/1826426225755390179)
- 歯科医院は「予約管理がアナログで、無断キャンセルが多かった」という課題は載っているが、抜粋には数値がない — [予約11選](https://linestep.jp/2025/03/28/reserve-case-study/)。代理店JPMは美容・歯科で「平均月商約1,500万円アップ」をうたっている — [JPM](https://jpm-marketing.jp/works/biyou-dental/)

### Inferences
- 予約型でLTV（顧客生涯価値）が大きい業種、つまり回数券・コース・継続施術がある業種に事例が偏っている。Lステップのタグ管理・シナリオ・カレンダー予約がそのまま売上に結びつきやすい構造だと考えられる。
- 数値のうち「売上◯倍」「新規◯倍」は、比較期間や母数が抜粋からは分からない。施策の効果とツールの効果を切り分けるのは難しい。

### Gaps
- WebFetch が使えず、各記事の本文（友だち数・期間・母数・プラン）を確認できなかった。
- 歯科医院と習い事教室の具体的な成果数値は見つからなかった。
- 業種ごとの事例件数を正確に数えた一次データ（提供元の事例総数の内訳）はない。

---

## 新規集客とリピート（再来店）、どちらで効いているか

### Takeaway
**両方に効いているが、業種によって効き方が違う**。広告やHPからの新規獲得では「友だち追加後のシナリオで予約・契約へ転換させる」形で効いている（整体の広告、Instagram広告のサロン、ジムの体験申込）。美容サロン・クリニック・ストレッチ店では、既存客の再来店・回数券・コース化といった**リピートとLTV向上**で効いている事例が多い。飲食店は友だち数の獲得とポイント・ガチャによる再訪促進が中心で、売上数値はほとんど出ていない。

### Cited Findings
- 新規側の事例
  - 楓月：LINE広告で「60万円かけても新規1件」だったが、Lステップ導入後は広告費1/3で新規集客15倍 — [linestep.jp](https://linestep.jp/2023/12/23/lstep-case-chiropractic-clinic/)、[MARKELINE](https://www.lstepoffcial.com/case_post/4105/)
  - シミケアサロン：Instagramストーリー広告→LINEで予約率43% — [linestep.jp](https://linestep.jp/2026/05/06/lstep-case-beauty-salon-3/)
  - ELEMENT：HPのポップアップ＋診断コンテンツで、1ヶ月に体験申込70件 — [case_12](https://linestep.jp/lp/01/case_12.html)
  - フィットネスジム：紹介制度で無料体験1.5倍 — [linestep.jp](https://linestep.jp/2025/09/15/lstep-case-fitness-gym/)
- リピート側の事例
  - 美容クリニック：リピート率20%→80%。新規:既存の売上（予約）比率が7:3→3:7に逆転 — [linestep.jp](https://linestep.jp/2024/12/28/lstep-case-beauty-clinic/)、[LFLOW](https://lflow.net/column/line-operation-for-beauty-clinic/)
  - ストレッチ専門店：施術後15/30/60日に自動フォローし、来院率とリピート率が向上 — [linestep.jp](https://linestep.jp/2024/11/18/lstep-case-stretch/)
  - 篠丸接骨院：回数券購入率 約50%→約70% — [linestep.jp](https://linestep.jp/2022/11/20/shinomaru-interview/)
  - 美容サロン：LINE経由の予約が30%→50% — [linestep.jp](https://linestep.jp/2024/08/20/lstep-case-beauty-salon-2/)
- 業務効率（第三の効き方）
  - ベイコローレ：1時間の対応人数3→4人 — [linestep.jp](https://linestep.jp/2024/10/01/lstep-case-hair-color/)
  - 鍼灸院：カウンセリング1/2 — [linestep.jp](https://linestep.jp/2024/04/25/lstep-case-acupuncture-clinic/)
  - おはよう接骨院：ダブルブッキング解消 — [case_102](https://linestep.jp/lp/01/case_102.html)
  - FAST LASH：同意書・カウンセリングシートのLINE化 — [linestep.jp](https://linestep.jp/2024/02/15/lstep-case-eyelash-salon/)
- 飲食店
  - CoCo壱番屋FC：3ヶ月で友だち7,200人超、ガチャやポイントで再訪を促進 — [事例一覧](https://linestep.jp/lp/01/case.html)
  - シュークリーム専門店：オープン初月にLINE登録3,000人 — [linestep.jp](https://linestep.jp/2025/09/29/lstep-case-cream-puff/)

### Inferences
- 店舗型では「既存客をLINEに囲い込み、来店周期に合わせて自動フォローする」使い方が最も多く、再現性も高そうに見える。一方、新規獲得の大きな数値（15倍・5.5倍など）は広告や診断コンテンツと組み合わせた成果で、Lステップ単体の効果ではない。
- 飲食店は客単価が低く来店頻度が高いので、友だち数・ガチャ・ポイントといったエンゲージメント指標が中心になり、売上や再来店率の数値はほとんど公開されていない。

### Gaps
- 飲食店の再来店率・売上の数値で、実名・一次情報のものは見つからなかった（MARKELINE の20%→35%は店名がなく、note の30%→55%は架空と思われる例）。
- 無断キャンセル率を「◯%→◯%」の形で示した事例は見つからなかった（ベイコローレの「ほぼゼロ」が最も具体的）。

---

## ホットペッパー等の予約サイトからLINEへ切り替える動きはあるか（手数料削減）

### Takeaway
**動きはあるが、「完全移行」ではなく「新規は予約サイト、2回目以降はLINE」という併用・段階移行が主流**。提供元自身が「プラットフォーム依存からの脱却」を訴求している。ただし、HPB手数料の削減額を実数値で示した店舗事例は見つからなかった。

### Cited Findings
- 提供元の公式ブログ（2024-07）は、外部予約サイトでは予約ごとに手数料がかかり「年間で見ると手数料だけでも数十万円」と試算している。そのうえで、2回目以降の来店をLINEで予約してもらい、集客口を増やして掲載費用を下げる流れを提案している — [linestep.jp](https://linestep.jp/2024/07/04/beautiful-breakaway-from-platform/)
- 予約サイト・HP・電話の併用でダブルブッキングが起きていた接骨院が、予約をLINEに一元化した — [case_102](https://linestep.jp/lp/01/case_102.html)
- ストレッチ専門店は既存の予約システムを解約してLステップのカレンダー予約に一本化し、来店予約の約90%がLINE経由になった — [linestep.jp](https://linestep.jp/2024/11/18/lstep-case-stretch/)
- 美容サロンでLINE経由の予約が全体の30%→50%（半年） — [linestep.jp](https://linestep.jp/2024/08/20/lstep-case-beauty-salon-2/)
- ヘアカラー専門店ベイコローレは、LINE予約に一本化したあともホットペッパービューティーへの掲載を続けている（併用の実例） — [HPB](https://beauty.hotpepper.jp/slnH000629883/)、[linestep.jp](https://linestep.jp/2024/10/01/lstep-case-hair-color/)
- 代理店側の記事では次のように書かれている。「Lステップはホットペッパーと直接連携できない」。HPB経由の客をLINEに変換するには、レジ横やカウンセリングシートのQRを使う。「脱HPBは一部移行が一般的」。「HPB依存を脱却し売上約20%増」という記載もある（店名なし） — [LFLOW](https://lflow.net/column/biyoushitsu-line-katsuyou/)、[balsa](https://media.balsa.co.jp/beautysalon-example/)
- AI予約の事例記事も「新規はホットペッパー、リピーターは自社予約に誘導」という併用論 — [ai-industry.jp](https://ai-industry.jp/beauty-salon-ai-reservation-case-study/)
- 匿名の美容室オーナーが「リピート率38%→71%」と証言している。ただし店名がなく、事実確認はできない — [haward-joyman.com](https://haward-joyman.com/%E7%BE%8E%E5%AE%B9%E5%AE%A4%E3%81%AE%E8%87%AA%E7%A4%BE%E9%9B%86%E5%AE%A2%E3%81%B8%E3%81%AE%E5%88%87%E3%82%8A%E6%9B%BF%E3%81%88%E3%80%816%E3%83%B6%E6%9C%88%E8%A8%88%E7%94%BB%E3%81%AE%E5%85%B7%E4%BD%93/)

### Inferences
- 「LINE経由の予約比率」はHPBへの依存度を表す実質的な指標になっている（30%→50%、約90%）。手数料の削減額そのものを公表しないのは、比較の前提が店ごとに違うためと考えられる。
- 新規客の獲得をHPBに頼る構造は残っており、ポータル予約サイトの「置き換え」というより「出口」を作る動きと見るのが妥当。

### Gaps
- HPBの掲載プランを下げた、あるいは手数料が◯万円減ったという実名の事例は見つからなかった。
- HPBを完全にやめたあと新規が減った、といった逆効果の事例も見つからなかった。

---

## 効果が出なかった・解約した・やりすぎてブロックされたなどの失敗例

### Takeaway
**実名の店舗の失敗事例は見つからなかった**。失敗パターンは代理店・制作会社のコラムに一般論として書かれているだけで、数値の裏付けもない。主な失敗パターンは次のとおり。
- 配信頻度が多すぎてブロック率が急上昇する
- 一斉配信に頼る
- 構築代行に任せきりで運用できない
- 成果が出ずに解約する（データのバックアップ不足）

### Cited Findings
- 毎日何度も配信するとブロックや解約につながる。新商品情報は週1回程度など、強弱を付けることが推奨されている — [GreenHill](https://g-hill.jp/line/3122/)
- 「配信頻度の調整ミスでブロック率が急上昇」するのはよくある失敗とされ、ブランドイメージの低下にもつながる — [bluedine](https://bluedine.co.jp/lstep-common-mistakes-guide/)
- 一斉配信をやめてセグメント配信にし、反応の低い層への配信を止めること、週1〜2回を目安にすることが推奨されている — [evridge](https://www.evridge.co.jp/post/l_0518)、[bluedine デメリット](https://bluedine.co.jp/lstep-disadvantages/)
- 誤配信が起きたら、速やかにお詫びを送るとブロック率の急増を抑えられる — [fubar](https://fubar.co.jp/column/531/)
- 「成果が出ない」ことを理由に解約するケースがある。解約前に友だちリストとシナリオをバックアップすることが推奨されている — [禅](https://zen-web.co.jp/column/column-lstep-cancellation/)、[fubar 解約](https://fubar.co.jp/column/3104/)
- 構築代行に依頼して「解約したい」となる失敗パターン（代理店自身のコラム） — [LFLOW](https://lflow.net/column/failure-pattern-of-lstep-construction-agency/)
- 「Lステップは本当に必要か」という導入判断の記事もあり、小規模なら不要な場合もあるという立場 — [LFLOW](https://lflow.net/column/lstep-really-necessary/)
- 導入前の失敗の例として、楓月は「LINE広告に60万円で新規1件」。これはLステップ導入前のLINE広告の失敗事例 — [linestep.jp](https://linestep.jp/2023/12/23/lstep-case-chiropractic-clinic/)

### Inferences
- 提供元と代理店が発信する情報は成功例に偏っている（生存者バイアス）。失敗の情報は、代理店が自社サービスへ誘導するための一般論として出てくるだけ。
- 店舗型は友だちの母数が小さいので、ブロックされると「1人あたりの損失」が大きい。だからこそ、どの成功事例もセグメント配信と来店周期に合わせた自動フォローを強調していると考えられる。

### Gaps
- 店舗のブロック率の実数（導入前後の変化）を公開した事例はなかった。
- 解約した店舗の実名インタビュー、口コミサイト（ITreview など）での店舗事業者の否定的レビューは今回確認できていない。

---

## 友だち数の規模感（何人くらいで導入しているか）、使っているプラン

### Takeaway
店舗事例の友だち数は**数十人規模の小さな店（月40人増、初月100人）から数千人規模（初月3,000人、3ヶ月で7,200人、月500〜600人増）まで幅がある**。ただし本文が読めず、大半の事例で総数やプランは確認できなかった。料金は**2025年6月にフリープランが新設**され、店舗ではスタンダード（月21,780円）が基準になっているとみられる。プランを明記した店舗事例は「整体院がプロプラン」の1件だけ。

### Cited Findings
- 友だち数の目安になる記述
  - まるみつ（郡上市の飲食）：店頭QRだけで月平均約40人 — [事例一覧](https://linestep.jp/lp/01/case.html)
  - 美容サロン：公開初月に100人（要確認） — [linestep.jp](https://linestep.jp/2024/08/20/lstep-case-beauty-salon-2/)
  - ELEMENT：1ヶ月で275件。別ソースでは月500〜600名 — [case_12](https://linestep.jp/lp/01/case_12.html)、[balsa](https://balsa.co.jp/work/l-step/case-element/)
  - シュークリーム専門店：初月3,000人 — [linestep.jp](https://linestep.jp/2025/09/29/lstep-case-cream-puff/)
  - CoCo壱FC（4店舗）：3ヶ月で7,200人超 — [事例一覧](https://linestep.jp/lp/01/case.html)
  - やっぱりステーキ：85店舗分を1アカウントに集約 — [case_126](https://linestep.jp/lp/01/case_126.html)
  - エルムクリニック：友だち数2.4倍（実数は不明） — [linestep.jp](https://linestep.jp/2026/05/13/lstep-case-beauty-clinic-2/)
- プランを明記した事例：整体院（片木整体組）がプロプランで予約と顧客管理を一本化 — [line-consultant.biz](https://line-consultant.biz/lstep-pro-katagiseitaigumi/)
- 予約管理機能は、各プランの中で最も安い「スタートプラン」から使えるとされる — [予約11選](https://linestep.jp/2025/03/28/reserve-case-study/)（検索要約による）
- 料金
  - 2025年6月にフリープラン（0円、月200通、シナリオ1個まで）を新設 — [markelink](https://markelink.biz/article/lstep_price-2/)、[cliand](https://cliand.co.jp/blog/lstep-plan/)
  - スタンダード 月21,780円（税込、月30,000通） — [balsa](https://media.balsa.co.jp/lstep-standardplan)
  - プロ 月32,780円 — [note](https://note.com/grand_fennel2203/n/n1ee0a1ce18f3)
  - スタートは5,000円／5,500円／2,980円と記事によってばらばら（不一致） — [note](https://note.com/grand_fennel2203/n/n1ee0a1ce18f3)、[cliand](https://cliand.co.jp/blog/lstep-plan/)
  - 2023年6月1日にも料金を改定 — [note キッシュ](https://note.com/mori_tetsugaku/n/nf1877a4f1a29)
- プランごとの友だち数の目安も記事によって違う
  - 「スタンダードは友だち1,000〜5,000人規模に最適」とする記事がある
  - 「フリー50人／スタート500人／スタンダード5,000人」とする記事もある
  - いずれも代理店の目安で、公式の基準ではない — [WEB FLEEK](https://blog.webfleek.jp/archives/358)、[japan-feux-france](https://www.japan-feux-france.com/column/lstep-ryokin-guide)

### Inferences
- 個人店（友だち数百人規模）でも導入している。リマインドや予約を使うならスタート以上、セグメント配信・流入経路分析・回答フォームを本格的に使うならスタンダード以上が現実的とみられる。ただし、機能とプランの対応は公式の料金ページで確認が必要。
- 構築代行の費用（数十万円規模と言われることが多い）は今回確認できていない。月額よりも構築費の方が、店舗にとって導入のハードルになっている可能性がある（推測）。

### Gaps
- 店舗事例の大半で、友だちの総数・使っているプラン・構築費を確認できなかった（本文を取得できなかったため）。
- 流入経路分析（QR別・媒体別の登録数）を数値で示した店舗事例は見つからなかった。
- Google マップ（GBP）からの流入を明示した事例は見つからなかった。
