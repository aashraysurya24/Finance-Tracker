// app.js

// ===== Globals =====
let categoryChart = null;
let trendsChart = null;

// ===== Utilities =====
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return [...document.querySelectorAll(sel)]; }

function showLoading(show) {
  const el = $("#loadingOverlay");
  if (el) el.style.display = show ? "flex" : "none";
}

function notify(message, type = "success") {
  const n = $("#notification");
  const m = $("#notification-message");
  if (!n || !m) return;
  m.textContent = message;
  n.className = "notification" + (type !== "success" ? " " + type : "");
  n.style.display = "flex";
  setTimeout(() => n.style.display = "none", 3500);
}
function closeNotification() {
  const n = $("#notification");
  if (n) n.style.display = "none";
}
window.closeNotification = closeNotification;

// ===== Tabs =====
function switchTab(tabId) {
  $all(".tab-pane").forEach(p => p.classList.remove("active"));
  $all(".nav-tab").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add("active");

  if (tabId === "dashboard") {
    loadDashboard();
  } else if (tabId === "transactions") {
    loadTransactionsTab();
  } else if (tabId === "budgets") {
    loadBudgetsTab();
  } else if (tabId === "insights") {
    loadInsightsTab();
  }
}
window.switchTab = switchTab;

// ===== Modal (Quick Add) =====
function openQuickAdd() { $("#quickAddModal").style.display = "block"; }
function closeQuickAdd() { $("#quickAddModal").style.display = "none"; }
window.openQuickAdd = openQuickAdd;
window.closeQuickAdd = closeQuickAdd;

// ===== API Helpers =====
async function apiGet(url) {
  showLoading(true);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    notify(e.message, "error");
    return null;
  } finally {
    showLoading(false);
  }
}
async function apiPost(url, data) {
  showLoading(true);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    notify(e.message, "error");
    return null;
  } finally {
    showLoading(false);
  }
}
async function apiDelete(url) {
  showLoading(true);
  try {
    const r = await fetch(url, { method: "DELETE" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    notify(e.message, "error");
    return null;
  } finally {
    showLoading(false);
  }
}

// ===== Category Population =====
async function updateCategoryOptions(selectId, type) {
  const categories = await apiGet(`/api/categories?type=${type}`);
  const select = document.getElementById(selectId);
  if (!categories || !select) return;
  select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join("");
}

async function populateCategories() {
  const allCats = await apiGet("/api/categories?type=all");
  const expCats = await apiGet("/api/categories?type=expense");
  if (!allCats || !expCats) return;

  // Filter dropdown: all categories
  const filterCat = $("#filter-category");
  filterCat.innerHTML = `<option value="">All Categories</option>` +
    allCats.map(c => `<option value="${c}">${c}</option>`).join("");

  // Budget form: expense categories only
  const budgetCat = $("#budget-category");
  budgetCat.innerHTML = expCats.map(c => `<option value="${c}">${c}</option>`).join("");
}

// Hook transaction type selector → category list
document.getElementById("transaction-type").addEventListener("change", (e) => {
  updateCategoryOptions("transaction-category", e.target.value);
});
document.getElementById("quick-type").addEventListener("change", (e) => {
  updateCategoryOptions("quick-category", e.target.value);
});

// ===== Dashboard =====
async function loadDashboard() {
  const summary = await apiGet("/api/summary");
  if (!summary) return;
  $("#total-income").textContent = `$${summary.total_income.toFixed(2)}`;
  $("#total-expenses").textContent = `$${summary.total_expenses.toFixed(2)}`;
  $("#net-income").textContent = `$${summary.net_income.toFixed(2)}`;

  renderCategoryChart(summary.expense_by_category);
  await loadTrendsChart();
  await loadRecentTransactions();
}

async function loadRecentTransactions() {
  const txs = await apiGet("/api/transactions?limit=5");
  const container = $("#recent-transactions");
  container.innerHTML = "";
  if (!txs || txs.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No recent transactions</h3><p>Add one using the + button.</p></div>`;
    return;
  }
  txs.forEach(t => {
    const el = document.createElement("div");
    el.className = "transaction-item";
    el.innerHTML = `
      <div class="transaction-info">
        <h4>${t.description}</h4>
        <p>${t.date} • ${t.category}</p>
      </div>
      <div class="transaction-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}$${Number(t.amount).toFixed(2)}</div>
    `;
    container.appendChild(el);
  });
}

async function loadTrendsChart(months = 6) {
  const data = await apiGet(`/api/trends?months=${months}`);
  if (!data) return;

  const ctx = document.getElementById("trendsChart").getContext("2d");
  if (trendsChart) trendsChart.destroy();
  trendsChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.trends.map(x => x.month),
      datasets: [
        { label: "Income", data: data.trends.map(x => x.income), borderColor: "#10b981", tension: 0.3 },
        { label: "Expenses", data: data.trends.map(x => x.expenses), borderColor: "#f59e0b", tension: 0.3 },
        { label: "Net", data: data.trends.map(x => x.net), borderColor: "#3b82f6", tension: 0.3 }
      ]
    }
  });
}

function renderCategoryChart(obj) {
  const labels = Object.keys(obj);
  const values = Object.values(obj);
  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: ["#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#6366f1","#22c55e"] }]
    },
  });
}

// ===== Transactions tab =====
async function loadTransactionsTab() {
  await updateCategoryOptions("transaction-category", $("#transaction-type").value);
  await updateCategoryOptions("quick-category", $("#quick-type").value);
  await populateCategories();
  await refreshAllTransactions();
}

async function refreshAllTransactions() {
  const qs = new URLSearchParams();
  const start = $("#filter-start-date").value;
  const end = $("#filter-end-date").value;
  const cat = $("#filter-category").value;
  const type = $("#filter-type").value;
  if (start) qs.set("start_date", start);
  if (end) qs.set("end_date", end);
  if (cat) qs.set("category", cat);
  if (type) qs.set("type", type);

  const list = await apiGet(`/api/transactions${qs.toString() ? "?" + qs.toString() : ""}`);
  const container = $("#all-transactions");
  container.innerHTML = "";
  if (!list || list.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No transactions found</h3><p>Try adjusting filters.</p></div>`;
    return;
  }
  list.forEach(t => {
    const el = document.createElement("div");
    el.className = "transaction-item";
    el.innerHTML = `
      <div class="transaction-info">
        <h4>${t.description}</h4>
        <p>${t.date} • ${t.category} • <span class="${t.type}">${t.type}</span></p>
      </div>
      <div class="transaction-actions">
        <div class="transaction-amount ${t.type}">${t.type==='expense'?'-':'+'}$${Number(t.amount).toFixed(2)}</div>
        <button class="btn btn-danger" data-id="${t.id}">Delete</button>
      </div>
    `;
    el.querySelector("button.btn-danger").addEventListener("click", async () => {
      const res = await apiDelete(`/api/transactions/${t.id}`);
      if (res && res.deleted) {
        notify("Transaction deleted");
        await refreshAllTransactions();
        await loadDashboard();
      } else {
        notify("Delete failed", "error");
      }
    });
    container.appendChild(el);
  });
}
function filterTransactions() { refreshAllTransactions(); }
window.filterTransactions = filterTransactions;

// Add Transaction form
document.getElementById("transaction-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    type: $("#transaction-type").value,
    amount: parseFloat($("#transaction-amount").value),
    description: $("#transaction-description").value.trim(),
    category: $("#transaction-category").value,
    date: $("#transaction-date").value
  };
  const ok = await apiPost("/api/transactions", payload);
  if (ok) {
    notify("Transaction added!");
    e.target.reset();
    await loadDashboard();
    await refreshAllTransactions();
  }
});

// Quick Add form
document.getElementById("quick-transaction-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    type: $("#quick-type").value,
    amount: parseFloat($("#quick-amount").value),
    description: $("#quick-description").value.trim(),
    category: $("#quick-category").value,
    date: new Date().toISOString().slice(0,10)
  };
  const ok = await apiPost("/api/transactions", payload);
  if (ok) {
    notify("Quick transaction added!");
    closeQuickAdd();
    e.target.reset();
    await loadDashboard();
    if ($("#transactions").classList.contains("active")) await refreshAllTransactions();
  }
});

// ===== Budgets tab =====
async function loadBudgetsTab() {
  await populateCategories();
  await refreshBudgets();
  await refreshBudgetStatus();
}

async function refreshBudgets() {
  const list = await apiGet("/api/budgets");
  const container = $("#budget-summary");
  container.innerHTML = "";
  if (!list || list.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No budgets yet</h3><p>Create one on the left.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="summary-stats">
      ${list.map(b => `
        <div class="summary-stat">
          <div class="value">$${Number(b.amount).toFixed(2)}</div>
          <div class="label">${b.category} (${b.period})</div>
        </div>
      `).join("")}
    </div>`;
}

async function refreshBudgetStatus() {
  const status = await apiGet("/api/budgets/status");
  const container = $("#budget-status");
  container.innerHTML = "";
  if (!status || Object.keys(status).length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No budget status</h3></div>`;
    return;
  }
  Object.entries(status).forEach(([cat, s]) => {
    const pct = Math.min(100, Math.max(0, s.percentage_used));
    const over = s.over_budget;
    const el = document.createElement("div");
    el.className = "budget-item";
    el.innerHTML = `
      <div class="budget-header">
        <h4>${cat} • ${s.period}</h4>
        <div class="budget-amount">$${s.spent.toFixed(2)} / $${s.budget_amount.toFixed(2)}</div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${over ? "danger" : (pct>=80 ? "over-budget" : "")}" style="width:${Math.min(100, pct)}%"></div>
      </div>
      <div class="budget-stats">
        <span>Used: ${pct.toFixed(1)}%</span>
        <span>${over ? "Over by $" + Math.abs(s.remaining).toFixed(2) : "Remaining: $" + s.remaining.toFixed(2)}</span>
        <span>${s.start_date} → ${s.end_date}</span>
      </div>
    `;
    container.appendChild(el);
  });
}

// Budget form
document.getElementById("budget-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    category: $("#budget-category").value,
    amount: parseFloat($("#budget-amount").value),
    period: $("#budget-period").value
  };
  const ok = await apiPost("/api/budgets", payload);
  if (ok) {
    notify("Budget saved!");
    await refreshBudgets();
    await refreshBudgetStatus();
  }
});

// ===== Insights tab =====
async function loadInsightsTab() {
  const data = await apiGet("/api/insights");
  const insightsBox = $("#insights-content");
  const recsBox = $("#recommendations");
  if (!data) return;

  const topCats = (data.top_spending_categories || [])
    .map(([name, amt]) => `<li>• ${name}: $${Number(amt).toFixed(2)}</li>`).join("");

  insightsBox.innerHTML = `
    <div class="insight-item">
      <div class="insight-icon">💾</div>
      <div class="insight-content">
        <h4>Savings Rate</h4>
        <p>${Number(data.savings_rate).toFixed(1)}% of income saved</p>
      </div>
    </div>
    <div class="insight-item">
      <div class="insight-icon">🏷️</div>
      <div class="insight-content">
        <h4>Top Spending Categories</h4>
        <ul class="insights-list">${topCats || "<li>No expenses yet.</li>"}</ul>
      </div>
    </div>
    ${data.budget_alerts && data.budget_alerts.length ? `
    <div class="insight-item">
      <div class="insight-icon">⚠️</div>
      <div class="insight-content">
        <h4>Budget Alerts</h4>
        <ul class="insights-list">
          ${data.budget_alerts.map(a => `<li class="alert">${a}</li>`).join("")}
        </ul>
      </div>
    </div>` : "" }
  `;

  recsBox.innerHTML = (data.recommendations && data.recommendations.length)
    ? data.recommendations.map(r => `<div class="insight-item"><div class="insight-icon">💡</div><div class="insight-content"><h4>Recommendation</h4><p>${r}</p></div></div>`).join("")
    : `<div class="empty-state"><h3>No recommendations right now</h3></div>`;
}

// ===== Export =====
async function exportData(start = "", end = "") {
  const qs = new URLSearchParams();
  if (start) qs.set("start_date", start);
  if (end) qs.set("end_date", end);
  window.location.href = `/api/export${qs.toString() ? "?" + qs.toString() : ""}`;
}
window.exportData = exportData;

// ===== Init =====
window.addEventListener("load", async () => {
  await updateCategoryOptions("transaction-category", $("#transaction-type").value);
  await updateCategoryOptions("quick-category", $("#quick-type").value);
  await populateCategories();
  await loadDashboard();
});
