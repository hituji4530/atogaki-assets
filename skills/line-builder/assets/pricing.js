// 提案ページとスライドで共通の、費用比較とランニングコストの計算（テンプレートに埋め込んで使う）
window.LinePricing = (() => {
  // 一般的なLINE構築の相場（目安）。design.json の proposal.market で上書きできる
  const MARKET_DEFAULT = [
    { name: '構築だけ依頼し、Lステップを自社で運用', short: '構築のみ＋自社運用', initial: [100000, 300000], tool: [5000, 21780], service: [0, 0], note: '配信や改善はお店が自分で行う' },
    { name: '構築と運用をまとめて依頼', short: '構築＋運用代行', initial: [100000, 300000], tool: [5000, 21780], service: [30000, 50000], note: '運用代行のエントリープラン相当' },
  ];
  const SOURCE_DEFAULT = '相場は構築代行業者の公開記事（個人業者の初期費用10〜30万円、運用代行のエントリープラン月3〜5万円）と、比較サイト掲載のLステップ料金（スタート月5,000円〜スタンダード月21,780円）による目安です。';

  const yen = (n) => `${Math.round(n).toLocaleString()}円`;
  const man = (n) => {
    const v = n / 10000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}万円`;
  };
  const range = ([a, b], f = yen) => (a === b ? f(a) : `${f(a)}〜${f(b)}`);

  // LINE の料金プラン（月の配信数から）
  const linePlan = (msgs) => msgs <= 200 ? { name: 'コミュニケーション', fee: 0 }
    : msgs <= 5000 ? { name: 'ライト', fee: 5000 }
    : msgs <= 30000 ? { name: 'スタンダード', fee: 15000 }
    : { name: 'スタンダード＋追加', fee: 15000 + (msgs - 30000) * 3 };

  function build(P, perPerson) {
    const pr = P.pricing || {};
    const years = pr.years || 3;
    const months = years * 12;
    const market = (P.market || MARKET_DEFAULT).map((m) => {
      const total = [0, 1].map((i) => m.initial[i] + (m.tool[i] + m.service[i]) * months);
      const monthly = [0, 1].map((i) => m.tool[i] + m.service[i]);
      return { ...m, total, monthly };
    });
    const hasOurs = typeof pr.initial === 'number' && typeof pr.monthly === 'number';
    const ours = hasOurs ? {
      name: pr.label || '今回のご提案', short: '今回のご提案',
      initial: [pr.initial, pr.initial], tool: [0, 0], service: [pr.monthly, pr.monthly],
      monthly: [pr.monthly, pr.monthly], total: [pr.initial + pr.monthly * months, pr.initial + pr.monthly * months],
      note: pr.note || '配信ツール代なし。保守と月1回の改善提案込み',
    } : null;
    const rows = ours ? [...market, ours] : market;
    const max = Math.max(...rows.map((r) => r.total[1]));

    const c = P.cost || {};
    const bpm = c.broadcasts_per_month ?? 2;
    const ratio = c.new_ratio ?? 0.1;
    const running = (c.friends || [100, 300, 1000]).map((f) => {
      const msgs = f * bpm + Math.round(f * ratio) * perPerson;
      const plan = linePlan(msgs);
      return { friends: f, msgs, plan, upkeep: hasOurs ? pr.monthly : null, total: plan.fee + (hasOurs ? pr.monthly : 0) };
    });
    return { years, market, ours, rows, max, running, source: P.market_source || SOURCE_DEFAULT, bpm, ratio, pr };
  }

  return { build, yen, man, range };
})();
