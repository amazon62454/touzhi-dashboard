// ============================================================
// V2 H5 渲染引擎 · 2026-11-17 专项重构
// 架构：数据(h5_data.json) → 声明式页面Schema → 组件库 → 四态统一
// 原则：零依赖 · 文案零硬编码(text_templates) · 数值零硬编码(全部来自数据)
// ============================================================

let D = null;
let U = {};               // 界面文案（text_templates ui_ 前缀）
const $ = id => document.getElementById(id);

// ---------- 工具 ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null) ? o[k] : '');
const money = v => (v === null || v === undefined || v === '') ? '—' : `${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}元`;
const pct = v => (v === null || v === undefined || v === '') ? '—' : `${Number(v).toFixed(2)}%`;
const dateText = v => (v && v !== '未记录基准日') ? v : '未记录基准日';
const shortReason = v => v || '按SOP规则判定';
const has = v => v !== null && v !== undefined && v !== '';
const fundName = (fc, fallback) => {
  const f = ((D && D.retirement && D.retirement.funds) || []).find(x => String(x.fund_code) === String(fc));
  return (f && f.fund_name) || fallback || '';
};

// ---------- 组件库（纯函数 → HTML，样式全部走 class 不写行内样式） ----------
const C = {
  card(title, body, kind = '') {
    if (!body) return '';
    return `<div class="card ${kind}">${title ? `<h2>${title}</h2>` : ''}${body}</div>`;
  },
  kv(label, value, note) {
    return `<div class="money-row"><span>${esc(label)}${note ? `<small> ${esc(note)}</small>` : ''}</span><strong>${value}</strong></div>`;
  },
  badge(text, kind = 'info') { return `<span class="badge ${kind}">${esc(text)}</span>`; },
  statusBadge(status) {
    const s = String(status || '');
    const kind = /🔴/.test(s) ? 'danger' : /⚠️/.test(s) ? 'warn' : /💰/.test(s) ? 'info' : /🟢/.test(s) ? 'ok' : 'muted';
    return C.badge(s || '—', kind);
  },
  empty(title, note) {
    return `<div class="empty">${title ? `<div class="empty-title">${esc(title)}</div>` : ''}${note ? esc(note) : ''}</div>`;
  },
  metricGrid(items) {
    const rows = (items || []).filter(x => x).map(([label, value]) =>
      `<div class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div></div>`).join('');
    return rows ? `<div class="metric-grid">${rows}</div>` : '';
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
  orderedList(items) {
    if (!items || !items.length) return '';
    return `<ol class="action-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  },
  fundRows(rows) {
    if (!rows || !rows.length) return C.empty(U.ui_empty_no_position);
    return rows.map(x => `
      <div class="fund-row">
        <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '')}</strong><strong>${has(x.market_value) ? money(x.market_value) : ''}</strong></div>
        <div class="fund-numbers">${esc(x.fund_code || '')}${has(x.profit) ? ` · 收益 ${money(x.profit)}` : ''}${has(x.profit_rate) ? ` · ${pct(x.profit_rate)}` : ''}${x.status ? ` · ${esc(x.status)}` : ''}</div>
      </div>`).join('');
  },
  details(summary, body) { return body ? `<details><summary>${esc(summary)}</summary>${body}</details>` : ''; },
};

// ---------- 渲染器（业务区块：数据 → 组件组合） ----------
const R = {
  // 首页
  homeHero() {
    const h = D.home || {};
    const actions = (h.actions || []).length ? C.actionList(h.actions) : '';
    const total = has(h.total_action_amount) ? C.kv('合计待执行金额', money(h.total_action_amount)) : '';
    return C.card('', `<div class="lead" style="margin:0 0 8px">${esc(U.ui_home_eyebrow || '')}</div><h1>${esc(h.headline || '')}</h1>${actions}${total}`, 'accent');
  },
  bandCards() {
    const cards = (D.home && D.home.cards) || [];
    if (!cards.length) return '';
    return cards.map(c => `<a href="#page-${esc(c.id)}" class="card" style="display:block;color:inherit">
      <div class="fund-top"><strong>${esc(c.title)}</strong>${C.badge(c.run_mode === 'test' ? (D.status && D.status.label) || '测试' : '正式', c.run_mode === 'test' ? 'warn' : 'ok')}</div>
      <div class="fund-numbers">${esc(c.summary || '')} · 基准 ${esc(dateText(c.base_date))}</div></a>`).join('');
  },
  changelog() {
    const raw = (D.home && D.home.changelog) || null;
    if (!raw) return '';
    const cl = Array.isArray(raw) ? raw : [raw];
    if (!cl.length) return '';
    const rows = cl.map(x => `<div class="changelog-row"><div class="changelog-date">${esc(x.date || '')}</div><div class="changelog-text">${esc(x.summary || x.text || '')}</div></div>`).join('');
    return C.card(U.ui_h2_changelog || '最近系统改了什么', rows);
  },
  health() {
    const hs = (D.home && D.home.health) || [];
    if (!hs.length) return C.card(U.ui_h2_health || '本次数据是否齐全', C.empty('', '数据源全部正常'));
    const rows = hs.map(x => `<div class="money-row"><span>${esc(x.name)} · ${esc(x.detail || '')}</span>${C.statusBadge(x.status)}</div>`).join('');
    return C.card(U.ui_h2_health || '本次数据是否齐全', rows);
  },

  // 档位页公共头
  bandHeader(band) {
    const b = (D.bands || {})[band] || {};
    return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(b.title || '')}</h1>
      <p class="lead">${esc(b.summary || '')}</p>
      <div class="muted">${C.badge(b.run_mode === 'test' ? ((D.status && D.status.label) || '测试') : '正式', b.run_mode === 'test' ? 'warn' : 'ok')} 基准 ${esc(dateText(b.base_date))}</div></div>`;
  },

  // 每日档
  checkScan(b) {
    const checks = (b.artifacts && b.artifacts.daily_checks) || [];
    if (!checks.length) return '';
    const rows = checks.map(c => `<div class="money-row"><span>${esc(c.name || '')}</span>${C.statusBadge(c.status)}</div><p class="lead">${esc(c.detail || '')}</p>`).join('');
    return C.card(fmt(U.ui_h2_check_scan, { n: checks.length }), rows);
  },
  attention(b) { return C.card(U.ui_h2_attention, C.actionList(b.attention_items)); },
  yourAction(b) {
    const txt = (b.attention_items && b.attention_items.length) ? '按上方需要关注项处置，执行后回传我记台账' : '无';
    return C.card(U.ui_h2_your_action, `<p class="lead">${esc(txt)}</p>`, 'accent');
  },
  normalItems(b) {
    const items = b.normal_items || [];
    const label = b.normal_label || U.ui_normal_rest || '其余 {n} 只：未触发风控';
    return C.details(fmt(label, { n: items.length }), C.actionList(items));
  },

  // 债基再平衡
  rebalance(r) {
    if (!r) return '';
    const body = `<p class="lead">${esc(r.action || '')}</p>
      ${C.kv('当前债比 / ERP目标', `${pct(r.debt_weight)} / ${pct(r.debt_target)}`)}
      ${C.kv('启动线 / 补债下沿', `${pct(r.start_line)} / ${pct(r.lower_line)}`)}
      ${r.actual_amount_note ? `<p class="muted">${esc(r.actual_amount_note)}</p>` : ''}`;
    return C.card(U.ui_h2_rebalance, body, r.active ? 'warn' : '');
  },
  flow(r) {
    if (!r || !r.flows) return '';
    const body = `${C.kv('权益层', money(r.flows.equity))}${C.kv('债券层（受债比闸门约束）', money(r.flows.debt))}${C.kv('现金层', money(r.flows.cash))}
      <p class="muted">三层合计 ${money(r.monthly_budget)}；存量再平衡不计入这份新增预算。</p>`;
    return C.card(`${esc(r.erp_label || '')}态月度流量分配`, body);
  },

  // 月度档
  monthlyReview(mr) {
    if (!mr) return '';
    const ret = mr.item2_收益率 || {};
    const cum = ret['累计'] || {};
    const cumRows = Object.entries(cum).map(([fc, r]) =>
      C.kv(fundName(fc) || fc, pct(r), fc)).join('');
    const mom = (ret['月度(快照对比)'] || {}).TOTAL;
    const inv = mr.item4_定投统计 || {};
    const body = `${C.kv('数据完整性', esc(mr.item1_完整性))}
      ${C.kv('本月组合收益率', mom != null ? pct(mom) : '—')}
      ${cumRows}
      ${C.kv('定投执行', inv['次数'] != null ? `${esc(inv['次数'])}笔 / ${money(inv['金额'])}` : '—')}
      <p class="lead">${esc(mr.item3_加减仓回顾 || '')}</p>
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
    return C.card(U.ui_h2_period_summary || '本周期总结', parts.join(''));
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
      <div class="fund-top"><strong>${esc(x.sector || '')} · ${esc(x.fund_name || fundName(x.fund_code) || x.fund_code || '待锁定基金')}</strong><strong>${pct(x.valuation)}</strong></div>
      <div class="fund-numbers">${esc(x.fund_code || '未登记代码')} · ${esc(x.decision || '')}：${esc(x.reason || '')}</div></div>`).join('')
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
    return C.card(U.ui_h2_position_health, C.actionList(items));
  },
  fundDest() {
    const f = D.funds_page || {};
    const rows = (f.channels || []).map(x => {
      const v = x.value;
      const val = (v === null || v === undefined || v === '') ? '—' : (Number.isFinite(Number(v)) ? money(Number(v)) : esc(String(v)));
      return C.kv(x.name, val);
    }).join('');
    return C.card(U.ui_h2_fund_dest, rows);
  },
  fundsMetrics() {
    const f = D.funds_page || {};
    return C.metricGrid([
      ['本周期剩余', money(f.remaining)],
      ['现金池', money(f.cash_pool)],
    ]);
  },
  cashDetail() {
    const cd = (D.funds_page || {}).cash_detail;
    if (!cd) return '';
    const parts = [
      C.kv('现金池累计余额', money(cd.balance)),
      cd.monthly_inject != null ? C.kv('月度注入额', money(cd.monthly_inject)) : '',
      cd.last_period_note ? `<p class="muted">上期结余：${esc(cd.last_period_note)}</p>` : '',
    ].join('');
    return C.card(U.ui_h2_cash_pool, parts);
  },

  // 季度档
  quarterAction(a) {
    return a && a.action_checklist ? C.card(U.ui_h2_quarter_action, C.orderedList(a.action_checklist), 'accent') : '';
  },
  allocation(b) {
    const weights = (b.allocation || {}).weights || {};
    const keys = Object.keys(weights);
    if (!keys.length) return C.card(U.ui_h2_allocation, C.empty('', '配置数据不足。'));
    const rows = keys.map(k => C.kv(k, pct(weights[k]))).join('');
    return C.card(U.ui_h2_allocation, rows);
  },
  concentration(c) {
    if (!c) return '';
    const secs = Array.isArray(c.sectors) ? c.sectors : Object.entries(c.sectors || {}).map(([k, v]) => ({ sector: k, weight: v }));
    const rows = secs.map(x => `<div class="money-row"><span>${esc(x.sector || '')}${x.over ? ' ' + C.badge('超限', 'danger') : ''}</span><strong>${pct(x.weight)}</strong></div>`).join('');
    const total = c.total ?? c.total_market_value;
    return C.card(fmt(U.ui_h2_concentration, { limit: pct(c.limit) }), `${rows}${total ? `<p class="muted">组合总市值 ${money(total)}</p>` : ''}`);
  },
  exitReviews(rows) {
    if (!rows || !rows.length) return '';
    const body = rows.map(x => `<div class="fund-row">
      <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong>${C.statusBadge(x.action || '')}</div>
      <div class="fund-numbers">${esc(x.fund_code || '')} · ${esc(x.reason || '')}</div></div>`).join('');
    return C.card(U.ui_h2_exit_review, body);
  },
  quarterReview(a) {
    const s = a && a.scale_review, bt = a && a.backtest;
    if (!s && !bt) return '';
    const parts = [];
    if (s) parts.push(C.kv('基金规模复核', esc(s.status || '')));
    if (bt) {
      // 字段名对齐数据：signal_count/outcome_count（旧写 signals/results 不存在→永远显0/0）
      parts.push(C.kv('信号流水 / 有结果样本', `${esc(bt.signal_count ?? 0)} / ${esc(bt.outcome_count ?? 0)}`));
      if (bt.status) parts.push(`<p class="muted">${esc(bt.status)}</p>`);
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
  marketEnv(env) {
    if (!env) return '';
    const rows = `${C.kv('沪深300估值分位', pct(env.hs300_pe_pct))}${C.kv('ERP态', esc(env.erp_state || ''))}`;
    return C.card(U.ui_h2_market_env, rows);
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
    const rows = `${C.kv('周期', esc(f.period || '—'))}${C.kv('注入', money(f.injection))}${C.kv('已用', money(f.spent))}${C.kv('剩余', money(f.remaining))}`;
    return C.card(U.ui_h2_ledger_flow, rows);
  },

  // 周日档
  evalAmount(b) {
    const items = (b.items || []).filter(x => x.action !== '暂停' || !String(x.reason || '').includes('富国'));
    if (!items.length) return '';
    const body = items.map(x => {
      const vp = x.params && has(x.params.valuation_pct) ? pct(x.params.valuation_pct) : '—';
      const amt = has(x.amount) ? `${x.amount}元` : '—';
      const r = String(x.reason || '');
      const m = r.match(/排名第\s*\d+/);
      // 排名类说明压成短标签（分位+排名第N），不再把整句套话另起一行阻断列表；
      // 非排名类（养老固定额/债基/高估暂停等）保留原因，因为它是该只为何这个金额的唯一解释。
      const brief = m ? `分位 ${vp} · ${m[0]}` : `分位 ${vp}${r ? ' · ' + r : ''}`;
      return `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}<small> ${esc(x.fund_code || '')}</small></strong><strong>${esc(x.action || '')} ${amt}</strong></div><div class="fund-numbers">${esc(brief)}</div></div>`;
    }).join('');
    return C.card(U.ui_h2_eval_amount, `<p class="muted">分位低→高，主动/FOF表末；下周一前理财通改额</p>${body}`);
  },
  addOn(rows, summary) {
    // 只展示参与评分(有评分)的基金；"不参与"(FOF/主动/持有期/未进低估区)不占版面(用户2026-11-18要求)。
    const list = (rows || []).filter(x => has(x.score));
    const sm = summary ? `<p class="muted">${esc(typeof summary === 'string' ? summary : JSON.stringify(summary))}</p>` : '';
    if (!list.length) return sm ? C.card(U.ui_h2_addon_score, sm) : '';
    const body = list.map(x => {
      const sc = Number(x.score);
      const th = has(x.threshold) ? Number(x.threshold) : null;
      const hit = th != null && sc >= th;
      return `<div class="fund-row">
        <div class="fund-top"><strong>${esc(x.fund_name || fundName(x.fund_code) || '')}</strong><strong>${sc}</strong></div>
        <div class="fund-numbers">${esc(x.fund_code || '')}${th != null ? ` · 门槛${th}` : ''}${x.decision ? ` · ${esc(x.decision)}` : ''}${hit ? ' ' + C.badge('达标', 'ok') : ''}</div></div>`;
    }).join('');
    return C.card(U.ui_h2_addon_score, body + sm);
  },
  evalActionList() {
    return C.card(U.ui_h2_action_list, `<p class="lead">按下表逐只改理财通定投额：调高/调低/暂停/恢复；只改金额不改策略</p>`);
  },

  evalCash(a) {
    const cash = a.cash_pool;
    if (cash === null || cash === undefined) return '';
    return C.card(U.ui_h2_cash_pool, C.kv('现金池余额', money(cash)));
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
  'page-home': [
    { fn: 'homeHero' }, { fn: 'bandCards' }, { fn: 'changelog' }, { fn: 'health' },
  ],
  'page-band_daily': [
    { fn: 'bandHeader', arg: 'band_daily' }, { fn: 'checkScan', from: 'band_daily' },
    { fn: 'attention', from: 'band_daily' }, { fn: 'nextReview', from: 'band_daily' },
    { fn: 'ledgerFlow' }, { fn: 'marketEnv', from: 'band_daily' }, { fn: 'yourAction', from: 'band_daily' },
    { fn: 'normalItems', from: 'band_daily' },
  ],
  'page-band_eval': [
    { fn: 'bandHeader', arg: 'band_eval' }, { fn: 'evalAmount', from: 'band_eval' },
    { fn: 'evalCash', from: 'band_eval' }, { fn: 'netAddition', from: 'band_eval' },
    { fn: 'evalActionList' }, { fn: 'addOn', from: 'band_eval' }, { fn: 'attention', from: 'band_eval' },
    { fn: 'normalItems', from: 'band_eval' },
  ],
  'page-band_monthly': [
    { fn: 'bandHeader', arg: 'band_monthly' }, { fn: 'fundsMetrics' },
    { fn: 'rebalance', from: 'band_monthly' }, { fn: 'flow', from: 'band_monthly' },
    { fn: 'monthlyReview', from: 'band_monthly' }, { fn: 'periodSummary', from: 'band_monthly' },
    { fn: 'takeProfit', from: 'band_monthly' }, { fn: 'fundingReview', from: 'band_monthly' },
    { fn: 'scan', from: 'band_monthly' }, { fn: 'positionRows', from: 'band_monthly' },
    { fn: 'execution', from: 'band_monthly' }, { fn: 'fundDest' },
  ],
  'page-band_quarter': [
    { fn: 'bandHeader', arg: 'band_quarter' }, { fn: 'quarterAction', from: 'band_quarter' },
    { fn: 'allocation', from: 'band_quarter' }, { fn: 'rebalance', from: 'band_quarter' },
    { fn: 'concentration', from: 'band_quarter' }, { fn: 'exitReviews', from: 'band_quarter' },
    { fn: 'quarterReview', from: 'band_quarter' }, { fn: 'yourAction', from: 'band_quarter' },
    { fn: 'normalItems', from: 'band_quarter' },
  ],
  'page-retirement': [{ fn: 'retirementPage' }],
  'page-funds': [{ fn: 'fundsPage' }],
  'page-rules': [{ fn: 'ruleList' }],
};

// ---------- 特殊页渲染 ----------
R.retirementPage = function () {
  const r = D.retirement || {};
  const metrics = C.metricGrid([
    ['当前持有市值', money(r.total_market_value)],
    ['持仓成本', money(r.total_cost)],
    ['持仓收益', money(r.total_profit)],
    ['持仓收益率', pct(r.total_profit_rate)],
    ['每月投入上限', money(r.monthly_budget)],
  ]);
  const funds = C.card(U.ui_h2_position_detail || '持仓明细', C.fundRows(r.funds));
  const note = r.return_note ? `<p class="muted">${esc(r.return_note)}</p>` : '';
  return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(U.ui_retirement_title || '现在积累了多少')}</h1></div>${metrics}${funds}${note}`;
};
R.fundsPage = function () {
  return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(U.ui_funds_title || '本周期资金')}</h1></div>${R.fundsMetrics()}${R.cashDetail()}${R.ledgerFlow()}${R.fundDest()}`;
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
        if (node.fn === 'checkScan') return fn(b);
        if (node.fn === 'attention') return fn(b);
        if (node.fn === 'yourAction') return fn(b);
        if (node.fn === 'normalItems') return fn(b);
        if (node.fn === 'positionRows') return fn(b.items);
        if (node.fn === 'nextReview') return fn(b.next_review);
        if (node.fn === 'marketEnv') return fn(b.market_env);
        if (node.fn === 'allocation') return fn(b);
        if (node.fn === 'quarterReview') return fn(a);
        if (node.fn === 'quarterAction') return fn(a);
        if (node.fn === 'rebalance') return fn(a.rebalance);
        if (node.fn === 'flow') return fn(a.rebalance);
        if (node.fn === 'concentration') return fn(a.concentration);
        if (node.fn === 'exitReviews') return fn(a.exit_reviews);
        if (node.fn === 'monthlyReview') return fn(a.monthly_review);
        if (node.fn === 'periodSummary') return fn(a.period_summary);
        if (node.fn === 'takeProfit') return fn(a.take_profit);
        if (node.fn === 'fundingReview') return fn(a.funding_review);
        if (node.fn === 'scan') return fn(a.scan);
        if (node.fn === 'execution') return fn(a.execution_review, a.unlock_review);
        if (node.fn === 'evalAmount') return fn(b);
        if (node.fn === 'addOn') return fn(a.add_on_reviews, a.add_on_summary);
        if (node.fn === 'evalCash') return fn(a);
        if (node.fn === 'netAddition') return fn(a.net_addition);
        return '';
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
  { id: 'page-home', label: '今日' },
  { id: 'page-band_daily', label: '每日' },
  { id: 'page-band_eval', label: '周日' },
  { id: 'page-band_monthly', label: '月度' },
  { id: 'page-band_quarter', label: '季度' },
  { id: 'page-retirement', label: '养老' },
  { id: 'page-funds', label: '资金' },
];

function renderNav() {
  $('nav').innerHTML = NAV.map(n => `<a href="#${n.id}" data-page="${n.id}">${esc(n.label)}</a>`).join('');
}

function showPage(pageId) {
  const valid = NAV.some(n => n.id === pageId) || pageId === 'page-rules';
  const target = valid ? pageId : 'page-home';
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
    showPage(location.hash.slice(1) || 'page-home');
    window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'page-home'));
  } catch (e) {
    $('boot-skeleton').remove();
    $('main').innerHTML = `<div class="error-state"><div>页面数据读取失败：${esc(e.message)}</div><button onclick="location.reload()">重试</button></div>`;
  }
}

function renderShell() {
  $('header-date').textContent = `基准 ${dateText(D.base_date)}`;
  const st = D.status || {};
  const banner = $('global-status');
  if (st.label) {
    banner.hidden = false;
    banner.className = 'status-banner' + (st.is_test ? '' : ' live');
    banner.textContent = `${st.label}${st.description ? ' · ' + st.description : ''} · 页面生成 ${D.generated_at || ''}`;
  }
}

document.addEventListener('DOMContentLoaded', init);
