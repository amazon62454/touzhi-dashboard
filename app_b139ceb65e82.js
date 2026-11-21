// ============================================================
// V2 H5 渲染引擎 · 2026-11-17 专项重构
// 架构：数据(h5_data.json) → 声明式页面Schema → 组件库 → 四态统一
// 原则：零依赖 · 文案零硬编码(text_templates) · 数值零硬编码(全部来自数据)
// ============================================================

let D = null;
let U = {};               // 界面文案（text_templates ui_ 前缀）
const $ = id => document.getElementById(id);

// ---------- 工具 ----------
const STATUS_LABELS = { '🔴': '【行动】', '⚠️': '【观察】', '🟢': '【正常】', '🟡': '【提示】', '💰': '【资金】' };
const statusText = v => String(v ?? '').replace(/🔴|⚠️|🟢|🟡|💰/g, c => STATUS_LABELS[c] || c);
// esc仅做HTML转义;状态emoji在显示文本时经statusText替换为文字(颜色只表达数值红涨绿跌,不表达状态)。
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null) ? o[k] : '');
const money = v => (v === null || v === undefined || v === '') ? '—' : `${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}元`;
const pct = v => (v === null || v === undefined || v === '') ? '—' : `${Number(v).toFixed(2)}%`;
const dateText = v => (v && v !== '未记录基准日') ? v : '未记录基准日';
const dateTimeText = v => has(v) ? String(v).replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}$/, '$1') : '';
const shortReason = v => v || '按SOP规则判定';
const has = v => v !== null && v !== undefined && v !== '';
const numTone = v => !has(v) || !Number.isFinite(Number(v)) ? 'zero' : Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : 'zero';
// 只执行引擎下发的结果展示期限；不计算动作有效期，不自行猜排程。
const resultExpired = v => has(v && v.result_visible_until)
  && Number.isFinite(Date.parse(v.result_visible_until)) && Date.now() >= Date.parse(v.result_visible_until);
const fundName = (fc, fallback) => {
  const mapped = D && D.fund_names && D.fund_names[String(fc)];
  const f = ((D && D.retirement && D.retirement.funds) || []).find(x => String(x.fund_code) === String(fc));
  return mapped || (f && f.fund_name) || fallback || (fc ? String(fc) : '');
};

// ---------- 组件库（纯函数 → HTML，样式全部走 class 不写行内样式） ----------
const C = {
  card(title, body, kind = '') {
    if (!body) return '';
    return `<div class="card ${kind}">${title ? `<h2>${title}</h2>` : ''}${body}</div>`;
  },
  kv(label, value, tone = '', note = '') {
    return `<div class="money-row"><span>${esc(label)}${note ? `<small> ${esc(note)}</small>` : ''}</span><strong class="num ${tone}">${value}</strong></div>`;
  },
  badge(text, kind = 'info') { return `<span class="badge ${kind}">${esc(text)}</span>`; },
  statusBadge(status) {
    const s = String(status || '');
    const kind = /🔴/.test(s) ? 'danger' : /⚠️/.test(s) ? 'warn' : /💰/.test(s) ? 'info' : /🟢/.test(s) ? 'ok' : 'muted';
    return C.badge(statusText(s) || '—', kind);
  },
  empty(title, note) {
    return `<div class="empty">${title ? `<div class="empty-title">${esc(title)}</div>` : ''}${note ? esc(note) : ''}</div>`;
  },
  metricGrid(items) {
    const rows = (items || []).filter(x => x).map(([label, value, tone = '']) =>
      `<div class="metric ${tone}"><div class="metric-label">${esc(label)}</div><div class="metric-value ${tone}">${esc(value)}</div></div>`).join('');
    return rows ? `<div class="metric-grid">${rows}</div>` : '';
  },
  checkMetrics(items) {
    if (!items || !items.length) return '';
    const rows = items.map(m => {
      const value = m.unit === '元' ? money(m.value) : `${esc(m.value)}${esc(m.unit || '')}`;
      return `<span class="check-metric"><span>${esc(m.label || '')}</span><strong class="num ${esc(m.tone || 'info')}">${value}</strong></span>`;
    }).join('');
    return `<div class="check-metrics">${rows}</div>`;
  },
  actionList(items, opts = {}) {
    if (!items || !items.length) return C.empty(U.ui_empty_none);
    return `<div class="action-list">${items.map(x => `
      <div class="action-row">
        <div>
          <div class="action-name">${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '')}${x.fund_code ? `<span class="action-code">${esc(x.fund_code)}</span>` : ''}</div>
          <div class="action-reason">${esc(x.action || '')}${x.reason ? ' · ' + esc(shortReason(x.reason)) : ''}</div>
        </div>
        <div class="action-amount">${has(x.amount) && Number(x.amount) !== 0 ? money(x.amount) : ''}${x.params && has(x.params.valuation_pct) ? `<small>估值 ${pct(x.params.valuation_pct)}</small>` : ''}</div>
      </div>`).join('')}</div>`;
  },
  validityList(items) {
    if (!items || !items.length) return '';
    return `<div class="action-list">${items.map(x => {
      const amount = has(x.amount) && Number(x.amount) !== 0 ? money(x.amount) : '';
      const schedule = x.actual_execution_date ? `<div class="fund-numbers">${esc(U.ui_label_execute_date || '')} ${esc(x.actual_execution_date)}${x.is_postponed ? ` · ${esc(fmt(U.ui_label_postponed, { n: x.postpone_days }))}` : ''}${x.valid_until ? ` · ${esc(U.ui_label_deadline || '')} ${esc(dateTimeText(x.valid_until))}` : ''}</div>` : '';
      return `<div class="action-row"><div><div class="action-name">${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '')}${x.fund_code ? `<span class="action-code">${esc(x.fund_code)}</span>` : ''}</div><div class="action-reason">${esc(x.band_title || '')} · ${esc(x.action || '')}${x.reason ? ' · ' + esc(shortReason(x.reason)) : ''}</div>${schedule}</div><div class="action-amount">${amount}</div></div>`;
    }).join('')}</div>`;
  },
  blockedList(items) {
    if (!items || !items.length) return '';
    return items.map(x => `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '')}</strong>${C.badge(x.action || '', 'warn')}</div><div class="fund-numbers">${esc(x.blocked_reason || '')}</div></div>`).join('');
  },
  expiredList(items) {
    if (!items || !items.length) return '';
    return items.map(x => {
      const date = x.actual_execution_date || x.planned_execution_date || '';
      const reason = x.invalid_reason ? ` · ${esc(x.invalid_reason)}` : '';
      return `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '')}</strong><strong>${esc(x.action || '')}</strong></div><div class="fund-numbers">${esc(x.band_title || '')}${date ? ' · ' + esc(date) : ''}${reason}</div></div>`;
    }).join('');
  },
  orderedList(items) {
    if (!items || !items.length) return '';
    return `<ol class="action-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  },
  table(headers, rows, options = {}) {
    if (!rows || !rows.length) return '';
    const aligns = options.aligns || [];
    const style = index => aligns[index] ? ` style="text-align:${esc(aligns[index])}"` : '';
    const head = headers.map((label, index) => `<th${style(index)}>${esc(label)}</th>`).join('');
    const body = rows.map(row => `<tr>${row.map((value, index) =>
      `<td${style(index)}>${esc(value ?? '—')}</td>`).join('')}</tr>`).join('');
    return `<div class="table-scroll"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  },
  details(summary, body) { return body ? `<details><summary>${esc(summary)}</summary>${body}</details>` : ''; },
};

// ---------- 渲染器（业务区块：数据 → 组件组合） ----------
const R = {
  // 档位页公共头
  bandHeader(band) {
    const b = (D.bands || {})[band] || {};
    const v = b.validity || {};
    const expired = resultExpired(v);
    const nextAt = v.next_review_at || '';
    let timeLine = '';
    // 有正式结果时，时间由流程卡唯一展示；等待/过期/测试态没有流程卡，页头必须保留时间。
    const passiveHeaderTime = expired || ['awaiting', 'test'].includes(v.state);
    if (!passiveHeaderTime) timeLine = '';
    else if (expired) timeLine = v.result_visible_until ? C.kv(U.ui_label_result_expired_at, esc(dateTimeText(v.result_visible_until))) : '';
    else if (v.result_visible_until && v.result_effective_from) timeLine = C.kv(U.ui_label_result_period, `${esc(dateTimeText(v.result_effective_from))} 至 ${esc(dateTimeText(v.result_visible_until))}`);
    else if (v.result_visible_until) timeLine = C.kv(U.ui_label_result_effective, esc(dateTimeText(v.result_visible_until)));
    else if (nextAt) timeLine = C.kv(U.ui_label_next_review, esc(dateTimeText(nextAt)));
    return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(b.title || '')}</h1>
      <div class="muted">${C.badge(U['ui_state_' + v.state] || '', v.state === 'blocked' ? 'warn' : 'muted')} 基准 ${esc(dateText(b.base_date))}</div>
      ${b.run_kind === 'release_bootstrap' ? `<p class="status-banner live">V2首发初始基准（用户明确授权）${band === 'band_quarter' ? '；常规季度仍按3/6/9/12月20日执行' : ''}</p>` : ''}
      ${timeLine ? `<p class="muted">${timeLine}</p>` : ''}</div>`;
  },

  weeklyTotal(b) {
    const p = (b || {}).execution_plan || {};
    if (!has(p.weekly_total)) return '';
    return C.card('本周正式计划', C.kv('执行日', esc(p.execution_date))
      + C.kv('合计定投', money(p.weekly_total), 'info')
      + C.kv('现金留存', money(p.cash_retained)));
  },

  bandActions(b) {
    const v = (b || {}).validity || {};
    if (!['active', 'partial'].includes(v.state)) return '';
    const items = v.actions || [];
    return items.length ? C.card(U.ui_h2_current_actions, C.validityList(items), 'accent') : '';
  },
  bandBlocked(b) {
    const items = ((b || {}).validity || {}).blocked || [];
    return items.length ? C.card(U.ui_h2_blocked_actions, C.blockedList(items), 'warn') : '';
  },
  bandExpired(b) {
    const items = ((b || {}).validity || {}).expired || [];
    return items.length ? C.details(U.ui_h2_expired_actions, C.expiredList(items)) : '';
  },

  // 每日档
  checkScan(b) {
    if (b.band !== 'band_daily' || ['expired', 'awaiting', 'test'].includes((b.validity || {}).state)) return '';
    const checks = (b.artifacts && b.artifacts.daily_checks) || [];
    if (!checks.length) return '';
    // 风控扫描每日唯一；其他档不得复制“关注版”。
    const isAttention = c => { const s = String(c.status || ''); return s.includes('🔴') || s.includes('⚠️') || s.includes('待数据'); };
    const attention = checks.filter(isAttention);
    const normal = checks.filter(c => !isAttention(c));
    const renderRows = rows => rows.map(c => `<div class="check-item"><div class="money-row"><span>${esc(c.name || '')}</span>${C.statusBadge(c.status)}</div><p class="lead">${esc(c.detail || '')}</p>${C.checkMetrics(c.metrics)}</div>`).join('');
    let rows = renderRows(attention);
    if (normal.length) rows += `<details class="check-normal-rest"><summary>${esc(fmt(U.ui_check_scan_rest, { n: normal.length }))}</summary>${renderRows(normal)}</details>`;
    return C.card(fmt(U.ui_h2_check_scan, { n: checks.length }), rows);
  },
  attention(b) {
    const v = b.validity || {};
    if (v.state && !['active', 'partial'].includes(v.state)) return '';
    return C.card(U.ui_h2_attention, C.actionList(b.attention_items));
  },
  yourAction(b) {
    const state = (b.validity || {}).state;
    const active = state === 'active' || state === 'partial';
    const txt = active ? U.ui_action_feedback : ((b.validity || {}).headline || U.ui_empty_none);
    return C.card(U.ui_h2_your_action, `<p class="lead">${esc(txt || '')}</p>`, 'accent');
  },
  normalItems(b) {
    const v = b.validity || {};
    if (['expired', 'awaiting', 'test'].includes(v.state)) return '';
    const items = b.normal_items || [];
    const label = b.normal_label || U.ui_normal_rest || '其余 {n} 只：未触发风控';
    return C.details(fmt(label, { n: items.length }), C.actionList(items));
  },

  // 债基再平衡
  rebalance(r) {
    if (!r) return '';
    // 目标 55% 的依据内联在此（自含依据），每日档市场环境块因此不再重复目标数值
    const env = (((D.bands || {}).band_monthly || {}).market_env) || null;
    const im = env && env.impact;
    let basis = '';
    if (im && has(env.hs300_pe_pct) && has(im.threshold) && im.label !== '中性' && env.template_basis) {
      const cmp = Number(env.hs300_pe_pct) > Number(im.threshold) ? '>' : '<';
      basis = env.template_basis.replace('{debt}', im.debt_target).replace('{label}', im.label)
        .replace('{pct}', pct(env.hs300_pe_pct)).replace('{cmp}', cmp).replace('{th}', im.threshold);
    }
    const debtRows = has(r.debt_weight) && has(r.debt_target) && has(r.start_line) && has(r.lower_line)
      ? `${C.kv('当前债比 / ERP目标', `${pct(r.debt_weight)} / ${pct(r.debt_target)}`)}${C.kv('启动线 / 补债下沿', `${pct(r.start_line)} / ${pct(r.lower_line)}`)}`
      : C.empty(U.ui_data_awaiting, U.ui_rebalance_data_missing);
    const body = `<p class="lead">${esc(r.action || '')}</p>
      ${debtRows}
      ${basis ? `<p class="muted">${esc(basis)}</p>` : ''}
      ${r.actual_amount_note ? `<p class="muted">${esc(r.actual_amount_note)}</p>` : ''}`;
    return C.card(U.ui_h2_rebalance, body, r.active ? 'warn' : '');
  },
  flow(r) {
    if (!r || !r.flows) return '';
    const body = `${C.kv('权益层', money(r.flows.equity))}${C.kv('债券层（受债比闸门约束）', money(r.flows.debt))}${C.kv('黄金层', money(r.flows.gold))}${C.kv('现金层', money(r.flows.cash))}
      <p class="muted">四资产合计 ${money(r.monthly_budget)}；存量再平衡不计入这份新增预算。</p>`;
    return C.card(`${esc(r.erp_label || '')}态月度流量分配`, body);
  },

  // 月度档
  monthlyReview(mr, execution, unlocks) {
    if (!mr) return '';
    const ret = mr.item2_收益率 || {};
    const cum = ret['累计'] || {};
    // 逐只收益率已并入"持仓总表"，此处只留最差/最好两只作摘要，避免9只表重复
    const cumSorted = Object.entries(cum).sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0));
    const worst = cumSorted[0];
    const best = cumSorted[cumSorted.length - 1];
    const cumRows = (worst && best && cumSorted.length > 2)
      ? C.kv('累计最差', `${fundName(worst[0]) || worst[0]} ${pct(worst[1])}`, numTone(worst[1])) + C.kv('累计最好', `${fundName(best[0]) || best[0]} ${pct(best[1])}`, numTone(best[1]))
      : cumSorted.map(([fc, r]) => C.kv(fundName(fc) || fc, pct(r), numTone(r), fc)).join('');
    const mom = (ret['月度(快照对比)'] || {}).TOTAL;
    const snap = ret['最近快照变动'] || {};
    const snapLine = snap.value != null
      ? `<p class="muted">上周期内最近快照（${esc(snap.start)} → ${esc(snap.end)}）：<span class="num ${numTone(snap.value)}">${pct(snap.value)}</span>；${esc(ret['月度状态'] || U.ui_monthly_return_wait)}</p>` : '';
    const statusLine = !snapLine && mom == null
      ? `<p class="muted">${esc(ret['月度状态'] || U.ui_monthly_return_wait)}</p>` : '';
    const rawReview = mr.item3_加减仓回顾;
    const reviewHtml = Array.isArray(rawReview)
      ? rawReview.map(x => {
        const amount = typeof x.actual_amount === 'number' ? money(x.actual_amount) : esc(x.actual_amount || '—');
        return `<div class="money-row"><span>${esc(x.trade_date || '')} · ${esc(x.fund_name || fundName(x.fund_code))}<small> ${esc(x.action || '')}</small></span><strong>${amount}</strong></div>`;
      }).join('') : `<p class="lead">${esc(rawReview || '')}</p>`;
    const inv = mr.item4_定投统计 || {};
    const ex = execution && typeof execution === 'object' ? execution : {};
    const completeness = ex.completeness || mr.item1_完整性;
    const reviewMeta = `${ex.record_count != null ? C.kv('流水记录数', esc(ex.record_count)) : ''}${ex.missing_scale_count != null ? C.kv('缺规模数据', `${esc(ex.missing_scale_count)} 只`) : ''}`;
    const ul = Array.isArray(unlocks) ? unlocks : (unlocks ? [unlocks] : []);
    const unlockRows = ul.map(x => `<div class="money-row"><span>${esc(x.fund_name || fundName(x.fund_code) || '')}<small> ${esc(x.fund_code || '')}</small></span><strong>${esc(x.lock_end_date || '')}${x.within_6m ? ' ' + C.badge('临近解锁', 'warn') : ''}</strong></div>`).join('');
    const body = `${C.kv('持仓与规模', esc(completeness))}
      ${C.kv('本月组合收益率', mom != null ? pct(mom) : '待数据', numTone(mom))}
      ${snapLine}${statusLine}
      ${cumRows}
      ${C.kv('定投执行', inv['次数'] != null ? `${esc(inv['次数'])}笔 / ${money(inv['金额'])}` : '—')}
      ${reviewMeta}${unlockRows}
      ${reviewHtml}
      <p class="muted">${esc(mr.item5_信号准确率 || '')}</p>
      <p class="muted">${esc(mr.item6_赛道跟踪 || '')}</p>`;
    return C.card(U.ui_h2_monthly_review, body);
  },
  periodSummary(ps) {
    if (!ps) return '';
    const parts = [];
    if (ps.start || ps.end) parts.push(C.kv('统计区间', `${esc(ps.start || '—')} ~ ${esc(ps.end || '—')}`));
    if (ps.period_id) parts.push(C.kv('周期', esc(ps.period_id)));
    const rows = Array.isArray(ps.rows) ? ps.rows : [];
    if (rows.length) {
      const list = rows.map(x => `<div class="money-row"><span>${esc(x.action || '')}${x.count != null ? ` × ${esc(x.count)}` : ''}</span><strong>${x.amount ? money(x.amount) : '—'}</strong></div>`).join('');
      parts.push(list);
    }
    return C.card(U.ui_h2_period_summary || '上周期事件与执行总结', parts.join(''));
  },
  takeProfit(tp) {
    if (!tp) return '';
    const rows = (Array.isArray(tp) ? tp : [tp]).map(x => {
      const dec = String(x.decision || x.status || '');
      const short = dec.length > 6 ? (dec.includes('触发') ? '触发' : '未触发') : dec;
      const kind = short.includes('触发') && !short.includes('未') ? 'danger' : 'ok';
      return `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong>${C.badge(short, kind)}</div>
       <div class="fund-numbers">${esc(x.fund_code || '')}${dec ? ' · ' + esc(dec) : ''}</div></div>`;
    }).join('');
    return C.card(U.ui_h2_bond_tp, rows || C.empty('', '无债券止盈触发'));
  },
  fundingReview(rows) {
    if (!rows) return '';
    const body = rows.map(x => `<div class="fund-row">
      <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong><strong>${esc(x.decision || '')}</strong></div>
      <div class="fund-numbers">${esc(x.fund_code || '')} · ${esc(x.reason || '')}${x.valuation != null ? ` · 分位 ${pct(x.valuation)}` : ''}</div></div>`).join('');
    return C.card(U.ui_h2_funding_review, body);
  },
  scan(scan) {
    if (!scan) return '';
    const comps = (scan.comparisons || []).map(x => `<div class="fund-row">
      <div class="fund-top"><strong>${esc(x.sector || '')} · ${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '待锁定基金')}</strong><strong>估值分位 ${pct(x.valuation)}</strong></div>
      <div class="fund-numbers">${esc(x.fund_code || '未登记代码')} · ${esc(x.date || '')} / ${esc(x.source || '')}<br>${esc(x.decision || '')}：${esc(x.reason || '')}</div></div>`).join('')
      || C.empty('', '没有新基金通过低估初筛。');
    return C.card(U.ui_h2_scan, comps);
  },
  execution(r, unlocks) {
    const parts = [];
    if (r && typeof r === 'object') {
      if (r.completeness) parts.push(C.kv('数据完整性', esc(r.completeness)));
      if (r.invest_count != null) parts.push(C.kv('定投笔数 / 金额', `${esc(r.invest_count)}笔 / ${money(r.invest_total)}`));
      if (r.record_count != null) parts.push(C.kv('流水记录数', esc(r.record_count)));
      if (r.missing_scale_count != null) parts.push(C.kv('缺规模数据', `${esc(r.missing_scale_count)} 只`));
    } else if (typeof r === 'string') {
      parts.push(`<p class="lead">${esc(r)}</p>`);
    }
    const ul = Array.isArray(unlocks) ? unlocks : (unlocks ? [unlocks] : []);
    if (ul.length) {
      parts.push(ul.map(x => `<div class="money-row"><span>${esc(x.fund_name || fundName(x.fund_code) || '')}<small> ${esc(x.fund_code || '')}</small></span><strong>${esc(x.lock_end_date || '')}${x.within_6m ? ' ' + C.badge('临近解锁', 'warn') : ''}</strong></div>`).join(''));
    }
    return parts.length ? C.card(U.ui_h2_execution || '执行与解锁', parts.join('')) : '';
  },
  positionRows(items) {
    // 月度档唯一持仓总表：市值/收益率/本期动作，替代原来三张各列9只的重复表
    const list = (items || []).slice().sort((x, y) => {
      const mx = Number((x.params || {}).market_value);
      const my = Number((y.params || {}).market_value);
      return (isNaN(my) ? -1 : my) - (isNaN(mx) ? -1 : mx);
    });
    if (!list.length) return '';
    // 本期动作取资金评审的真实决策（"维持定投/暂停定投等估值回到可投区/维持暂停保留下月复核"），
    // 比 items.action 的"持有"信息量大；评审区块本身已合并进本表，不再单独渲染。
    const _fr = (((D.bands || {}).band_monthly || {}).artifacts || {}).funding_review || [];
    const _dec = {};
    _fr.forEach(z => { if (z && z.fund_code) _dec[z.fund_code] = z.decision; });
    const rows = list.map(x => {
      const p = x.params || {};
      const mv = has(p.market_value) ? money(Number(p.market_value)) : '—';
      const pr = has(p.profit_rate) ? pct(Number(p.profit_rate)) : '—';
      const vp = has(p.valuation_pct) ? pct(Number(p.valuation_pct)) : '—';
      const act = _dec[x.fund_code] || (x.action && x.action !== '—' ? x.action : '');
      return `<div class="fund-row">
        <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}<small> ${esc(x.fund_code || '')}</small></strong>${act ? C.badge(act, act === '暂停' ? 'warn' : '') : ''}</div>
        <div class="fund-numbers">市值 <span class="num info">${mv}</span> · 收益率 <span class="num ${numTone(x.params && x.params.profit_rate)}">${pr}</span> · 分位 ${vp}</div>
        ${(x.reason && String(x.reason) !== String(act)) ? `<p class="lead">${esc(x.reason)}</p>` : ''}</div>`;
    }).join('');
    return C.card(U.ui_h2_position_health, `<p class="muted">按市值降序；动作=本期该只怎么做</p>${rows}`);
  },
  fundDest() {
    const f = D.funds_page || {};
    const rows = (f.channels || []).map(x => {
      const v = x.value;
      const val = (v === null || v === undefined || v === '') ? '—' : (Number.isFinite(Number(v)) ? money(Number(v)) : esc(String(v)));
      return C.kv(x.name, val, 'info');
    }).join('');
    return C.card(U.ui_h2_fund_dest, rows);
  },
  fundsMetrics() {
    const f = D.funds_page || {};
    return C.metricGrid([
      ['本周期剩余', money(f.remaining), numTone(f.remaining)],
      ['现金池', money(f.cash_pool), numTone(f.cash_pool)],
    ]);
  },
  cashDetail() {
    const cd = (D.funds_page || {}).cash_detail;
    if (!cd) return '';
    const parts = [
      C.kv('现金池累计余额', money(cd.balance), numTone(cd.balance)),
      cd.monthly_inject != null ? C.kv('月度注入额', money(cd.monthly_inject), 'info') : '',
      cd.last_period_note ? `<p class="muted">上期结余：${esc(cd.last_period_note)}</p>` : '',
    ].join('');
    return C.card(U.ui_h2_cash_pool, parts);
  },

  // 四档行动共用纯渲染组件；契约缺失时 fail-closed，不在前端补业务判断。
  actionCard(view, title, contract) {
    if (!view || view.engine_contract !== contract || !view.headline) {
      return C.card(title, C.empty(U.ui_action_contract_missing, ''), 'warn');
    }
    const pending = Array.isArray(view.pending_items) ? view.pending_items : [];
    const body = `<div class="decision-main">${esc(view.headline)}</div>
      ${view.note ? `<p class="decision-note">${esc(view.note)}</p>` : ''}
      ${pending.length ? `<div class="decision-blockers"><strong>${esc(view.pending_title || '')}</strong><ul>${pending.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`;
    return C.card(title, body, 'accent');
  },
  quarterAction(a, validity) {
    return R.actionCard(a && a.action_view, U.ui_h2_quarter_action, 'h5_quarter_action_v1');
  },
  bandAction(a) {
    return R.actionCard(a && a.action_view, U.ui_h2_band_action, 'h5_band_action_v1');
  },
  quarterEvidence(b) {
    const a = b.artifacts || {};
    const content = [R.equityStructure(b.equity_structure), R.assetAllocation(b.asset_allocation),
      R.concentration(a.concentration), R.exitReviews(a.exit_reviews), R.quarterReview(a)].join('');
    return content ? C.details(U.ui_quarter_evidence, content) : '';
  },
  allocation(b) {
    const weights = (b.allocation || {}).weights || {};
    const keys = Object.keys(weights);
    if (!keys.length) return C.card(U.ui_h2_allocation, C.empty('', '配置数据不足。'));
    const rows = keys.map(k => C.kv(k, pct(weights[k]), 'info')).join('');
    return C.card(U.ui_h2_allocation, rows);
  },
  concentration(c) {
    if (!c) return '';
    const secs = Array.isArray(c.sectors) ? c.sectors : Object.entries(c.sectors || {}).map(([k, v]) => ({ sector: k, weight: v }));
    const rows = secs.map(x => `<div class="money-row"><span>${esc(x.sector || '')}${x.over ? ' ' + C.badge('超限', 'danger') : ''}</span><strong class="num ${x.over ? 'neg' : 'info'}">${pct(x.weight)}</strong></div>`).join('');
    const total = c.total ?? c.total_market_value;
    return C.card(fmt(U.ui_h2_concentration, { limit: pct(c.limit) }), `${rows}${total ? `<p class="muted">${fmt(U.ui_concentration_total, { total: money(total) })}</p>` : ''}`);
  },
  exitReviews(rows) {
    if (!rows || !rows.length) return '';
    const body = rows.map(x => `<div class="fund-row">
      <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong>${C.statusBadge(x.action || '')}</div>
      <div class="fund-numbers">${esc(x.fund_code || '')} · ${esc(x.reason || '')}</div>
      ${x.status ? `<div class="fund-numbers">系统状态：${esc(x.status)}${x.next_review_date ? ` · 下次复核：${esc(x.next_review_date)}` : ''}${x.deadline_date ? ` · 本次评估截止：${esc(x.deadline_date)}` : ''}${x.lock_end_date ? ` · 持有期到期：${esc(x.lock_end_date)}` : ''}</div>` : ''}
      ${x.missing && x.missing.length ? `<div class="fund-numbers">系统待补：${esc(x.missing.join('；'))}</div>` : ''}</div>`).join('');
    return C.card(U.ui_h2_exit_review, body);
  },
  quarterReview(a) {
    const scale = a && a.scale_review, bt = a && a.backtest;
    if (!scale && !bt) return '';
    const parts = [];
    if (scale) parts.push(C.kv('基金规模复核', esc(scale.status || '')));
    if (bt) {
      // 字段名对齐数据：signal_count/outcome_count（旧写 signals/results 不存在→永远显0/0）
      const signalCount = bt.signal_count === null || bt.signal_count === undefined ? '待数据' : bt.signal_count;
      const outcomeCount = bt.outcome_count === null || bt.outcome_count === undefined ? '待数据' : bt.outcome_count;
      parts.push(C.kv('信号流水 / 有结果样本', `${esc(signalCount)} / ${esc(outcomeCount)}`));
      if (bt.status) parts.push(`<p class="muted">${esc(statusText(bt.status))}</p>`);
      else if (bt.note) parts.push(`<p class="muted">${esc(bt.note)}</p>`);
    }
    return C.card(U.ui_h2_scale_backtest, parts.join(''));
  },
  netAddition(n) {
    if (!n) return '';
    // 旧写法 Object.entries 平铺：英文key(triggered/fund/weight/p102/fire)+P码直接暴露给用户。
    // 改为读台账结构化文案（与文字报告同源），不展示任何键名/P码。
    const fire = n.fire ? (U.net_add_fire_yes || '') : (U.net_add_fire_no || '');
    const tpl = n.triggered ? U.net_add_trigger : U.net_add_none;
    if (!tpl) return '';
    const text = fmt(tpl, { fund: n.fund || '—', w: Number(n.weight), p102: Number(n.p102), fire });
    return C.card(U.ui_h2_net_add, `<p class="muted">${esc(text.replace(/^-\s*/, ''))}</p>`);
  },
  assetAllocation(allocation) {
    if (!allocation) return '';
    const assets = [
      ['equity', U.ui_asset_equity], ['debt', U.ui_asset_debt],
      ['gold', U.ui_asset_gold], ['cash', U.ui_asset_cash],
    ];
    const rows = assets.map(([key, label]) => [
      label, pct((allocation.targets || {})[key]),
      pct((allocation.actual || {})[key]), pct((allocation.gaps || {})[key]),
    ]);
    const proxy = Object.values(allocation.fof_proxy || {}).some(Boolean)
      ? `<p class="muted">${esc(U.ui_lbl_proxy)}</p>` : '';
    const blocked = allocation.valid === false
      ? C.empty(U.ui_lbl_p2_readonly, (allocation.missing || []).join(' · ')) : '';
    const body = C.table(
      [U.ui_lbl_asset, U.ui_lbl_target, U.ui_lbl_actual, U.ui_lbl_gap], rows,
      { aligns: ['left', 'right', 'right', 'right'] }) + proxy + blocked;
    return C.card(U.ui_h2_asset_allocation, body, allocation.valid === false ? 'warn' : '');
  },
  equityStructure(structure) {
    if (!structure) return '';
    const core = (structure.core_funds || []).map(x =>
      `${esc(fundName(x.fund_code, x.fund_name))}${x.buy_allowed ? '' : `（${esc(U.ui_lbl_buy_blocked)}）`}`
    ).join(' · ');
    const rows = (structure.satellite_funds || []).map((x, index) => [
      String(x.rank ?? index + 1), fundName(x.fund_code, x.fund_name),
      x.buy_allowed ? U.ui_lbl_buy_allowed : U.ui_lbl_buy_blocked,
    ]);
    const lockText = structure.locked ? U.ui_yes : U.ui_no;
    const body = C.kv(U.ui_lbl_core_ratio, pct(structure.core_ratio))
      + C.kv(U.ui_lbl_locked, esc(lockText))
      + C.kv(U.ui_lbl_core_funds, core)
      + C.table([U.ui_lbl_rank, U.ui_lbl_fund, U.ui_lbl_status], rows,
        { aligns: ['right', 'left', 'left'] });
    const exclusions = (structure.exclusions || []).length
      ? `<p class="muted">${esc(U.ui_lbl_exclusions)}：${esc(structure.exclusions.map(x => x.fund_code || x.code || '').join(' · '))}</p>` : '';
    return C.card(U.ui_h2_equity_structure, body + exclusions, structure.valid === false ? 'warn' : '');
  },
  satelliteExecution(e) {
    if (!e) return '';
    const summary = C.kv(U.ui_lbl_satellite_budget, money(e.satellite_week_budget))
      + C.kv(U.ui_lbl_satellite_unallocated, money(e.satellite_week_unallocated))
      + C.kv(U.ui_lbl_cash_retained, money(e.cash_retained));
    const rows = (e.satellite_allocation_trace || []).map(x => [
      fundName(x.fund_code), money(x.allocated), money(x.amount), x.reason || x.reason_code || '',
    ]);
    const table = rows.length ? C.table(
      [U.ui_lbl_fund, U.ui_lbl_allocated, U.ui_lbl_structural_room, U.ui_lbl_reason], rows,
      { aligns: ['left', 'right', 'right', 'left'] }) : '';
    return C.card(U.ui_h2_satellite_execution, summary + table, e.valid === false ? 'warn' : '');
  },
  settledCash(r) {
    if (!r) return '';
    const pending = Array.isArray(r.pending_redemption) ? r.pending_redemption.length : null;
    const body = C.kv(U.ui_lbl_pending, pending === null ? '—' : String(pending))
      + C.kv(U.ui_lbl_settled, money(r.unallocated_cash))
      + C.kv(U.ui_lbl_planned, money(r.planned_total))
      + C.kv(U.ui_lbl_after, money(r.cash_after_plan));
    const rows = (r.allocation_plan || []).map(x => [
      fundName(x.target_fund_code), x.role || x.target_asset || '', money(x.amount),
    ]);
    const table = rows.length ? C.table(
      [U.ui_lbl_fund, U.ui_lbl_role, U.ui_lbl_allocated], rows,
      { aligns: ['left', 'left', 'right'] }) : '';
    return C.card(U.ui_h2_settled_cash, body + table, r.valid === false ? 'warn' : '');
  },
  marketEnv(env) {
    if (!env) return '';
    const im = env.impact || null;
    let impactLine = '';
    if (im && has(env.hs300_pe_pct)) {
      const tpl = env.template;
      if (im.label === '中性') {
        impactLine = tpl
          ? tpl.replace('{pct}', pct(env.hs300_pe_pct)).replace('{lo}', im.threshold || '').replace('{hi}', '').replace('{eq}', im.equity_target)
          : '';
      } else if (has(im.threshold)) {
        const cmp = Number(env.hs300_pe_pct) > Number(im.threshold) ? '>' : '<';
        impactLine = tpl
          ? tpl.replace('{pct}', pct(env.hs300_pe_pct)).replace('{cmp}', cmp).replace('{th}', im.threshold)
               .replace('{label}', im.label).replace('{eq}', im.equity_target)
               .replace('{debt}', im.debt_target).replace('{base}', im.equity_base)
          : '';
      }
    }
    const body = `${C.kv('沪深300 PE 5年分位', pct(env.hs300_pe_pct))}${C.kv('ERP态', esc(im ? im.label : (env.erp_state || '')))}`
      + (impactLine ? `<p class="lead">${esc(impactLine)}</p>` : '');
    return C.card(U.ui_h2_market_env, body);
  },
  nextReview(rows) {
    if (!rows || !rows.length) return '';
    const body = rows.map(x => `<div class="fund-row">
      <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong><strong>${esc(x.action || '')}</strong></div>
      <div class="fund-numbers">${esc(x.reason || '')}</div></div>`).join('');
    return C.card(U.ui_h2_next_review, body);
  },
  ledgerFlow() {
    const f = D.funds_page || {};
    const rows = `${C.kv('周期', esc(f.period || '—'))}${C.kv('注入', money(f.injection), 'info')}${C.kv('已用', money(f.spent), 'info')}${C.kv('剩余', money(f.remaining), numTone(f.remaining))}`;
    return C.card(U.ui_h2_ledger_flow, rows);
  },
  // 周日档
  weekGate(g) {
    // 资金闸门：仅在"整周权益需求 > 本期可用"时展示（未触发不占版面）
    if (!g || !g.triggered) return '';
    const rows = (g.alloc || []).map(x => {
      const isDebt = x.kind === 'debt';
      const verb = x.alloc === 0 ? '本期不投' : (x.cut ? '削减' : '足额');
      const cls = x.alloc === 0 ? 'warn' : (x.cut ? 'warn' : 'ok');
      const note = isDebt ? '（债券层，资金紧张时排最后）' : '';
      return `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}<small> ${esc(x.fund_code || '')}</small></strong>${C.badge(verb, cls)}</div>
        <div class="fund-numbers">计划 ${money(x.plan)} → 本期 ${money(x.alloc)}${note}</div></div>`;
    }).join('');
    const head = `<p class="lead">整周权益需求 ${money(g.equity_need)} > 本期可用 ${money(g.avail)}，缺口 ${money(g.shortfall)} → 按「估值分位升序+评分降序」重排，发完即止</p>`;
    const src = g.cash_override ? '<p class="muted">可用金额取自你告知的实际现金</p>' : `<p class="muted">按本周期权益额度剩余计算（额度 ${money(g.equity_month)} − 已投 ${money(g.spent)}）；若有实际现金余额，告诉我按实际重算</p>`;
    return C.card('资金不足·优先级重算', head + rows + src);
  },
  addOn(rows, summary) {
    const state = (((D.bands || {}).band_eval || {}).validity || {}).state;
    if (state !== 'active' && state !== 'partial') return '';
    // 只展示参与评分(有评分)的基金；"不参与"(FOF/主动/持有期/未进低估区)不占版面(用户2026-11-18要求)。
    // 排序跟主题走(M11):加仓→分位升序+评分降序
    const list = (rows || []).filter(x => has(x.score)).sort((p1, p2) => {
      const v1 = has(p1.valuation) ? Number(p1.valuation) : 999;
      const v2 = has(p2.valuation) ? Number(p2.valuation) : 999;
      if (v1 !== v2) return v1 - v2;
      return (Number(p2.score) || 0) - (Number(p1.score) || 0);
    });
    const sm = summary ? `<p class="muted">${esc(typeof summary === 'string' ? summary : JSON.stringify(summary))}</p>` : '';
    if (!list.length) return sm ? C.card(U.ui_h2_addon_score, sm) : '';
    const body = list.map(x => {
      const sc = Number(x.score);
      const th = has(x.threshold) ? Number(x.threshold) : null;
      const hit = th != null && sc >= th;
      const sc5 = x.scores || {};
      const dm = x.dimensions || {};
      const n1 = v => (v == null ? '—' : (Math.round(Number(v) * 100) / 100));
      const dimLine = [
        `估值 ${n1(sc5['估值'])}分（分位${n1(x.valuation)}%）`,
        (() => { const t = dm.trend || {}; const v = Number(t.value); return isNaN(v) ? `趋势 ${n1(sc5['趋势'])}分` : `趋势 ${n1(sc5['趋势'])}分（${v < 0 ? '低于' : '高于'}20日线${n1(Math.abs(v))}%）`; })(),
        (() => { const f = dm.flows || {}; const v = Number(f.value); return isNaN(v) ? `资金 ${n1(sc5['资金'])}分` : `资金 ${n1(sc5['资金'])}分（5日净${v < 0 ? '流出' : '流入'}${n1(Math.abs(v))}亿）`; })(),
        (() => { const fd = dm.fundamentals || {}; return `基本面 ${n1(sc5['基本面'])}分（${esc(fd.caliber || '—')}）`; })(),
        (() => { const m = dm.sentiments || {}; const v = Number(m.value); return isNaN(v) ? `情绪 ${n1(sc5['情绪'])}分` : `情绪 ${n1(sc5['情绪'])}分（成交额分位${n1(v)}%）`; })()
      ].join(' · ');
      return `<div class="fund-row">
        <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong><strong class="num ${hit ? 'pos' : 'warn'}">${sc}</strong></div>
        <div class="fund-numbers">${esc(x.fund_code || '')}${th != null ? ` · 门槛${th}` : ''}${x.decision ? ` · ${esc(x.decision)}` : ''}${hit ? ' ' + C.badge('达标', 'ok') : ''}</div>
        <p class="lead">${dimLine}</p></div>`;
    }).join('');
    return C.card(U.ui_h2_addon_score, body + sm);
  },
  weeklyBudget(a) {
    const w = a && a.weekly_budget;
    if (!w) return '';
    const dailyValues = Object.values(w.daily_amounts || {});
    const daily = dailyValues.length ? dailyValues[0] : null;
    const blocked = Number(w.shortfall) > 0;
    const decision = blocked
      ? `原计划不可全额执行，缺口 ${money(w.shortfall)}`
      : daily != null ? `每个交易日 ${money(daily)}，下周共 ${money(w.debt_total)}` : '暂停，0元';
    const debitRows = (w.debits || []).map(x => [fundName(x.fund_code, x.fund_name), x.date, money(x.amount)]);
    const debitTable = debitRows.length ? C.table(
      [U.ui_weekly_col_fund, U.ui_weekly_col_date, U.ui_weekly_col_amount], debitRows,
      { aligns: ['left', 'left', 'right'] }) : '';
    let html = debitTable + C.kv('下周债基结论', decision, blocked ? 'neg' : 'pos')
      + C.kv('本周需求', `权益与黄金 ${money(w.equity_total)} + 债基 ${money(w.debt_total)} = ${money(w.total)}`, 'info')
      + C.kv('本周债基实际执行', money(w.debt_actual_amount), numTone(w.debt_actual_amount));
    (w.cycles || []).forEach(g => {
      const lock = g.budget_lock || {};
      html += `<div class="flow-line"><b>${esc(g.period_start)} ~ ${esc(g.period_end)}</b> · ${lock.locked ? '预算已锁定' : '预算预览，待20日锁定'}</div>`;
      html += C.kv('本周可用 / 投后余', `${money(g.available)} / ${money(g.remaining_after)}`, numTone(g.remaining_after));
      const cycleInfo = g.full_cycle;
      if (cycleInfo) {
        html += C.kv('整周期权益', `${money(cycleInfo.projected_equity)} / 预算 ${money(cycleInfo.equity_budget)}`, cycleInfo.equity_excess > 0 ? 'neg' : 'pos');
        html += C.kv('整周期债基', `${money(cycleInfo.projected_debt)} / 预算 ${money(cycleInfo.debt_budget)}`, cycleInfo.debt_excess > 0 ? 'neg' : 'pos');
        html += C.kv('现金预留 / 预计全周期余', `${money(cycleInfo.cash_reserved)} / ${money(cycleInfo.projected_remaining)}`, numTone(cycleInfo.projected_remaining));
        html += `<div class="lead">${esc(cycleInfo.note || '')}</div>`;
      }
    });
    if (w.debt_actual_note) html += C.kv('待对账', esc(w.debt_actual_note), 'warn');
    html += `<div class="lead">${esc(w.scope_note || '')}</div>`;
    return C.card(U.ui_h2_weekly_budget, html);
  },
  evalCash(a) {
    const cash = a.cash_pool;
    if (cash === null || cash === undefined) return '';
    return C.card(U.ui_h2_cash_pool, C.kv('现金池余额', money(cash), numTone(cash)));
  },

  // 规则查询
  ruleList() {
    const q = ($('rule-search') && $('rule-search').value || '').trim();
    const chapters = (D.rules || []).filter(c => !q || String(c.title || '').includes(q));
    const list = chapters.map(c => `<div class="card" data-rule="${esc(c.title)}"><div class="fund-top"><strong>${esc(c.title)}</strong></div></div>`).join('')
      || C.empty('', '没有匹配的章节。');
    return `<div class="search-wrap"><input id="rule-search" class="search" type="search" placeholder="搜索章节名称，例如：定投、减仓、回撤" value="${esc(q)}"></div>${list}`;
  },
};

// ---------- 声明式页面 Schema（页面 = 区块有序列表，加区块只改这里） ----------
const PAGE_SCHEMA = {
  'page-band_daily': [
    { fn: 'bandHeader', arg: 'band_daily' }, { fn: 'bandAction', from: 'band_daily' }, { fn: 'bandFlows', arg: 'band_daily' }, { fn: 'bandExpired', from: 'band_daily' }, { fn: 'checkScan', from: 'band_daily' },
    { fn: 'nextReview', from: 'band_daily' },
  ],
  'page-band_eval': [
    { fn: 'bandHeader', arg: 'band_eval' }, { fn: 'bandAction', from: 'band_eval' }, { fn: 'bandFlows', arg: 'band_eval' }, { fn: 'bandExpired', from: 'band_eval' },
    { fn: 'weeklyBudget', from: 'band_eval' }, { fn: 'satelliteExecution', from: 'band_eval' }, { fn: 'addOn', from: 'band_eval' },
  ],
  'page-band_monthly': [
    { fn: 'bandHeader', arg: 'band_monthly' }, { fn: 'bandAction', from: 'band_monthly' }, { fn: 'bandFlows', arg: 'band_monthly' }, { fn: 'bandExpired', from: 'band_monthly' }, { fn: 'fundsMetrics' },
    { fn: 'monthlyDetails', from: 'band_monthly' },
  ],
  'page-band_quarter': [
    { fn: 'bandHeader', arg: 'band_quarter' }, { fn: 'quarterAction', from: 'band_quarter' },
    { fn: 'bandFlows', arg: 'band_quarter' }, { fn: 'bandExpired', from: 'band_quarter' }, { fn: 'quarterEvidence', from: 'band_quarter' },
  ],
  'page-retirement': [{ fn: 'retirementPage' }],
  'page-chain': [{ fn: 'chainPage' }],
  'page-rules': [{ fn: 'ruleList' }],
};

// ---------- 特殊页渲染 ----------
R.monthlyEngineEvidence = function (a) {
  if (!a || (!Object.prototype.hasOwnProperty.call(a, 'scale_refresh')
      && !Object.prototype.hasOwnProperty.call(a, 'stop_reviews')
      && !Object.prototype.hasOwnProperty.call(a, 'forward_validation'))) return '';
  const scale = a.scale_refresh;
  const scaleHtml = scale ? C.kv('规模自动取数',
    `写入${Number(scale.written || 0)}只 · 复用${Number(scale.reused || 0)}只 · 缺失${(scale.missing || []).length}只`,
    (scale.missing || []).length ? 'neg' : 'pos') : C.kv('规模自动取数', '待数据', 'warn');
  const missingNames = {long_performance: '长期业绩', attribution: '归因证据', manager: '基金经理', scale_risk: '规模'};
  const reviewHtml = (a.stop_reviews || []).map(item => {
    const missing = [...new Set((item.missing || []).map(x => missingNames[String(x).split(':')[0]] || '其他证据'))].join('、');
    const state = item.status === 'completed' ? '已完成' : (item.status === 'pending' ? '缺数待补' : '待评估');
    const deadline = item.status === 'completed' ? item.next_review_date : (item.deadline_date || item.next_review_date);
    return `<div class="flow-line"><b>${esc(item.fund_name || item.fund_code)}</b> · ${esc(state)}</div>`
      + C.kv(item.status === 'completed' ? '下次复核' : '评估截止', esc(deadline || '待数据'), item.status === 'completed' ? '' : 'warn')
      + C.kv('可赎回日期', esc(item.lock_end_date || '不适用'))
      + (missing ? C.kv('待补证据', esc(missing), 'warn') : '');
  }).join('');
  const forward = a.forward_validation;
  let forwardHtml;
  if (!forward) {
    forwardHtml = C.kv('前向信号结算', U.ui_forward_waiting);
  } else {
    const stats = forward.stats || {};
    const statText = ['buy', 'sell'].map(kind => {
      const item = stats[kind] || {};
      const accuracy = item.accuracy === null || item.accuracy === undefined ? '准确率待积累' : `准确率${item.accuracy}%`;
      return `${kind === 'buy' ? '买入' : '卖出'}已结算样本${item.sample === undefined ? '待数据' : item.sample}个，${accuracy}`;
    }).join('；');
    forwardHtml = C.kv('前向信号结算', statText)
      + (forward.status ? C.kv('结算安排', esc(forward.status)) : '');
  }
  return C.card('系统取数与复核证据', scaleHtml + reviewHtml + forwardHtml);
};

R.monthlyDetails = function (b) {
  const a = b.artifacts || {};
  const content = [
    R.settledCash(b.rebalance_cash), R.rebalance(a.rebalance),
    R.monthlyEngineEvidence(a),
    R.monthlyReview(a.monthly_review, a.execution_review, a.unlock_review), R.periodSummary(a.period_summary),
    R.takeProfit(a.take_profit), R.scan(a.scan, b.market_env), R.positionRows(b.items), R.fundDest(),
  ].join('');
  return content ? C.details(U.ui_monthly_details, content) : '';
};

// 流程导航只作跨档入口；完整步骤在主责档，避免两处重复。
function workflowBandTitle(id) {
  return (((D.bands || {})[id] || {}).title) || id;
}
function bandFlowTitle(title) {
  return String(title || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
}
function shortFlowState(state) {
  return String(state || '').split('｜')[0];
}

R.flowSteps = function (flow) {
  const labels = {done: U.ui_flow_status_done, current: U.ui_flow_status_current,
    blocked: U.ui_flow_status_blocked, pending: U.ui_flow_status_pending};
  return (flow.steps || []).map((step, index) => {
    return `<div class="compact-step ${esc(step.status)}"><span class="workflow-index">${index + 1}</span><div><strong>${esc(step.name)}</strong><em>${esc(labels[step.status] || step.status)}</em></div></div>`;
  }).join('');
};

R.chainParameters = function () {
  const chain = D.param_chain || {};
  const nodes = chain.nodes || [], edges = chain.edges || [];
  if (!nodes.length && !edges.length) return '';
  const itemTable = items => C.table(
    [U.ui_chain_col_item, U.ui_chain_col_value, U.ui_chain_col_source],
    (items || []).map(x => [x.label, x.value, x.source]));
  const nodeHtml = nodes.map(n => `<details class="parameter-node"><summary><strong>${esc(n.title)}</strong><em>${esc(n.state_label)}</em></summary>
    <p class="muted">${esc(n.trigger)} · ${esc(n.detail)}</p><h4>${esc(U.ui_chain_inputs)}</h4>${itemTable(n.inputs)}<h4>${esc(U.ui_chain_outputs)}</h4>${itemTable(n.outputs)}</details>`).join('');
  const nodeName = id => String((nodes.find(n => n.id === id) || {}).title || id).split('｜')[0];
  const edgeTable = C.table(
    [U.ui_chain_col_route, U.ui_chain_col_status, U.ui_chain_col_value, U.ui_chain_col_guidance],
    edges.map(e => [`${nodeName(e.source)} → ${nodeName(e.target)} · ${e.label}`, e.status_label, e.actual, e.guidance]));
  return C.details(U.ui_chain_parameters,
    `<h3>${esc(U.ui_chain_nodes)}</h3>${nodeHtml}<h3>${esc(U.ui_chain_edges)}</h3>${edgeTable}`);
};

R.chainPage = function () {
  const flows = ((D.param_chain || {}).visual || {}).workflows || [];
  if (!flows.length) return C.card(U.ui_chain_directory_hint, C.empty('', ''));
  const rows = flows.map(flow => `<button type="button" class="flow-overview" data-flow-owner="${esc(flow.owner_band)}" data-flow-id="${esc(flow.id)}"><span class="flow-overview-top"><strong>${esc(flow.title)}</strong><em>${esc(flow.state)}</em></span><span class="flow-overview-band">${esc(U.ui_chain_primary_band)}：${esc(workflowBandTitle(flow.owner_band))}</span></button>`).join('');
  return C.card(U.ui_chain_directory_hint, `<div class="flow-overview-list">${rows}</div>`) + R.chainParameters();
};

R.bandFlows = function (band) {
  const flows = ((D.param_chain || {}).visual || {}).workflows || [];
  const owned = flows.filter(x => x.owner_band === band);
  if (!owned.length) return '';
  window.__bandActiveFlow = window.__bandActiveFlow || {};
  const activeId = window.__bandActiveFlow[band] || (owned[0] || {}).id;
  const active = owned.find(x => x.id === activeId) || owned[0];
  const tabs = owned.length > 1 ? `<div class="band-flow-tabs">${owned.map(x => `<button type="button" class="${x.id === active.id ? 'active' : ''}" data-band-flow="${esc(x.id)}" data-band="${esc(band)}"><strong>${esc(bandFlowTitle(x.title))}</strong><span>${esc(shortFlowState(x.state))}</span></button>`).join('')}</div>` : '';
  const steps = active.steps || [];
  const current = steps.find(x => ['current', 'blocked'].includes(x.status));
  const doneSteps = steps.filter(x => x.status === 'done' && x.detail);
  const doneEvidence = doneSteps.length ? C.details(U.ui_flow_done_evidence, doneSteps.map(x =>
    `<div class="flow-done-evidence"><strong>${esc(x.name)}</strong><p>${esc(x.detail)}</p></div>`).join('')) : '';
  const currentDetail = current && current.detail ? `<div class="flow-current-detail ${esc(current.status)}"><strong>${esc(current.status === 'blocked' ? U.ui_flow_blocked_reason : U.ui_flow_current_step)}</strong><p>${esc(current.detail)}</p></div>` : '';
  const validity = (D.bands[band] || {}).validity || {};
  const nextAt = validity.next_review_at || '';
  const visibleUntil = validity.result_visible_until || '';
  let nextLine = '';
  if (nextAt && visibleUntil && nextAt === visibleUntil) {
    nextLine = `<div class="flow-next-review"><span>${esc(U.ui_flow_next_expiry)}</span><strong>${esc(dateTimeText(nextAt))}</strong></div>`;
  } else {
    if (nextAt) nextLine += `<div class="flow-next-review"><span>${esc(U.ui_flow_next_review)}</span><strong>${esc(dateTimeText(nextAt))}</strong></div>`;
    if (visibleUntil) nextLine += `<div class="flow-next-review"><span>${esc(U.ui_flow_valid_until)}</span><strong>${esc(dateTimeText(visibleUntil))}</strong></div>`;
  }
  const tone = current && current.status === 'blocked' ? 'warn' : (current ? 'info' : 'muted');
  const progress = fmt(U.ui_flow_progress, {done: steps.filter(x => x.status === 'done').length, total: steps.length});
  // 多流程的活动页签已显示标题与状态，下方只保留进度，不再复述。
  const heading = owned.length > 1 ? `<div class="flow-progress-line">${progress}</div>`
    : `<div class="band-flow-head"><div><strong>${esc(bandFlowTitle(active.title))}</strong><span>${progress}</span></div>${C.badge(shortFlowState(active.state), tone)}</div>`;
  return C.card(U.ui_chain_band_flows, `${tabs}${heading}<div class="compact-steps">${R.flowSteps(active)}</div>${currentDetail}${doneEvidence}${nextLine}`);
};

R.selectBandFlow = function (band, id) {
  window.__bandActiveFlow = window.__bandActiveFlow || {};
  window.__bandActiveFlow[band] = id;
  renderPage('page-' + band);
};

R.openWorkflow = function (band, id) {
  window.__bandActiveFlow = window.__bandActiveFlow || {};
  window.__bandActiveFlow[band] = id;
  const page = 'page-' + band;
  if ($(page)) delete $(page).dataset.rendered;
  location.hash = page;
  showPage(page);
};

document.addEventListener('click', event => {
  const bandButton = event.target.closest('[data-band-flow]');
  if (bandButton) R.selectBandFlow(bandButton.dataset.band, bandButton.dataset.bandFlow);
  const ownerButton = event.target.closest('[data-flow-owner]');
  if (ownerButton) R.openWorkflow(ownerButton.dataset.flowOwner, ownerButton.dataset.flowId);
});

R.monthlyClose = function (close) {
  if (!close || !['closed', 'already_closed'].includes(close.status)) return '';
  return C.card('周期切换封账（已完成）', C.kv('旧周期', `${esc(close.old_label)} · 已花 ${money(close.spent)} · 结余 ${money(close.remaining)}`)
    + C.kv('现金池', `${money(close.cash_before)} → ${money(close.cash_after)}`, 'pos')
    + C.kv('新周期', `${esc(close.new_label)} · 预算 ${money(close.new_budget)} · 已花 ${money(0)} · 剩余 ${money(close.new_budget)}`, 'info'));
};
R.retirementProjection = function () {
  const p = D.retirement_projection || {};
  const coverage = fmt(U.ui_retirement_coverage || '', {
    covered: p.covered_fund_count || 0, total: p.holding_fund_count || 0,
  });
  if (!p.available) return C.card(U.ui_h2_retirement_projection, C.empty(coverage, U.ui_data_awaiting));
  const rows = [
    C.kv(U.ui_retirement_target, money(p.target_amount), 'info'),
    C.kv(U.ui_retirement_annual, pct(p.annual_rate), numTone(p.annual_rate)),
    C.kv(U.ui_retirement_date, esc(p.retire_date)),
    C.kv(U.ui_retirement_remaining, fmt(U.ui_retirement_years || '', { years: p.years_remaining })),
    C.kv(U.ui_retirement_contribution, money(p.monthly_budget), 'info'),
    C.kv(U.ui_retirement_principal, money(p.principal), 'info'),
    C.kv(U.ui_retirement_profit, money(p.projected_profit), numTone(p.projected_profit)),
  ].join('');
  const note = `<p class="muted">${esc(coverage)}</p><p class="muted">${esc(U.ui_retirement_assumption || '')}</p>`;
  return C.card(U.ui_h2_retirement_projection, rows + note);
};

R.retirementPage = function () {
  const r = D.retirement || {};
  const metrics = C.metricGrid([
    [U.ui_ret_metric_market, money(r.total_market_value), 'info'],
    [U.ui_ret_metric_cost, money(r.total_cost), 'info'],
    [U.ui_ret_metric_profit, money(r.total_profit), numTone(r.total_profit)],
    [U.ui_ret_metric_profit_rate, pct(r.total_profit_rate), numTone(r.total_profit_rate)],
  ]);
  const note = r.return_note ? `<p class="muted">${esc(r.return_note)}</p>` : '';
  const base = `<div class="muted">${esc(fmt(U.ui_retirement_base, {date: dateText(D.base_date)}))}</div>`;
  return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(U.ui_retirement_title || '')}</h1>${base}</div>${metrics}${R.retirementProjection()}${note}`;
};

// ---------- 页面渲染引擎 ----------
function renderPage(pageId) {
  const el = $(pageId);
  if (!el) return;
  const schema = PAGE_SCHEMA[pageId] || [];
  const html = schema.map(node => {
    const fn = R[node.fn];
    if (typeof fn !== 'function') return '';
    try {
      if (node.from) {
        const b = (D.bands || {})[node.from] || {};
        const a = b.artifacts || {};
        if (b.validity && b.validity.state === 'awaiting' && node.fn !== 'bandHeader') return '';
        if (resultExpired(b.validity) && node.fn !== 'bandHeader') return '';
        if (node.fn === 'checkScan') return fn(b);
        if (node.fn === 'attention') return fn(b);
        if (node.fn === 'yourAction') return fn(b);
        if (node.fn === 'normalItems') return fn(b);
        if (node.fn === 'positionRows') return fn(b.items);
        if (node.fn === 'nextReview') return fn(b.next_review);
        if (node.fn === 'marketEnv') return fn(b.market_env);
        if (node.fn === 'assetAllocation') return fn(b.asset_allocation);
        if (node.fn === 'equityStructure') return fn(b.equity_structure);
        if (node.fn === 'satelliteExecution') return fn(b.execution_plan);
        if (node.fn === 'settledCash') return fn(b.rebalance_cash);
        if (node.fn === 'allocation') return fn(b);
        if (node.fn === 'quarterReview') return fn(a);
        if (node.fn === 'bandAction') return fn(a);
        if (node.fn === 'quarterAction') return fn(a, b.validity);
        if (node.fn === 'quarterEvidence') return fn(b);
        if (node.fn === 'rebalance') return fn(a.rebalance);
        if (node.fn === 'flow') return fn(a.rebalance);
        if (node.fn === 'concentration') return fn(a.concentration);
        if (node.fn === 'exitReviews') return fn(a.exit_reviews);
        if (node.fn === 'monthlyDetails') return fn(b);
        if (node.fn === 'monthlyReview') return fn(a.monthly_review);
        if (node.fn === 'monthlyClose') return fn(a.monthly_close || b.monthly_close);
        if (node.fn === 'periodSummary') return fn(a.period_summary);
        if (node.fn === 'takeProfit') return fn(a.take_profit);
        if (node.fn === 'fundingReview') return fn(a.funding_review);
        if (node.fn === 'scan') return fn(a.scan);
        if (node.fn === 'execution') return fn(a.execution_review, a.unlock_review);
        if (node.fn === 'addOn') return fn(a.add_on_reviews, a.add_on_summary);
        if (node.fn === 'weeklyBudget') return fn(a);
        if (node.fn === 'evalCash') return fn(a);
        if (node.fn === 'weekGate') return fn(a.week_gate);
        if (node.fn === 'netAddition') return fn(a.net_addition);
        // 兜底：未登记的区块直接传整档数据，避免"schema 加了、白名单漏了"导致区块静默消失
        return fn(b);
      }
      return fn(node.arg);
    } catch (e) {
      return C.card('', C.empty('区块渲染失败', e.message));
    }
  }).join('');
  el.innerHTML = html || C.empty('', '本页暂无内容。');
  if (pageId === 'page-rules') bindRuleSearch();
}

// ---------- 导航（配置驱动） ----------
const NAV = [
  { id: 'page-retirement', label: '养老' },
  { id: 'page-chain', label: '流程导航' },
  { id: 'page-band_daily', label: '每日' },
  { id: 'page-band_eval', label: '周日' },
  { id: 'page-band_monthly', label: '月度' },
  { id: 'page-band_quarter', label: '季度' },
];

function renderNav() {
  $('nav').innerHTML = NAV.map(n => `<a href="#${n.id}" data-page="${n.id}">${esc(n.label)}</a>`).join('');
}

function showPage(pageId) {
  const valid = NAV.some(n => n.id === pageId) || pageId === 'page-rules';
  const target = valid ? pageId : 'page-retirement';
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === target));
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === target));
  if (!$(target).dataset.rendered) {
    renderPage(target);
    $(target).dataset.rendered = '1';
  }
  window.scrollTo({ top: 0 });
}

function bindRuleSearch() {
  const inp = $('rule-search');
  if (!inp || inp.dataset.bound) return;
  inp.dataset.bound = '1';
  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    const chapters = (D.rules || []).filter(c => !q || String(c.title || '').includes(q));
    const host = inp.closest('.page') || inp.parentElement.parentElement;
    const listHtml = chapters.map(c => `<div class="card" data-rule="${esc(c.title)}"><div class="fund-top"><strong>${esc(c.title)}</strong></div></div>`).join('')
      || C.empty('', '没有匹配的章节。');
    // 只替换列表部分（保留搜索框）
    const old = host.querySelectorAll('.card, .empty');
    old.forEach(x => x.remove());
    host.insertAdjacentHTML('beforeend', listHtml);
    host.querySelectorAll('[data-rule]').forEach(el => el.addEventListener('click', () => {
      const ch = (D.rules || []).find(c => c.title === el.dataset.rule);
      if (!ch) return;
      const body = (ch.content || []).map(x => `<p class="lead">${esc(x.text || '')}</p>`).join('');
      host.insertAdjacentHTML('beforeend', `<div class="card rule-detail"><h2>${esc(ch.title)}</h2>${body}</div>`);
    }));
  });
}

let expiryTimer = null;
function scheduleResultExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  const sources = Object.values(D.bands || {}).map(b => b.validity || {});
  const future = sources.map(v => Date.parse(v.result_visible_until || ''))
    .filter(t => Number.isFinite(t) && t > Date.now());
  if (!future.length) return;
  const delay = Math.max(0, Math.min(...future) - Date.now()) + 50;
  expiryTimer = setTimeout(() => {
    document.querySelectorAll('.page').forEach(p => { delete p.dataset.rendered; });
    const active = document.querySelector('.page.active');
    if (active) renderPage(active.id);
    scheduleResultExpiry();
  }, Math.min(delay, 2147483647));
}

// ---------- 四态：加载 / 正常 / 空 / 错误 ----------
async function init() {
  try {
    const r = await fetch(`h5_data.json?t=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    D = await r.json();
    U = D.ui_labels || {};
    renderShell();
    renderNav();
    $('boot-skeleton').remove();
    showPage(location.hash.slice(1) || 'page-retirement');
    scheduleResultExpiry();
    startAutoRefresh();
    window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'page-retirement'));
  } catch (e) {
    $('boot-skeleton').remove();
    $('main').innerHTML = `<div class="error-state"><div>页面数据读取失败：${esc(e.message)}</div><button onclick="location.reload()">重试</button></div>`;
  }
}

const AUTO_REFRESH_MS = 15000;
let lastGeneratedAt = null;

async function pollForUpdates() {
  if (document.visibilityState !== 'visible' || !lastGeneratedAt) return;
  if (document.activeElement && document.activeElement.id === 'rule-search') return;
  try {
    const r = await fetch(`h5_data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const next = await r.json();
    if (!next.generated_at || next.generated_at === lastGeneratedAt) return;
    const active = document.querySelector('.page.active');
    const scrollY = window.scrollY;
    D = next;
    U = D.ui_labels || {};
    lastGeneratedAt = D.generated_at;
    renderShell();
    document.querySelectorAll('.page').forEach(p => { delete p.dataset.rendered; });
    if (active) {
      renderPage(active.id);
      active.dataset.rendered = '1';
    }
    scheduleResultExpiry();
    window.scrollTo({ top: scrollY });
  } catch (e) {
    // 自动刷新失败保留当前可用页面，下一轮再试；不清空、不伪装无数据。
    console.warn('H5自动刷新暂未成功', e);
  }
}

function startAutoRefresh() {
  lastGeneratedAt = D.generated_at || null;
  window.setInterval(pollForUpdates, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', pollForUpdates);
}

function renderShell() {
  $('header-date').textContent = `基准 ${dateText(D.base_date)}`;
  const st = D.status || {};
  const banner = $('global-status');
  if (st.label) {
    banner.hidden = false;
    banner.className = 'status-banner live';
    banner.textContent = `${st.label}${st.description ? ' · ' + st.description : ''} · 页面生成 ${dateTimeText(D.generated_at)}`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
