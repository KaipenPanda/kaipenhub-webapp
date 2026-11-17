/* analysis.js: сравнение матча игрока со средним по герою.
   Только факты: цифры и отклонения, без оценки решений. */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .analysis { padding: 8px 10px; margin: 4px 0 8px; border-radius: 10px; background: rgba(127,127,127,.12); }
    .arow { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 6px; padding: 3px 0; font-size: 13px; }
    .arow div:not(:first-child) { text-align: right; }
    .ahead { opacity: .6; font-size: 12px; }
    .asum { margin: 6px 0 2px; font-size: 13px; }
  `;
  document.head.appendChild(style);

  const windowCache = {};

  function fmt(x) {
    return Math.abs(x) >= 1000
      ? Math.round(x).toLocaleString("ru-RU")
      : (Math.round(x * 10) / 10).toLocaleString("ru-RU");
  }

  function diffPct(you, avg) {
    return avg > 0 ? (you - avg) / avg * 100 : null;
  }

  function diffText(d) {
    return d === null ? "-" : (d >= 0 ? "+" : "−") + Math.abs(Math.round(d)) + "%";
  }

  function diffClass(d, higherIsBetter) {
    if (d === null) return "";
    const good = higherIsBetter ? d : -d;
    return good >= 10 ? "good" : good <= -10 ? "bad" : "";
  }

  // Статистика героев за матчи похожей длительности (окна по 5 минут, чтобы переиспользовать запросы)
  async function getWindowStats(lo, hi) {
    const key = lo + "-" + hi;
    if (windowCache[key]) return windowCache[key];
    const params = new URLSearchParams({
      min_unix_timestamp: Math.floor(Date.now() / 1000) - 30 * 86400,
      min_duration_s: lo,
      max_duration_s: hi
    });
    const stats = await getJson(`/v1/analytics/hero-stats?${params}`);
    windowCache[key] = stats;
    return stats;
  }

  async function buildAnalysis(m, nameMap) {
    const wrap = el("div");

    if (m.player_match_outcome !== 1 && m.player_match_outcome !== 2) {
      wrap.appendChild(el("div", "Матч не засчитан: сравнивать его со средним не имеет смысла.", "muted"));
      return wrap;
    }

    const center = Math.round(m.match_duration_s / 300) * 300;
    const lo = Math.max(0, center - 300);
    const hi = Math.min(7000, center + 300);
    const stats = await getWindowStats(lo, hi);
    const row = stats.find(h => h.hero_id === m.hero_id);

    if (!row || row.matches < 30) {
      wrap.appendChild(el("div", "Мало данных для сравнения: у этого героя слишком мало матчей такой длительности.", "muted"));
      return wrap;
    }

    const n = row.matches;
    const metrics = [
      ["Убийства", m.player_kills, row.total_kills / n, true],
      ["Смерти", m.player_deaths, row.total_deaths / n, false],
      ["Помощь", m.player_assists, row.total_assists / n, true],
      ["KDA", (m.player_kills + m.player_assists) / Math.max(m.player_deaths, 1),
              (row.total_kills + row.total_assists) / Math.max(row.total_deaths, 1), true],
      ["Добито", m.last_hits, row.total_last_hits / n, true],
      ["Денаи", m.denies, row.total_denies / n, true],
      ["Души", m.net_worth, row.total_net_worth / n, true]
    ];

    const heroName = nameMap[m.hero_id] || ("#" + m.hero_id);
    wrap.appendChild(el("b", "Сравнение со средним: " + heroName));

    const head = el("div", undefined, "arow ahead");
    ["Показатель", "Ты", "Среднее", "Разница"].forEach(t => head.appendChild(el("div", t)));
    wrap.appendChild(head);

    metrics.forEach(([label, you, avg, higherIsBetter]) => {
      const d = diffPct(you, avg);
      const r = el("div", undefined, "arow");
      r.appendChild(el("div", label));
      r.appendChild(el("div", fmt(you)));
      r.appendChild(el("div", fmt(avg)));
      r.appendChild(el("div", diffText(d), diffClass(d, higherIsBetter)));
      wrap.appendChild(r);
    });

    // Что сильнее всего отличается от среднего (KDA не берём: он считается из других строк)
    const top = metrics
      .filter(x => x[0] !== "KDA")
      .map(x => ({ label: x[0], d: diffPct(x[1], x[2]) }))
      .filter(x => x.d !== null)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 2);
    if (top.length > 0) {
      wrap.appendChild(el("div",
        "Сильнее всего отличается от среднего: " +
        top.map(x => `${x.label} ${diffText(x.d)}`).join(", ") + ".", "asum"));
    }

    wrap.appendChild(el("div",
      `Среднее по ${n.toLocaleString("ru-RU")} матчам этого героя за 30 дней длительностью ` +
      `${Math.round(lo / 60)}–${Math.round(hi / 60)} мин, все ранги. В среднее входят и победы, ` +
      `и поражения. Это сравнение цифр, а не оценка твоих решений.`, "muted"));
    return wrap;
  }

  async function toggleAnalysis(m, nameMap, row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains("analysis")) { next.remove(); return; }   // второе нажатие закрывает
    const box = el("div", "Считаю...", "analysis muted");
    row.after(box);
    try {
      box.replaceChildren(await buildAnalysis(m, nameMap));
      box.className = "analysis";
    } catch (e) {
      box.textContent = "Не удалось сделать разбор: " + e.message;
    }
  }

  window.toggleAnalysis = toggleAnalysis;
})();
