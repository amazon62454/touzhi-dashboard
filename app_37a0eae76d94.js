// ============================================================
// V2 H5 纯模板渲染器
// 业务清单、分类、汇总、空态与节点可见性全部由 h5_export.display 下发。
// 这里只保留通用组件、纯格式化、页签/搜索/导航和自动刷新。
// ============================================================

let D = null;
let U = {};
const $ = id => document.getElementById(id);
const has = v => v !== null && v !== undefined && v !== '';

const STATUS_KEYS = { '🔴': 'ui_status_action', '⚠️': 'ui_status_watch', '🟢': 'ui_status_normal', '🟡': 'ui_status_hint', '💰': 'ui_status_cash' };
const statusText = v => String(v ?? '').replace(/🔴|⚠️|🟢|🟡|💰/g, c => U[STATUS_KEYS[c]] || c);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => !has(v) || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${U.ui_unit_yuan || ''}`;
const pct = v => !has(v) || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(2)}%`;
const dateText = v => has(v) ? String(v) : (U.ui_date_unrecorded || '');
const dateTimeText = v => has(v) ? String(v).replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}$/, '$1') : '';

// 显示值是引擎投影中的格式化指令，不含任何业务判定。
function formatCell(cell) {
  if (Array.isArray(cell)) return cell.map(formatCell).join('');
  if (!has(cell)) return '—';
  if (typeof cell !== 'object') return esc(cell);
  if (!Object.prototype.hasOwnProperty.call(cell, 'value')) return esc(cell);
  const value = cell.value;
  if (Array.isArray(value)) return value.map(formatCell).join('');
  // 引擎组合显示值可能嵌套一层格式化指令；纯递归展开，禁止把对象直接显示为[object Object]。
  if (value && typeof value === 'object') return formatCell(value);
  switch (cell.format) {
    case 'money': return money(value);
    case 'pct': return pct(value);
    case 'date': return esc(dateText(value));
    case 'datetime': return esc(dateTimeText(value));
    case 'period': {
      const period = value || {};
      return `${esc(dateTimeText(period.from))} ${esc(U.ui_range_sep || '')} ${esc(dateTimeText(period.to))}`;
    }
    default: return esc(value);
  }
}

function badge(spec) {
  return `<span class="badge ${esc(spec.kind || 'muted')}">${typeof spec.text === 'object' ? formatCell(spec.text) : esc(statusText(spec.text || '—'))}</span>`;
}

function renderChildren(children) {
  return (children || []).map(renderNode).join('');
}

function renderFundRows(rows) {
  return (rows || []).map(row => {
    const badges = (row.badges || []).map(badge).join(' ');
    const lines = (row.lines || []).map(line => `<div class="fund-numbers">${formatCell(line)}</div>`).join('');
    const detail = row.detail ? `<p class="${esc(row.detail_style || 'lead')}">${esc(row.detail)}</p>` : '';
    const amount = row.amount ? `<div class="action-amount">${formatCell(row.amount)}</div>` : '';
    return `<div class="fund-row"><div class="fund-top"><strong>${esc(row.name || '')}${row.code ? `<small> ${esc(row.code)}</small>` : ''}</strong><span>${badges}</span>${amount}</div>${lines}${detail}</div>`;
  }).join('');
}

function renderFundOperationsTable(node) {
  const headers = node.headers || [];
  const head = headers.map(label => `<th scope="col">${esc(label)}</th>`).join('');
  const actionCells = row => ['regular', 'addon', 'conversion'].map(key => {
    const cell = row[key] || {};
    return `<td class="action-cell">${esc(cell.compact_display || cell.display || '—')}</td>`;
  }).join('');
  const funds = (node.role_groups || []).map(group => {
    const heading = `<tr class="role-heading-row"><th scope="rowgroup">${esc(group.role_label)}${group.fund_count ? `（${esc(group.fund_count)}${esc(U.ui_fund_count_unit || '')}）` : ''}</th><td class="erp-cell">${esc(group.erp_amount)}</td><td class="role-heading-detail" colspan="4">${esc(group.detail)}</td></tr>`;
    const members = (group.rows || []).map(row =>
      `<tr class="fund-main"><th scope="row" colspan="2">${esc(row.fund_name)}</th>${actionCells(row)}<td class="fund-note-cell">${esc(row.detail)}</td></tr>`).join('');
    return heading + members;
  }).join('');
  const total = node.total_summary ? `<tr class="grand-total-row"><th scope="row">${esc(node.total_summary.label)}（${esc(node.total_summary.fund_count)}${esc(U.ui_fund_count_unit || '')}）</th><td class="erp-cell">${esc(node.total_summary.erp_amount)}</td>${actionCells(node.total_summary)}<td class="summary-detail">${esc(node.total_summary.detail)}</td></tr>` : '';
  return `<section class="operations-table-shell"><div class="operations-table-wrap"><table class="operations-table" aria-label="${esc(U.ui_aria_operations || '')}"><colgroup><col class="col-fund"><col class="col-erp"><col class="col-action"><col class="col-action"><col class="col-action"><col class="col-note"></colgroup><thead><tr>${head}</tr></thead><tbody>${funds}${total}</tbody></table></div></section>`;
}

function renderDailyFundOperationsTable(node) {
  const headers = node.headers || [];
  const head = headers.map(label => `<th scope="col">${esc(label)}</th>`).join('');
  const holdingCell = row => `<td class="erp-cell">${esc(row.holding_amount ?? row.erp_amount ?? '—')}</td>`;
  const reduceCell = row => `<td class="action-cell">${esc((row.reduce || {}).compact_display || (row.reduce || {}).display || '—')}</td>`;
  const funds = (node.role_groups || []).map(group => {
    const heading = `<tr class="role-heading-row"><th scope="rowgroup">${esc(group.role_label)}${group.fund_count ? `（${esc(group.fund_count)}${esc(U.ui_fund_count_unit || '')}）` : ''}</th>${holdingCell(group)}<td class="role-heading-detail" colspan="2">${esc(group.detail)}</td></tr>`;
    const members = (group.rows || []).map(row =>
      `<tr class="fund-main"><th scope="row">${esc(row.fund_name)}</th>${holdingCell(row)}${reduceCell(row)}<td class="fund-note-cell">${esc(row.detail)}</td></tr>`).join('');
    return heading + members;
  }).join('');
  const total = node.total_summary ? `<tr class="grand-total-row"><th scope="row">${esc(node.total_summary.label)}（${esc(node.total_summary.fund_count)}${esc(U.ui_fund_count_unit || '')}）</th>${holdingCell(node.total_summary)}${reduceCell(node.total_summary)}<td class="summary-detail">${esc(node.total_summary.detail)}</td></tr>` : '';
  return `<section class="operations-table-shell"><div class="operations-table-wrap"><table class="operations-table daily-operations-table" aria-label="${esc(U.ui_aria_daily || '')}"><colgroup><col class="daily-col-fund"><col class="daily-col-erp"><col class="daily-col-action"><col class="daily-col-note"></colgroup><thead><tr>${head}</tr></thead><tbody>${funds}${total}</tbody></table></div></section>`;
}

function renderChecks(items) {
  return (items || []).map(item => {
    const metrics = (item.metrics || []).map(metric => `<span class="check-metric"><span>${esc(metric.label || '')}</span><strong class="num ${esc(metric.tone || 'info')}">${formatCell(metric.value)}</strong></span>`).join('');
    return `<div class="check-item"><div class="money-row"><span>${esc(item.name || '')}</span>${badge({ text: item.status, kind: item.status_kind })}</div><p class="lead">${esc(item.detail || '')}</p>${metrics ? `<div class="check-metrics">${metrics}</div>` : ''}</div>`;
  }).join('');
}

function renderWorkflow(node) {
  const flows = node.flows || [];
  window.__bandActiveFlow = window.__bandActiveFlow || {};
  const selectedId = window.__bandActiveFlow[node.band];
  const flow = flows.find(item => item.id === selectedId) || flows[0];
  if (!flow) return '';
  const tabs = node.compact_heading ? `<div class="band-flow-tabs">${flows.map(item => `<button type="button" class="${item.id === flow.id ? 'active' : ''}" data-band-flow="${esc(item.id)}" data-band="${esc(node.band)}"><strong>${esc(item.title)}</strong><span>${esc(item.tab_state)}</span></button>`).join('')}</div>` : '';
  const heading = node.compact_heading
    ? `<div class="flow-progress-line">${esc(flow.progress)}</div>`
    : `<div class="band-flow-head"><div><strong>${esc(flow.title)}</strong><span>${esc(flow.progress)}</span></div>${badge({ text: flow.state_label, kind: flow.tone })}</div>`;
  const steps = (flow.steps || []).map((step, index) => `<div class="compact-step ${esc(step.status)}"><span class="workflow-index">${index + 1}</span><div><strong>${esc(step.name)}</strong><em>${esc(step.status_label || step.status)}</em></div></div>`).join('');
  const current = flow.current_detail ? `<div class="flow-current-detail ${esc(flow.current_detail.kind)}"><strong>${esc(flow.current_detail.label)}</strong><p>${esc(flow.current_detail.text)}</p></div>` : '';
  const times = (flow.time_rows || []).map(row => `<div class="flow-next-review"><span>${esc(row.label)}</span><strong>${formatCell(row.value)}</strong></div>`).join('');
  return `${tabs}${heading}<div class="compact-steps">${steps}</div>${current}${times}`;
}

function renderMonthlyFundOperationsTable(node) {
  const head = (node.headers || []).map(label => `<th scope="col">${esc(label)}</th>`).join('');
  const groups = (node.role_groups || []).map(group => {
    const heading = `<tr class="role-heading-row"><th scope="row">${esc(group.role_label || group.label || '')}（${group.fund_count || 0}${esc(U.ui_fund_count_unit || '')}）</th><td class="erp-cell">${esc(group.erp_amount ?? '—')}</td><td colspan="3" class="role-allocation-note">${esc(group.detail || '')}</td></tr>`;
    const funds = (group.rows || []).map(row => `<tr class="fund-row fund-main"><th colspan="2" scope="row">${esc(row.fund_name || '')}</th><td class="action-cell">${esc((row.month_end || {}).compact_display || '—')}</td><td class="action-cell">${esc((row.cash_inflow || {}).compact_display || '—')}</td><td class="fund-note-cell">${esc(row.detail || '—')}</td></tr>`).join('');
    return heading + funds;
  }).join('');
  const total = node.total_summary || {};
  const footer = `<tr class="fund-row grand-total-row"><th scope="row">${esc(total.label || '')}（${total.fund_count || 0}${esc(U.ui_fund_count_unit || '')}）</th><td class="erp-cell">${esc(total.erp_amount ?? '—')}</td><td class="action-cell">${esc((total.month_end || {}).compact_display || '—')}</td><td class="action-cell">${esc((total.cash_inflow || {}).compact_display || '—')}</td><td class="fund-note-cell">${esc(total.detail || '')}</td></tr>`;
  return `<div class="operations-table-shell"><div class="operations-table-wrap"><table class="operations-table monthly-operations-table"><colgroup><col class="monthly-col-fund"><col class="monthly-col-erp"><col class="monthly-col-close"><col class="monthly-col-inflow"><col class="monthly-col-note"></colgroup><thead><tr>${head}</tr></thead><tbody>${groups}${footer}</tbody></table></div><p class="table-caption">${esc(node.amount_rule || '')}</p></div>`;
}

function renderQuarterFundOperationsTable(node) {
  const headers = (node.headers || []).map(label => `<th scope="col">${esc(label)}</th>`).join('');
  const rows = node.rows || [];
  const groups = (node.role_groups || node.status_groups || []).map(group => {
    const members = group.fund_codes || [];
    const heading = `<tr class="role-heading-row"><th colspan="5" scope="rowgroup">${esc(group.status)}（${esc(group.fund_count)}${esc(U.ui_fund_count_unit || '')}）<span class="role-heading-detail">${esc(group.detail || '')}</span></th></tr>`;
    const body = members.map(code => {
      const row = rows.find(item => item.fund_code === code) || {};
      const detail = (row.detail_lines || []).filter(Boolean).map(esc).join('<br>');
      return `<tr class="fund-main"><th scope="row">${esc(row.display_name || row.fund_name || code)}</th><td>${esc(row.role_label || '—')}</td><td>${esc(row.status_display || row.status || '—')}</td><td>${esc(row.score_display || '—')}</td><td class="fund-note-cell">${detail}</td></tr>`;
    }).join('');
    return heading + body;
  }).join('');
  const total = node.total_summary || {};
  const footer = `<tr class="fund-row grand-total-row"><th scope="row">${esc(total.label || U.ui_total || '')}</th><td colspan="4" class="summary-detail">${esc(total.detail || '')}</td></tr>`;
  return `<div class="operations-table-shell"><div class="operations-table-wrap"><table class="operations-table quarter-operations-table"><colgroup><col class="quarter-col-fund"><col class="quarter-col-role"><col class="quarter-col-status"><col class="quarter-col-score"><col class="quarter-col-note"></colgroup><thead><tr>${headers}</tr></thead><tbody>${groups}${footer}</tbody></table></div></div>`;
}

function renderQuarterCandidateTable(node) {
  const meta = (label, value) => `<div class="candidate-meta-item"><em>${esc(label)}</em><span>${esc(value || '—')}</span></div>`;
  const cards = (node.rows || []).map(row => {
    const statusKind = row.status_tone || 'warn';
    const filterStatus = statusKind === 'ok' ? 'pass' : 'fail';
    return `<article class="candidate-card" data-candidate-status="${filterStatus}">
      <div class="candidate-head">
        <div class="candidate-name">${esc(row.fund_name || '—')}</div>
        <div class="candidate-valuation">${esc(row.valuation || '—')}</div>
      </div>
      <div class="candidate-meta">
        ${meta(U.ui_candidate_scale, row.scale)}
        ${meta(U.ui_candidate_fee, row.fee)}
        ${meta(U.ui_candidate_next, row.next_review)}
      </div>
      <div class="candidate-status">${badge({ text: row.status || '—', kind: statusKind })}</div>
      <p class="candidate-reason">${esc(row.pending || '—')}</p>
    </article>`;
  }).join('');
  const filter = `<div class="candidate-filter" role="group" aria-label="${esc(U.ui_candidate_filter || '')}">
    <button type="button" class="active" data-candidate-filter="all">${esc(U.ui_candidate_filter_all || '')}</button>
    <button type="button" data-candidate-filter="pass">${esc(U.ui_candidate_filter_pass || '')}</button>
    <button type="button" data-candidate-filter="fail">${esc(U.ui_candidate_filter_fail || '')}</button>
  </div>`;
  return `<div class="candidate-section">${filter}<div class="candidate-list">${cards}</div></div>`;
}

function renderNode(node) {
  if (!node) return '';
  switch (node.type) {
    case 'card':
      return `<div class="card ${esc(node.kind || '')}">${node.title ? `<h2>${esc(node.title)}</h2>` : ''}${renderChildren(node.children)}</div>`;
    case 'details':
      return `<details><summary>${esc(node.summary)}</summary>${renderChildren(node.children)}</details>`;
    case 'empty':
      return `<div class="empty">${node.title ? `<div class="empty-title">${esc(node.title)}</div>` : ''}${esc(node.note || '')}</div>`;
    case 'text':
      return `<p class="${esc(node.style || 'muted')}">${esc(node.text || '')}</p>`;
    case 'kv':
      return `<div class="money-row"><span>${esc(node.label)}${node.note ? `<small> ${esc(node.note)}</small>` : ''}</span><strong class="num ${esc(node.tone || '')}">${formatCell(node.value)}</strong></div>`;
    case 'metrics':
      return `<div class="metric-grid">${(node.items || []).map(item => `<div class="metric ${esc(item.tone || '')}"><div class="metric-label">${esc(item.label)}</div><div class="metric-value ${esc(item.tone || '')}">${formatCell(item.value)}</div></div>`).join('')}</div>`;
    case 'table': {
      const aligns = node.aligns || [];
      const head = (node.headers || []).map((label, index) => `<th${aligns[index] ? ` style="text-align:${esc(aligns[index])}"` : ''}>${esc(label)}</th>`).join('');
      const rows = (node.rows || []).map(row => `<tr>${row.map((cell, index) => `<td${aligns[index] ? ` style="text-align:${esc(aligns[index])}"` : ''}>${formatCell(cell)}</td>`).join('')}</tr>`).join('');
      return `<div class="table-scroll ${esc(node.class_name || '')}" tabindex="0" role="region" aria-label="${esc(U.ui_aria_table || '')}"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'fund_rows':
      return renderFundRows(node.rows);
    case 'fund_operations_table':
      return renderFundOperationsTable(node);
    case 'daily_fund_operations_table':
      return renderDailyFundOperationsTable(node);
    case 'monthly_fund_operations_table':
      return renderMonthlyFundOperationsTable(node);
    case 'quarter_fund_operations_table':
      return renderQuarterFundOperationsTable(node);
    case 'quarter_candidate_table':
      return renderQuarterCandidateTable(node);
    case 'pending':
      return `<div class="decision-blockers"><strong>${esc(node.title)}</strong><ul>${(node.items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
    case 'check_groups': {
      const normal = (node.normal || []).length ? `<details class="check-normal-rest"><summary>${esc(node.normal_title)}</summary>${renderChecks(node.normal)}</details>` : '';
      return renderChecks(node.attention) + normal;
    }
    case 'workflow':
      return renderWorkflow(node);
    case 'parameter_node':
      return `<details class="parameter-node"><summary><strong>${esc(node.title)}</strong><em>${esc(node.state_label)}</em></summary>${renderChildren(node.children)}</details>`;
    default:
      return `<div class="empty">${esc(U.ui_action_contract_missing || '')}</div>`;
  }
}

function renderBandHeader(header) {
  const times = renderChildren(header.time_rows);
  return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(header.title || '')}</h1><div class="muted">${badge({ text: header.state_label, kind: header.state_kind })} ${esc(U.ui_base || '')} ${esc(dateText(header.base_date))}</div>${header.run_notice ? `<p class="status-banner live">${esc(header.run_notice)}</p>` : ''}${times ? `<div class="muted">${times}</div>` : ''}${header.legend ? `<p class="muted" style="font-size:var(--fs-xs);margin:4px 0 0">${esc(header.legend)}</p>` : ''}</div>`;
}

function renderRetirement(display) {
  if (!display) return `<div class="empty">${esc(U.ui_action_contract_missing || '')}</div>`;
  const header = display.header || {};
  return `<div class="card accent"><h1 style="font-size:var(--fs-lg)">${esc(header.title || '')}</h1><div class="muted">${esc(header.base_label || dateText(header.base_date))}</div></div>${renderChildren(display.children)}`;
}

function renderAppHeader(header) {
  return `<div class="app-page-heading"><div><h1>${esc(header.title || '')}</h1>${header.subtitle ? `<p>${esc(header.subtitle)}</p>` : ''}</div><span>${esc(header.base_label || dateText(header.base_date))}</span></div>`;
}

function renderAppMeta(items) {
  const rows = (items || []).filter(Boolean).map(item => `<div class="app-meta-item"><span>${esc(item.label || '')}</span><strong class="${esc(item.tone || '')}">${formatCell(item.value)}</strong></div>`).join('');
  return rows ? `<div class="app-meta-grid">${rows}</div>` : '';
}

function appCardInner(card) {
  const status = card.status && card.status.text ? badge({ text: card.status.text, kind: card.status.kind }) : '';
  const amount = card.amount ? `<div class="app-card-amount ${esc((card.amount.tone || card.tone) || '')}">${formatCell(card.amount)}</div>${card.amount_label ? `<div class="app-card-amount-label">${esc(card.amount_label)}</div>` : ''}` : '';
  return `<div class="app-card-title-row"><div class="app-card-name"><strong>${esc(card.title || '')}</strong>${card.subtitle ? `<span>${esc(card.subtitle)}</span>` : ''}</div>${status}</div><div class="app-card-value-row">${amount}</div>`;
}

function renderAppCard(card) {
  const body = `${card.detail ? `<p class="app-card-detail">${esc(card.detail)}</p>` : ''}${renderAppMeta(card.meta)}`;
  if (!card.collapsible) {
    return `<article class="app-card ${esc(card.tone || 'info')}" id="${esc(card.id || '')}">${appCardInner(card)}${body}</article>`;
  }
  const reasons = (card.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join('');
  return `<details class="app-card app-action-card ${esc(card.tone || 'info')}" id="${esc(card.id || '')}"><summary>${appCardInner(card)}<span class="app-card-chevron" aria-hidden="true">⌄</span></summary><div class="app-card-reasons"><h2>${esc(U.ui_action_reason_title || '')}</h2><ol>${reasons}</ol>${body}</div></details>`;
}

function renderActionPage(display) {
  if (!display) return `<div class="empty">${esc(U.ui_action_contract_missing || '')}</div>`;
  const hero = display.hero || {};
  const primary = hero.primary ? `<div class="app-summary-primary"><span>${esc(hero.primary.label || '')}</span><strong class="${esc(hero.primary.tone || '')}">${formatCell(hero.primary.value)}</strong></div>` : '';
  const summary = `<section class="card app-summary ${esc(hero.tone || '')}"><div class="app-summary-headline">${esc(hero.headline || '')}</div>${hero.note ? `<p>${esc(hero.note)}</p>` : ''}${primary}${renderAppMeta(hero.meta)}</section>`;
  const groups = (display.groups || []).map(group => `<section class="app-action-group"><h2>${esc(group.title || '')}</h2><div class="app-card-list">${(group.cards || []).map(renderAppCard).join('')}</div></section>`).join('');
  return renderAppHeader(display.header || {}) + summary + groups + renderNode(display.empty);
}

function renderAppSimplePage(display) {
  if (!display) return `<div class="empty">${esc(U.ui_action_contract_missing || '')}</div>`;
  return renderAppHeader(display.header || {}) + `<div class="card">${renderChildren(display.children)}</div>` + `<div class="app-card-list">${(display.cards || []).map(renderAppCard).join('')}</div>` + renderNode(display.empty);
}

function ruleCards(chapters) {
  return chapters.map(chapter => `<div class="card" data-rule="${esc(chapter.title)}"><div class="fund-top"><strong>${esc(chapter.title)}</strong></div></div>`).join('') || `<div class="empty">${esc(U.ui_rule_no_match || '')}</div>`;
}

function renderRules() {
  const q = ($('rule-search') && $('rule-search').value || '').trim();
  const chapters = (D.rules || []).filter(chapter => !q || String(chapter.title || '').includes(q));
  return `<div class="search-wrap"><input id="rule-search" class="search" type="search" placeholder="${esc(U.ui_rule_search_placeholder || '')}" value="${esc(q)}"></div><div class="rule-results">${ruleCards(chapters)}</div><div class="rule-detail-host"></div>`;
}

function renderRuleDetail(chapter) {
  const blocks = (chapter.content || []).map(block => {
    if (block.type === 'table') return renderNode({ type: 'table', headers: (block.rows || [])[0] || [], rows: (block.rows || []).slice(1) });
    if (block.type === 'list') return `<ul>${(block.items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
    return `<p class="lead">${esc(block.text || '')}</p>`;
  }).join('');
  return `<div class="card rule-detail"><h2>${esc(chapter.title)}</h2>${blocks}</div>`;
}

function renderPage(pageId) {
  const el = $(pageId);
  if (!el) return;
  try {
    if (pageId === 'page-rules') {
      el.innerHTML = renderRules();
      bindRuleSearch();
      return;
    }
    if (pageId === 'page-action') {
      el.innerHTML = renderActionPage(D.action_display);
      return;
    }
    if (pageId === 'page-funds') {
      el.innerHTML = renderAppSimplePage(D.fund_display);
      return;
    }
    if (pageId === 'page-assets') {
      el.innerHTML = renderAppSimplePage(D.asset_display);
      return;
    }
    if (pageId === 'page-retirement') {
      el.innerHTML = renderAppSimplePage(D.pension_display);
      return;
    }
    const band = pageId.replace(/^page-/, '');
    const view = (D.bands || {})[band] || {};
    const display = view.display;
    el.innerHTML = display
      ? renderBandHeader(display.header || {}) + renderChildren(display.sections) + renderNode(display.empty)
      : `<div class="empty">${esc(U.ui_action_contract_missing || '')}</div>`;
  } catch (error) {
    el.innerHTML = `<div class="card"><div class="empty"><div class="empty-title">${esc(U.ui_render_error || '')}</div>${esc(error.message)}</div></div>`;
  }
}

const NAV = [
  { id: 'page-action', label: 'ui_nav_action' },
  { id: 'page-funds', label: 'ui_nav_funds' },
  { id: 'page-assets', label: 'ui_nav_assets' },
  { id: 'page-retirement', label: 'ui_nav_retirement' },
];

function renderNav() {
  $('nav').innerHTML = NAV.map(item => `<a href="#${item.id}" data-page="${item.id}">${esc(U[item.label] || '')}</a>`).join('');
}

function showPage(pageId) {
  const valid = NAV.some(item => item.id === pageId) || pageId === 'page-rules';
  const target = valid ? pageId : 'page-action';
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === target));
  document.querySelectorAll('#nav a').forEach(link => link.classList.toggle('active', link.dataset.page === target));
  syncGlobalStatus(target);
  if (!$(target).dataset.rendered) {
    renderPage(target);
    $(target).dataset.rendered = '1';
  }
  window.scrollTo({ top: 0 });
}

function bindRuleSearch() {
  const input = $('rule-search');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const chapters = (D.rules || []).filter(chapter => !q || String(chapter.title || '').includes(q));
    const results = document.querySelector('.rule-results');
    if (results) results.innerHTML = ruleCards(chapters);
  });
}

document.addEventListener('click', event => {
  const candidateFilter = event.target.closest('[data-candidate-filter]');
  if (candidateFilter) {
    const section = candidateFilter.closest('.candidate-section');
    if (!section) return;
    const value = candidateFilter.dataset.candidateFilter || 'all';
    section.querySelectorAll('[data-candidate-filter]').forEach(button => {
      button.classList.toggle('active', button === candidateFilter);
    });
    section.querySelectorAll('.candidate-card').forEach(card => {
      card.hidden = value !== 'all' && card.dataset.candidateStatus !== value;
    });
    return;
  }
  const flowButton = event.target.closest('[data-band-flow]');
  if (flowButton) {
    window.__bandActiveFlow = window.__bandActiveFlow || {};
    window.__bandActiveFlow[flowButton.dataset.band] = flowButton.dataset.bandFlow;
    const page = $('page-' + flowButton.dataset.band);
    if (page) renderPage(page.id);
    return;
  }
  const rule = event.target.closest('[data-rule]');
  if (rule) {
    const chapter = (D.rules || []).find(item => item.title === rule.dataset.rule);
    const host = document.querySelector('.rule-detail-host');
    if (chapter && host) host.innerHTML = renderRuleDetail(chapter);
  }
});

const AUTO_REFRESH_MS = 15000;
let lastGeneratedAt = null;

function h5DataFile() {
  const meta = document.querySelector('meta[name="h5-data-version"]');
  const version = (meta && meta.content ? meta.content : '').trim();
  return version ? `h5_data_${version}.json` : 'h5_data.json';
}

async function pollForUpdates() {
  if (document.visibilityState !== 'visible' || !lastGeneratedAt) return;
  if (document.activeElement && document.activeElement.id === 'rule-search') return;
  try {
    const response = await fetch(`${h5DataFile()}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const next = await response.json();
    if (!next.generated_at || next.generated_at === lastGeneratedAt) return;
    const activePage = document.querySelector('.page.active');
    const scrollY = window.scrollY;
    D = next;
    U = D.ui_labels || {};
    lastGeneratedAt = D.generated_at;
    renderShell();
    document.querySelectorAll('.page').forEach(page => { delete page.dataset.rendered; });
    if (activePage) {
      renderPage(activePage.id);
      activePage.dataset.rendered = '1';
    }
    window.scrollTo({ top: scrollY });
  } catch (error) {
    console.warn(U.ui_auto_refresh_warn || '', error);
  }
}

function startAutoRefresh() {
  lastGeneratedAt = D.generated_at || null;
  window.setInterval(pollForUpdates, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', pollForUpdates);
}

function syncGlobalStatus(pageId) {
  const status = D.status || {};
  $('global-status').hidden = pageId !== status.display_page || !status.label;
}

function renderShell() {
  $('header-date').textContent = `${U.ui_base || ''} ${dateText(D.base_date)} · ${U.ui_page_generated || ''} ${dateTimeText(D.generated_at)}`;
  const status = D.status || {};
  const banner = $('global-status');
  banner.className = 'status-banner live';
  banner.textContent = status.label ? `${status.label}${status.description ? ' · ' + status.description : ''}` : '';
  syncGlobalStatus(document.querySelector('.page.active')?.id || 'page-action');
}

async function init() {
  try {
    const response = await fetch(`${h5DataFile()}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    D = await response.json();
    U = D.ui_labels || {};
    renderShell();
    renderNav();
    $('boot-skeleton').remove();
    showPage(location.hash.slice(1) || 'page-action');
    startAutoRefresh();
    window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'page-action'));
  } catch (error) {
    $('boot-skeleton').remove();
    $('main').innerHTML = `<div class="error-state"><div>${esc(U.ui_data_read_error || '')}：${esc(error.message)}</div><button onclick="location.reload()">${esc(U.ui_retry || '')}</button></div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
