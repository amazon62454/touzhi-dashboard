// 人读版H5：只渲染h5_export.py整理好的报告，不实现投资规则。
let D = null;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline = v => esc(v).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const money = v => v === null || v === undefined || v === '' ? '—' : `${Number(v).toLocaleString('zh-CN', {maximumFractionDigits: 2})}元`;
const pct = v => v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(2)}%`;
const dateText = v => v && v !== '未记录基准日' ? v : '未记录基准日';
const shortReason = v => v || '按SOP规则判定';

async function init() {
  try {
    const r = await fetch(`h5_data.json?t=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    D = await r.json();
    renderShell(); renderHome(); renderRetirement(); renderFunds(); renderBands(); renderRules();
    bindNavigation(); bindFeedback();
    showPage(location.hash.slice(1) || 'page-home');
  } catch (e) {
    $('app').innerHTML = `<div class="card">页面数据读取失败：${esc(e.message)}</div>`;
  }
}

function renderShell() {
  $('header-date').textContent = `基准 ${dateText(D.base_date)}`;
  $('global-status').className = `status-bar ${D.status.is_test ? 'test' : ''}`;
  $('global-status').textContent = `${D.status.label} · ${D.status.description} · 页面生成 ${D.generated_at || '—'}`;
}

function actionRows(items, showZero = true) {
  if (!items || !items.length) return '<div class="empty">暂无条目。</div>';
  return `<div class="action-list">${items.map(x => `
    <div class="action-row">
      <div><div class="action-name">${esc(x.fund_name)}<span class="action-code">${esc(x.fund_code)}</span></div>
      <div class="action-reason">${esc(x.action)} · ${esc(shortReason(x.reason))}</div></div>
      <div class="action-amount">${x.amount !== null && x.amount !== undefined && Number(x.amount) !== 0 ? money(x.amount) : ''}${x.params && x.params.valuation_pct !== null && x.params.valuation_pct !== undefined ? `<small>估值 ${pct(x.params.valuation_pct)}</small>` : ''}</div>
    </div>`).join('')}</div>`;
}

function renderHome() {
  const h = D.home;
  $('home-headline').textContent = h.headline;
  $('home-actions').innerHTML = h.total_action_amount !== null
    ? `<div class="action-total">${money(h.total_action_amount)}</div>${actionRows(h.actions)}`
    : `<div class="empty">${D.status.is_test ? '正式结论生成后，这里只列真正需要你执行的事项。' : '今天无需操作。'}</div>`;
  $('band-cards').innerHTML = h.cards.map(c => `
    <button class="band-card" data-page="page-${esc(c.id)}">
      <strong>${esc(c.title)}</strong><span class="band-summary">${esc(c.summary)}</span>
      <span>${c.run_mode === 'test' ? '测试预览' : '正式'} · 基准 ${esc(dateText(c.base_date))}</span>
    </button>`).join('');
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { location.hash = b.dataset.page; showPage(b.dataset.page); });
  $('changelog').innerHTML = `<div class="change-date">${esc(h.changelog.date || '未记录日期')}</div><div>本次涉及：${esc(h.changelog.categories || '规则与执行链路')}</div><details class="meta-text"><summary>查看技术修订明细</summary><p>${esc(h.changelog.summary)}</p></details>`;
  $('health').innerHTML = h.health.length ? h.health.map(x => `<div class="health-row"><span>${esc(x.name)} · ${esc(x.detail)}</span><strong>${esc(x.status)}</strong></div>`).join('') : '<div class="empty">本次没有数据质量明细。</div>';
}

function renderRetirement() {
  const r = D.retirement;
  const metrics = [
    ['当前持有市值', money(r.total_market_value), ''],
    ['持仓成本', money(r.total_cost), ''],
    ['持仓收益', money(r.total_profit), r.total_profit > 0 ? 'positive' : r.total_profit < 0 ? 'negative' : ''],
    ['持仓收益率', pct(r.total_profit_rate), r.total_profit_rate > 0 ? 'positive' : r.total_profit_rate < 0 ? 'negative' : ''],
    ['每月投入上限', typeof r.monthly_budget === 'number' ? money(r.monthly_budget) : (r.monthly_budget || '—'), ''],
  ];
  $('retirement-summary').innerHTML = metrics.map(([k,v,c]) => `<div class="metric"><div class="metric-label">${k}</div><div class="metric-value ${c}">${esc(v)}</div></div>`).join('');
  $('retirement-funds').innerHTML = r.funds.length ? r.funds.map(f => `
    <div class="fund-row"><div class="fund-top"><strong>${esc(f.fund_name)}</strong><strong>${money(f.market_value)}</strong></div>
    <div class="fund-numbers">${esc(f.fund_code)} · 收益 ${money(f.profit)} · ${pct(f.profit_rate)}</div>
    <div class="fund-status">${esc(f.status)}</div></div>`).join('') : '<div class="empty">暂无持仓数据。</div>';
  $('return-note').textContent = r.return_note;
}

function renderFunds() {
  const f = D.funds_page;
  const metrics = [['账本周期', f.period], ['发薪注入', money(f.injection)], ['本周期已用', money(f.spent)], ['本周期剩余', money(f.remaining)], ['现金池', money(f.cash_pool)]];
  $('funds-summary').innerHTML = metrics.map(([k,v]) => `<div class="metric"><div class="metric-label">${k}</div><div class="metric-value">${esc(v)}</div></div>`).join('');
  $('fund-channels').innerHTML = f.channels.length ? f.channels.map(x => `<div class="money-row"><span>${esc(x.name)}</span><strong>${esc(x.value || '—')}</strong></div>`).join('') : '<div class="empty">暂无资金流水。</div>';
}

function renderBands() {
  document.querySelectorAll('.band-page').forEach(page => {
    const key = page.dataset.band;
    const b = D.bands[key];
    page.querySelector('.band-header').innerHTML = `<div class="page-heading"><div class="eyebrow">${esc(b.title)}</div><h1>${esc(b.summary)}</h1></div>
      <div class="band-meta"><span class="badge ${b.run_mode === 'test' ? 'test' : ''}">${b.run_mode === 'test' ? '测试·非正式' : '正式'}</span> 基准 ${esc(dateText(b.base_date))}${b.generated_at ? ` · 生成 ${esc(b.generated_at)}` : ''}</div>`;
    let content = '';
    if (key === 'band_daily') {
      content = `<div class="card"><h2>需要关注</h2>${actionRows(b.attention_items)}</div>
        <div class="card"><details><summary>其余 ${b.normal_items.length} 只基金：未触发风控</summary>${actionRows(b.normal_items)}</details></div>`;
    } else if (key === 'band_monthly') {
      const f = D.funds_page;
      const a = b.artifacts || {};
      content = `${rebalanceCard(a.rebalance)}
        <div class="metric-grid"><div class="metric"><div class="metric-label">本周期剩余</div><div class="metric-value">${money(f.remaining)}</div></div>
        <div class="metric"><div class="metric-label">现金池</div><div class="metric-value">${money(f.cash_pool)}</div></div></div>
        ${flowCard(a.rebalance)}
        ${fundingReviewCard(a.funding_review)}
        ${scanCard(a.scan)}
        <div class="card"><h2>持仓健康度</h2>${positionRows(b.items)}</div>
        ${executionCard(a.execution_review, a.unlock_review)}
        <div class="card"><h2>本周期资金去向</h2>${f.channels.map(x => `<div class="money-row"><span>${esc(x.name)}</span><strong>${esc(x.value || '—')}</strong></div>`).join('')}</div>`;
    } else if (key === 'band_quarter') {
      const weights = (b.allocation || {}).weights || {};
      const a = b.artifacts || {};
      content = `${quarterActionCard(a)}
        <div class="card"><h2>当前资产配置</h2>${Object.keys(weights).length ? Object.entries(weights).map(([k,v]) => `<div class="money-row"><span>${esc(k)}</span><strong>${pct(v)}</strong></div>`).join('') : '<div class="empty">配置数据不足。</div>'}</div>
        ${rebalanceCard(a.rebalance)}
        ${quarterReviewCard(a)}
        <div class="card"><h2>持有期与去留结论</h2>${actionRows(b.attention_items.filter(x => x.action !== '再平衡'))}</div>
        <div class="card"><details><summary>其余 ${b.normal_items.length} 只：完成配置复核</summary>${actionRows(b.normal_items)}</details></div>`;
    } else {
      const a = b.artifacts || {};
      content = `<div class="card"><h2>本期定投结论</h2>${actionRows(b.items.filter(x => x.action !== '暂停' || !String(x.reason).includes('富国')))}</div>
        ${rebalanceCard(a.rebalance)}
        ${addOnCard(a.add_on_reviews, a.add_on_summary)}`;
    }
    page.querySelector('.band-content').innerHTML = content;
  });
  const test = D.bands.band_eval.run_mode === 'test';
  const btn = document.querySelector('[data-feedback="invest"]');
  btn.disabled = test;
  btn.textContent = test ? '测试预览无需回传' : '生成定投执行回传文案';
}

function rebalanceCard(r) {
  if (!r) return '';
  return `<div class="card accent"><h2>债基定投与渐进再平衡</h2><p class="lead">${esc(r.action)}</p>
    <div class="money-row"><span>当前债比 / ERP目标</span><strong>${pct(r.debt_weight)} / ${pct(r.debt_target)}</strong></div>
    <div class="money-row"><span>启动线 / 补债下沿</span><strong>${pct(r.start_line)} / ${pct(r.lower_line)}</strong></div>
    <p class="muted">${esc(r.actual_amount_note)}</p></div>`;
}
function flowCard(r) {
  if (!r || !r.flows) return '';
  return `<div class="card"><h2>${esc(r.erp_label)}态月度流量分配</h2>
    <div class="money-row"><span>权益层</span><strong>${money(r.flows.equity)}</strong></div>
    <div class="money-row"><span>债券层（受债比闸门约束）</span><strong>${money(r.flows.debt)}</strong></div>
    <div class="money-row"><span>现金层</span><strong>${money(r.flows.cash)}</strong></div>
    <p class="muted">三层合计 ${money(r.monthly_budget)}；存量再平衡不计入这份新增预算。</p></div>`;
}
function fundingReviewCard(rows) {
  if (!rows) return '';
  return `<div class="card"><h2>月度资金调度台账</h2>${rows.map(x => `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name)}</strong><strong>${esc(x.decision)}</strong></div><div class="fund-numbers">${esc(x.fund_code)} · ${esc(x.reason)}</div></div>`).join('')}</div>`;
}
function scanCard(scan) {
  if (!scan) return '';
  const comparisons = (scan.comparisons || []).map(x => `<div class="fund-row"><div class="fund-top"><strong>${esc(x.sector)} · ${esc(x.fund_name || x.fund_code || '待锁定基金')}</strong><strong>${pct(x.valuation)}</strong></div><div class="fund-numbers">${esc(x.fund_code || '未登记代码')} · ${esc(x.decision)}：${esc(x.reason)}</div></div>`).join('') || '<div class="empty">没有新基金通过低估初筛。</div>';
  const all = (scan.results || []).map(x => `<div class="scan-row"><span>${esc(x.sector)}${x.existing ? '（持仓）' : ''}</span><span>${x.valuation === null ? '缺数据' : pct(x.valuation)}</span><span>${esc(x.status)}</span></div>`).join('');
  return `<div class="card"><h2>全市场扫描与比较置换</h2><p class="lead">${esc(scan.summary)}</p>${comparisons}
    <details><summary>查看全部 ${(scan.results || []).length} 个扫描方向（缺数据 ${scan.missing_count || 0} 个）</summary>${all}</details></div>`;
}
function addOnCard(rows, summary) {
  if (!rows) return '';
  const valueText = (key, d) => {
    if (!d || d.value === null || d.value === undefined) return '未取到';
    const date = d.date ? ` · ${d.date}` : '';
    if (key === '趋势') return `${Number(d.value) === 1 ? '高于' : '低于'}20日均线${date}`;
    if (key === '资金') return `近5日 ${Number(d.value).toFixed(2)}亿元${date}`;
    if (key === '基本面') return `双季正增长占比 ${Number(d.value).toFixed(0)}%${date}`;
    if (key === '情绪') return `成交额分位 ${Number(d.value).toFixed(2)}%${date}`;
    return `${d.value}${date}`;
  };
  const dataKey = {'趋势':'trend','资金':'flows','基本面':'fundamentals','情绪':'sentiments'};
  return `<div class="card"><h2>低估加仓评分</h2><p class="lead">${esc(summary || '')}</p>${rows.map(x => `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name)}</strong><strong>${x.score} / ${x.threshold}分</strong></div>
    <div class="money-row"><span>估值 · 分位 ${pct(x.valuation)}</span><strong>${x.scores['估值']}分</strong></div>
    ${['趋势','资金','基本面','情绪'].map(k => `<div class="money-row"><span>${k} · ${esc(valueText(k, x.dimensions[dataKey[k]]))}</span><strong>${x.scores[k]}分</strong></div>`).join('')}
    <div class="fund-numbers">${esc(x.decision)}${x.missing.length ? ` · 缺：${esc(x.missing.join('、'))}` : ''}</div></div>`).join('')}</div>`;
}
function executionCard(r, unlocks) {
  if (!r) return '';
  const upcoming = (unlocks || []).filter(x => x.within_6m);
  return `<div class="card"><h2>月度执行复盘与数据完整性</h2>
    <div class="money-row"><span>本周期定投记录 / 实投合计</span><strong>${r.invest_count}笔 / ${money(r.invest_total)}</strong></div>
    <div class="money-row"><span>持仓快照日期</span><strong>${esc((r.snapshot_dates || []).join('、') || '未登记')}</strong></div>
    <p>${esc(r.completeness)}</p>
    <p class="muted">未来6个月解锁提醒：${upcoming.length ? upcoming.map(x => `${esc(x.fund_name)} ${esc(x.lock_end_date)}`).join('；') : '无已登记日期落在窗口内；未登记日期不作“无解锁”结论'}</p></div>`;
}
function quarterActionCard(a) {
  if (!a.action_checklist) return '';
  return `<div class="card accent"><h2>本季度要做什么</h2><ol class="action-list">${a.action_checklist.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
}
function quarterReviewCard(a) {
  const s = a.scale_review, bt = a.backtest;
  if (!s && !bt) return '';
  return `<div class="card"><h2>规模风险与季度回测</h2>
    ${s ? `<div class="money-row"><span>基金规模复核</span><strong>${esc(s.status)}</strong></div>` : ''}
    ${bt ? `<div class="money-row"><span>信号流水 / 有结果样本</span><strong>${bt.signal_count} / ${bt.outcome_count}</strong></div><p>${esc(bt.status)}</p>` : ''}</div>`;
}

function positionRows(items) {
  if (!items.length) return '<div class="empty">暂无持仓数据。</div>';
  return items.map(x => `<div class="fund-row"><div class="fund-top"><strong>${esc(x.fund_name)}</strong><strong>${money(x.params.market_value)}</strong></div>
    <div class="fund-numbers">${esc(x.fund_code)} · ${esc(x.reason)} · 收益率 ${pct(x.params.profit_rate)}</div></div>`).join('');
}

function renderRules(filter = '') {
  const chapters = D.rules.filter(x => x.title.includes(filter));
  $('rule-list').innerHTML = chapters.length ? chapters.map(x => `<button class="rule-item" data-rule="${D.rules.indexOf(x)}">${esc(x.title)}</button>`).join('') : '<div class="empty">没有匹配的章节。</div>';
  document.querySelectorAll('[data-rule]').forEach(b => b.onclick = () => showRule(D.rules[Number(b.dataset.rule)]));
  $('rule-search').oninput = e => renderRules(e.target.value.trim());
}

function showRule(rule) {
  const detail = $('rule-detail');
  detail.hidden = false;
  detail.innerHTML = `<button class="back-btn" id="rule-back">返回章节列表</button><h2>${esc(rule.title)}</h2>${rule.content.map(block => {
    if (block.type === 'heading') return `<h3>${esc(block.text)}</h3>`;
    if (block.type === 'list') return `<ul>${block.items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
    if (block.type === 'table') return `<table>${block.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    return `<p>${inline(block.text)}</p>`;
  }).join('')}`;
  $('rule-back').onclick = () => { detail.hidden = true; };
  detail.scrollIntoView({behavior: 'smooth'});
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(a => a.onclick = e => { e.preventDefault(); location.hash = a.getAttribute('href'); showPage(a.getAttribute('href').slice(1)); });
  $('open-rules').onclick = () => { location.hash = 'page-rules'; showPage('page-rules'); };
}

function showPage(id) {
  if (!$(id)) id = 'page-home';
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
  window.scrollTo(0, 0);
}

function bindFeedback() {
  document.querySelectorAll('[data-feedback]').forEach(btn => btn.onclick = () => {
    const type = btn.dataset.feedback;
    let message = '';
    if (type === 'invest') {
      const items = D.bands.band_eval.items.filter(x => x.action === '定投' && x.amount > 0);
      message = `【定投回传】实际执行情况：${items.map(x => `${x.fund_name}${x.amount}元`).join('、')}。结果：全部成功/有差异（请补充）。`;
    } else if (type === 'fund') {
      message = '【资金变动】类型：家庭支出/额外收入；金额：请填写；日期：请填写。';
    } else {
      message = '【持仓快照】请按理财通实际持有金额逐只填写后回传。';
    }
    copyText(message);
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('回传文案已复制，粘贴给小艺即可'); }
  catch (_) { window.prompt('请复制以下文案发给小艺', text); }
}
function toast(text) { $('toast').textContent = text; $('toast').style.display = 'block'; setTimeout(() => $('toast').style.display = 'none', 2200); }
init();
