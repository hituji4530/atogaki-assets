// 提案ページとスライドで共通の、design.json の読み替え（テンプレートに埋め込んで使う）
window.LineModel = (D) => {
  const P = D.proposal || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = D.account || 'お店';
  const persona = P.persona || { name: D.first_friend || 'さくら' };
  const nameOf = (t) => String(t || '').replaceAll('{name}', persona.name || 'お客さま');

  // "0" "30m" "3h" "1d" "1d12h" → 分
  const toMin = (v) => {
    const s = String(v ?? '0').replace(/\s/g, '');
    if (/^\d+$/.test(s)) return Number(s);
    const m = s.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/);
    return m ? (Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  };
  // 分 → ［見出し, 補足］
  const when = (min) => {
    if (min === 0) return ['友だち追加の直後', ''];
    const d = min / 1440;
    if (Number.isInteger(d)) {
      if (d === 1) return ['翌日', ''];
      if (d === 7) return ['1週間後', ''];
      if (d === 14) return ['2週間後', ''];
      if (d % 30 === 0) return [`${d / 30}か月後`, ''];
      if (d > 30) return [`${d}日後`, `約${Math.round(d / 30 * 2) / 2}か月`];
      return [`${d}日後`, ''];
    }
    if (min % 60 === 0) return [`${min / 60}時間後`, ''];
    return [`${min}分後`, ''];
  };

  const tagDefs = Object.fromEntries((D.tags || []).map((t) => [t.name, t]));
  const choiceLabel = {};
  (D.scenarios || []).forEach((sc) => (sc.steps || []).forEach((st) => (st.choices || []).forEach((c) => {
    if (c.tag) choiceLabel[c.tag] = c.label;
  })));
  const whoOf = (tag) => tagDefs[tag]?.who || (choiceLabel[tag] ? `「${choiceLabel[tag]}」を選んだ人` : `「${tag}」の人`);

  const personaChoice = persona.choice_tag;
  const events = (P.story || []).map((e) => ({ min: toMin(e.after), text: e.text, label: e.label || 'お客さまの行動', adds: e.adds_tag }));
  // その時点でペルソナが持っているタグ（選んだ興味＋それより前の行動）。同じ時刻の行動は、メッセージを受け取ったあとに起きたものとして扱う
  const tagsAt = (m) => new Set([personaChoice, ...(persona.tags || []), ...events.filter((e) => e.min < m && e.adds).map((e) => e.adds)].filter(Boolean));

  // トークの吹き出し。pick のときはペルソナが選択肢を押したところまで描く
  const bubbles = (st, opts = {}) => {
    let html = `<div class="b">${esc(nameOf(st.text))}</div>`;
    if (st.choices?.length) {
      html += `<div class="chips">${st.choices.map((c) => `<span class="${c.tag === personaChoice && opts.pick ? 'on' : ''}">${esc(c.label)}</span>`).join('')}</div>`;
      const picked = st.choices.find((c) => c.tag === personaChoice);
      if (picked && opts.pick) {
        html += `<div class="b me">${esc(picked.label)}</div>`;
        if (picked.reply) html += `<div class="b">${esc(nameOf(picked.reply))}</div>`;
      }
    }
    return html;
  };

  const follow = (D.scenarios || []).find((s) => s.trigger === 'follow') || (D.scenarios || [])[0] || { steps: [] };
  const groups = new Map();
  (follow.steps || []).forEach((st) => {
    const m = toMin(st.after);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(st);
  });
  // 新しい友だち1人あたり、時間差で届く通数（ペルソナの興味で数える）
  const perPerson = (follow.steps || []).filter((st) => toMin(st.after) > 0 && (!st.only_tag || st.only_tag === personaChoice)).length;

  return { D, P, store, persona, nameOf, esc, toMin, when, whoOf, personaChoice, events, tagsAt, bubbles, follow, groups, perPerson };
};
