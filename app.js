// V2 H5：只展示由Python从SOP.md、台账和判决JSON导出的内容。
// 本文件不实现投资规则，不写死规则数值。
let h5Data = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline = value => esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const text = value => inline(value).replace(/\n/g, '<br>');

async function init() {
  try {
    const response = await fetch(`h5_data.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    h5Data = await response.json();
    renderHome();
    renderRulesCatalog();
    renderData();
    renderJudgment();
    renderReportList();
    setupNavigation();
    showPage(location.hash.slice(1) || 'page-home');
  } catch (error) {
    $('app').innerHTML = `<div class="error">加载 h5_data.json 失败：${esc(error.message)}。请先运行 h5_export.py 生成数据。</div>`;
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', event => {
      event.preventDefault();
      const pageId = item.getAttribute('href').slice(1);
      history.replaceState(null, '', `#${pageId}`);
      showPage(pageId);
    });
  });
}

function showPage(pageId) {
  if (!$(pageId)) pageId = 'page-home';
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.getAttribute('href') === `#${pageId}`));
  window.scrollTo(0, 0);
}

function rows(entries) {
  if (!entries.length) return '<div class="empty">暂无数据</div>';
  return entries.map(([k, v]) => `<div class="data-row"><span class="data-label">${esc(k)}</span><span class="data-value">${text(v)}</span></div>`).join('');
}

function table(headers, bodyRows) {
  if (!bodyRows.length) return '<div class="empty">暂无数据</div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${text(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderHome() {
  const schedule = h5Data.schedule || {};
  $('schedule-overview').innerHTML = `
    <div class="meta">数据基准：${esc(h5Data.base_date || '-')}　生成时间：${esc(h5Data.generated_at || '-')}</div>
    ${rows(Object.entries(schedule.overview || {}))}
    ${(schedule.bands || []).map(b => `<h3>${esc(b.name)}</h3><div class="sop-content">${renderBlocks(b.content || [])}</div>`).join('')}`;
  const matrix = schedule.action_matrix || [];
  $('action-matrix').innerHTML = matrix.length
    ? table(matrix[0], matrix.slice(1))
    : '<div class="empty">SOP中未解析到时间×动作矩阵</div>';
}

function renderRulesCatalog() {
  const chapters = h5Data.sop_chapters || [];
  $('rules-catalog').innerHTML = chapters.length ? `<div class="list">${chapters.map((c, i) => `
    <button class="list-item" data-chapter="${i}">${esc(c.title)}<span class="list-subtitle">${esc(c.clause_range || '')}</span></button>`).join('')}</div>`
    : '<div class="empty">未从SOP.md解析到章节目录</div>';
  document.querySelectorAll('[data-chapter]').forEach(btn => btn.addEventListener('click', () => showRule(Number(btn.dataset.chapter))));
}

function showRule(index) {
  const chapter = (h5Data.sop_chapters || [])[index];
  if (!chapter) return;
  $('rule-detail-title').textContent = chapter.title;
  $('rule-detail-content').innerHTML = `<button class="back-btn" id="rule-back">← 返回目录</button><div class="sop-content">${renderBlocks(chapter.content || [])}</div>`;
  $('rule-detail-card').style.display = 'block';
  $('rule-back').onclick = () => { $('rule-detail-card').style.display = 'none'; window.scrollTo(0, 0); };
  $('rule-detail-card').scrollIntoView({behavior: 'smooth'});
}

function renderData() {
  const ledger = h5Data.ledger || {};
  const fundRows = (ledger.funds || []).map(f => [f.fund_code, f.fund_name, f.fund_type, f.status, f.current_amount, f.market_value, f.profit_rate]);
  $('fund-config').innerHTML = table(['代码', '名称', '类型', '状态', '当前定投额', '市值', '收益率'], fundRows);
  $('budget-params').innerHTML = rows((ledger.budget_params || []).map(p => [p.param_name, p.param_value]));
  $('rule-params').innerHTML = rows((ledger.rule_params || []).map(p => [p.param_id ? `${p.param_id} ${p.param_name}` : p.param_name, p.param_value]));
}

function renderJudgment() {
  const judgment = h5Data.judgment || {};
  const judgments = judgment.judgments || [];
  $('judgment-result').innerHTML = `
    <div class="meta"><span class="badge ${judgment.run_mode === 'test' ? 'test' : 'live'}">${esc(judgment.run_mode || '无判决')}</span> ${esc(judgment.base_date || '')} ${esc(judgment.band || '')}</div>
    ${table(['代码', '动作', '金额', '理由'], judgments.map(j => [j.fund_code, j.action, j.amount, j.reason]))}`;
  const quality = judgment.quality || {};
  $('data-quality').innerHTML = rows(Object.entries(quality).map(([fc, q]) => [fc, q]));
}

function renderReportList() {
  const reports = h5Data.reports || [];
  $('report-list').innerHTML = reports.length ? `<div class="list">${reports.map((r, i) => `
    <button class="list-item" data-report="${i}">${esc(r.title)}<span class="list-subtitle">${esc(r.band)}　${esc(r.base_date)}　${esc(r.run_mode)}</span></button>`).join('')}</div>`
    : '<div class="empty">暂无报告。运行引擎后会在此显示。</div>';
  document.querySelectorAll('[data-report]').forEach(btn => btn.addEventListener('click', () => showReport(Number(btn.dataset.report))));
}

function showReport(index) {
  const report = (h5Data.reports || [])[index];
  if (!report) return;
  $('report-detail-title').textContent = report.title;
  $('report-detail-content').innerHTML = `<button class="back-btn" id="report-back">← 返回列表</button><div class="sop-content">${renderBlocks(report.content || [])}</div>`;
  $('report-detail-card').style.display = 'block';
  $('report-back').onclick = () => { $('report-detail-card').style.display = 'none'; };
  $('report-detail-card').scrollIntoView({behavior: 'smooth'});
}

// 将导出层的Markdown块安全地渲染为HTML；规则正文由SOP.md提供。
function renderBlocks(blocks) {
  return blocks.map(block => {
    if (block.type === 'heading') return `<h3>${esc(block.text)}</h3>`;
    if (block.type === 'table') return table(block.rows[0] || [], (block.rows || []).slice(1));
    if (block.type === 'list') return `<ul>${block.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (block.type === 'code') return `<pre>${esc(block.text)}</pre>`;
    return `<p>${text(block.text)}</p>`;
  }).join('');
}

init();
