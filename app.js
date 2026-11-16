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
  if (!items || !items.length) return '<div class="empty">本期没有需要执行的资金动作。</div>';
  return `<div class="action-list">${items.map(x => `
    <div class="action-row">
      <div><div class="action-name">${esc(x.fund_name)}<span class="action-code">${esc(x.fund_code)}</span></div>
      <div class="action-reason">${esc(x.action)} · ${esc(shortReason(x.reason))}</div></div>
      <div class="action-amount">${showZero ? money(x.amount) : ''}</div>
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
  $('changelog').innerHTML = `<div class="change-date">${esc(h.changelog.date || '未记录日期')}</div><div>${esc(h.changelog.summary)}</div>`;
  $('health').innerHTML = h.health.length ? h.health.map(x => `<div class="health-row"><span>${esc(x.name)} · ${esc(x.detail)}</span><strong>${esc(x.status)}</strong></div>`).join('') : '<div class="empty">本次没有数据质量明细。</div>';
}

function renderRetirement() {
  const r = D.retirement;
  const metrics = [
    ['当前持有市值', money(r.total_market_value), ''],
    ['累计投入', money(r.total_cost), ''],
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
    const b = D.bands[page.dataset.band];
    page.querySelector('.band-header').innerHTML = `<div class="page-heading"><div class="eyebrow">${esc(b.title)}</div><h1>${esc(b.summary)}</h1></div>
      <div class="band-meta"><span class="badge ${b.run_mode === 'test' ? 'test' : ''}">${b.run_mode === 'test' ? '测试·非正式' : '正式'}</span> 基准 ${esc(dateText(b.base_date))}${b.generated_at ? ` · 生成 ${esc(b.generated_at)}` : ''}</div>`;
    page.querySelector('.band-content').innerHTML = `<div class="card"><h2>本期结论</h2>${actionRows(b.items)}</div>`;
  });
  const test = D.bands.band_eval.run_mode === 'test';
  const btn = document.querySelector('[data-feedback="invest"]');
  btn.disabled = test;
  btn.textContent = test ? '测试预览无需回传' : '生成定投执行回传文案';
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
