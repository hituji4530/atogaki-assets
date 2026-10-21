#!/usr/bin/env python3
"""LINE設計（design.json）から、本番投入用のSQLと、ブラウザで動くデモHTMLを作る。

使い方:
  python3 build_line_demo.py design.json --out-dir 出力先 [--template demo-template.html またはURL]

出力:
  <slug>.sql        … line-cloudflare の D1 に流し込む設計データ（初期構築用）
  <slug>-demo.html  … クライアントに見せられる動くデモ（Artifact としてそのまま公開できる）
  <slug>-proposal.html … クライアント向けの提案ページ（お客さまの体験・自動の返事・できること・費用の比較・納品後のコスト）
  <slug>-slides.html   … 同じ内容の16:9スライド（商談で画面共有して使う）

標準ライブラリだけで動く。設計にLINEの制限違反があればエラーで止まる。
"""
import argparse
import html as htmllib
import json
import re
import sys
import urllib.request
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
PROPOSAL_MARKER = '<!--LINE_PROPOSAL-->'
# 提案ページとスライド（同じ design.json から作る）
PROPOSAL_OUTPUTS = (
    ('proposal-template.html', 'proposal', 'LINE活用のご提案'),
    ('slides-template.html', 'slides', 'LINE活用のご提案（スライド）'),
)
DEFAULT_TEMPLATE = 'https://raw.githubusercontent.com/hituji4530/atogaki-assets/main/line-cloudflare/demo-template.html'
MARKER = '<!--LINE_DESIGN-->'

# LINE Messaging API の制限
MAX_TEXT = 5000
MAX_POSTBACK_DATA = 300
MAX_QUICK_ITEMS = 13
MAX_QUICK_LABEL = 20
MAX_REPLY_MESSAGES = 5


class DesignError(Exception):
    pass


def parse_after(value, where):
    """"0" "30m" "3h" "1d" "1d12h" → 分"""
    s = str(value).strip().replace(' ', '')
    if s in ('0', ''):
        return 0
    if s.isdigit():
        return int(s)
    m = re.fullmatch(r'(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?', s)
    if not m or not any(m.groups()):
        raise DesignError(f'{where}: after は "0" "30m" "3h" "1d" "1d12h" の形式で書いてください（"{value}"）')
    d, h, mi = (int(g or 0) for g in m.groups())
    return d * 1440 + h * 60 + mi


def encode_param(s):
    # URLSearchParams で読めるよう、区切り文字だけ逃がす（日本語はそのままで文字数を節約）
    return s.replace('%', '%25').replace('&', '%26').replace('=', '%3D').replace('+', '%2B')


def step_message(step, where):
    text = (step.get('text') or '').strip()
    if not text:
        raise DesignError(f'{where}: text が空です')
    if len(text) > MAX_TEXT:
        raise DesignError(f'{where}: text が{MAX_TEXT}文字を超えています')
    choices = step.get('choices') or []
    if not choices:
        return text
    if len(choices) > MAX_QUICK_ITEMS:
        raise DesignError(f'{where}: 選択肢は{MAX_QUICK_ITEMS}個までです')
    items = []
    for i, c in enumerate(choices):
        label = (c.get('label') or '').strip()
        if not label or len(label) > MAX_QUICK_LABEL:
            raise DesignError(f'{where} 選択肢{i + 1}: label は1〜{MAX_QUICK_LABEL}文字にしてください（"{label}"）')
        parts = []
        for key, src in (('tag', 'tag'), ('reply', 'reply'), ('scenario', 'start_scenario')):
            if c.get(src):
                parts.append(f'{key}={encode_param(str(c[src]))}')
        data = '&'.join(parts) or f'label={encode_param(label)}'
        if len(data) > MAX_POSTBACK_DATA:
            raise DesignError(f'{where} 選択肢「{label}」: タグ＋返信文が長すぎます（{len(data)}/{MAX_POSTBACK_DATA}文字）。reply を短くしてください')
        items.append({'type': 'action', 'action': {'type': 'postback', 'label': label, 'data': data, 'displayText': label}})
    return json.dumps({'type': 'text', 'text': text, 'quickReply': {'items': items}}, ensure_ascii=False)


def q(v):
    return 'NULL' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"


def build_sql(design):
    lines = [
        '-- line-builder で生成した設計データ（初期構築用：既存のシナリオ・キーワード・配信進行をリセットします）',
        'DELETE FROM step_deliveries;',
        'DELETE FROM enrollments;',
        'DELETE FROM scenario_steps;',
        'DELETE FROM scenarios;',
        'DELETE FROM keyword_rules;',
    ]
    warnings = []
    scenarios = design.get('scenarios') or []
    if not scenarios:
        raise DesignError('scenarios が1つもありません')
    names = set()
    starts = []
    tag_defs = [t for t in design.get('tags') or [] if t.get('name')]
    known_tags = {t['name'] for t in tag_defs}
    # set_by に「手動」とあるタグは、管理画面でスタッフが付ける前提
    set_tags = {t['name'] for t in tag_defs if '手動' in str(t.get('set_by', ''))}
    ref_tags = set()

    for si, sc in enumerate(scenarios, 1):
        name = (sc.get('name') or '').strip()
        if not name or name in names:
            raise DesignError(f'シナリオ{si}: name が空か重複しています')
        names.add(name)
        trigger = 'follow' if sc.get('trigger') == 'follow' else 'manual'
        lines.append(f'INSERT INTO scenarios (id, name, trigger) VALUES ({si}, {q(name)}, {q(trigger)});')
        immediate = 0
        for ti, st in enumerate(sc.get('steps') or [], 1):
            where = f'シナリオ「{name}」ステップ{ti}'
            offset = parse_after(st.get('after', '0'), where)
            if offset == 0:
                immediate += 1
            msg = step_message(st, where)
            for c in st.get('choices') or []:
                if c.get('tag'):
                    set_tags.add(c['tag'])
                if c.get('start_scenario'):
                    starts.append((where, c['start_scenario']))
            for key in ('only_tag', 'except_tag'):
                if st.get(key):
                    ref_tags.add(st[key])
            lines.append(
                'INSERT INTO scenario_steps (scenario_id, offset_minutes, message, require_tag, exclude_tag, created_at) '
                f'VALUES ({si}, {offset}, {q(msg)}, {q(st.get("only_tag"))}, {q(st.get("except_tag"))}, 0);'
            )
        if immediate > MAX_REPLY_MESSAGES:
            warnings.append(f'シナリオ「{name}」: 直後に送る吹き出しが{immediate}個あります。無料の返信で送れるのは{MAX_REPLY_MESSAGES}個までで、残りは通数がかかります')

    for ki, kw in enumerate(design.get('keywords') or [], 1):
        word = (kw.get('keyword') or '').strip()
        if not word:
            raise DesignError(f'キーワード{ki}: keyword が空です')
        if kw.get('start_scenario') and kw['start_scenario'] not in names:
            raise DesignError(f'キーワード「{word}」: start_scenario「{kw["start_scenario"]}」というシナリオがありません')
        if kw.get('tag'):
            set_tags.add(kw['tag'])
        match = 'exact' if kw.get('match') == 'exact' else 'contains'
        lines.append(
            'INSERT INTO keyword_rules (keyword, match_type, reply, add_tag, start_scenario) '
            f'VALUES ({q(word)}, {q(match)}, {q(kw.get("reply"))}, {q(kw.get("tag"))}, {q(kw.get("start_scenario"))});'
        )

    for where, target in starts:
        if target not in names:
            raise DesignError(f'{where}: start_scenario「{target}」というシナリオがありません')
    for t in sorted(ref_tags - set_tags):
        warnings.append(f'タグ「{t}」を配信の条件に使っていますが、付く導線がありません（選択肢・キーワードで付けるか、tags の set_by に「手動」と書いてください）')
    for t in sorted((set_tags | ref_tags) - known_tags):
        warnings.append(f'タグ「{t}」が tags に定義されていません（設計書に意味を書いておくと運用で迷いません）')
    for t in sorted(known_tags - set_tags - ref_tags):
        warnings.append(f'タグ「{t}」は定義だけで、どこからも付かず、使われてもいません')
    return '\n'.join(lines) + '\n', warnings


def load_template(src):
    if re.match(r'https?://', src):
        with urllib.request.urlopen(src, timeout=30) as res:
            return res.read().decode('utf-8')
    return Path(src).read_text(encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('design')
    ap.add_argument('--out-dir', default='.')
    ap.add_argument('--template', default=DEFAULT_TEMPLATE)
    ap.add_argument('--slug', help='出力ファイル名の頭（省略時は design.json のファイル名）')
    args = ap.parse_args()

    design = json.loads(Path(args.design).read_text(encoding='utf-8'))
    try:
        sql, warnings = build_sql(design)
    except DesignError as e:
        print(f'設計エラー: {e}', file=sys.stderr)
        sys.exit(1)

    template = load_template(args.template)
    if MARKER not in template:
        print(f'テンプレートに {MARKER} がありません: {args.template}', file=sys.stderr)
        sys.exit(1)
    payload = json.dumps(
        {'account': design.get('account', ''), 'firstFriend': design.get('first_friend', 'さくら'), 'sql': sql},
        ensure_ascii=False,
    ).replace('<', '\\u003c')
    html = template.replace(MARKER, f'<script>window.__DESIGN__ = {payload};</script>', 1)
    if design.get('account'):
        html = html.replace('<title>LINE配信ラボ</title>', f'<title>{htmllib.escape(design["account"])} LINE設計</title>', 1)

    proposal_json = json.dumps(design, ensure_ascii=False).replace('<', '\\u003c')
    libs = ''.join(f'<script>{(ASSETS / name).read_text(encoding="utf-8")}</script>\n' for name in ('model.js', 'pricing.js'))
    proposals = {}
    for template_name, kind, title in PROPOSAL_OUTPUTS:
        page = (ASSETS / template_name).read_text(encoding='utf-8')
        page = page.replace(PROPOSAL_MARKER, f'<script>window.__PROPOSAL__ = {proposal_json};</script>\n{libs}', 1)
        if design.get('account'):
            page = page.replace(f'<title>{title}</title>', f'<title>{htmllib.escape(design["account"])} {title}</title>', 1)
        proposals[kind] = page

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    slug = args.slug or Path(args.design).stem
    (out / f'{slug}.sql').write_text(sql, encoding='utf-8')
    (out / f'{slug}-demo.html').write_text(html, encoding='utf-8')
    print(f'OK: {out / (slug + ".sql")}')
    print(f'OK: {out / (slug + "-demo.html")}')
    for kind, page in proposals.items():
        (out / f'{slug}-{kind}.html').write_text(page, encoding='utf-8')
        print(f'OK: {out / f"{slug}-{kind}.html"}')
    if not design.get('proposal'):
        print('注意: proposal がないので、提案ページとスライドは最低限の内容です（SKILL.md の 3-1b を参照）')
    elif not (design['proposal'].get('pricing') or {}).get('initial'):
        print('注意: proposal.pricing（初期費用・月額）がないので、費用の比較に今回の金額が出ません')
    for w in warnings:
        print(f'注意: {w}')


if __name__ == '__main__':
    main()
