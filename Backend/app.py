#!/usr/bin/env python3
"""
Personal Finance Tracker - Flask API
Exposes FinanceTracker methods over HTTP for the frontend.
"""

# --- imports ---
import os
import json
import tempfile
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from dataclasses import dataclass, asdict
from collections import defaultdict
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

# --- dataclasses ---
@dataclass
class Transaction:
    id: Optional[int]
    amount: float
    description: str
    category: str
    date: str
    type: str
    account: str = 'main'

@dataclass
class Budget:
    id: Optional[int]
    category: str
    amount: float
    period: str
    start_date: str
    end_date: str

# --- FinanceTracker class ---
class FinanceTracker:
    def __init__(self, db_path: str = "finance.db"):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # Transactions
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                date TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                account TEXT DEFAULT 'main'
            )
        ''')
        # Budgets
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL UNIQUE,
                amount REAL NOT NULL,
                period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL
            )
        ''')
        # Categories
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK (type IN ('income', 'expense'))
            )
        ''')
        conn.commit()
        conn.close()

    # ---------------- Transactions ----------------
    def add_transaction(self, amount, description, category, type_, date=None, account="main"):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        cursor.execute('''
            INSERT INTO transactions (amount, description, category, date, type, account)
            VALUES (?,?,?,?,?,?)
        ''', (amount, description, category, date, type_, account))
        conn.commit()
        tid = cursor.lastrowid
        conn.close()
        return tid

    def get_transactions(self, start=None, end=None, category=None, type_=None, limit=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        query = "SELECT id, amount, description, category, date, type, account FROM transactions WHERE 1=1"
        params = []
        if start:
            query += " AND date >= ?"
            params.append(start)
        if end:
            query += " AND date <= ?"
            params.append(end)
        if category:
            query += " AND category = ?"
            params.append(category)
        if type_:
            query += " AND type = ?"
            params.append(type_)
        query += " ORDER BY date DESC, id DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [Transaction(*row) for row in rows]

    def delete_transaction(self, tx_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
        conn.commit()
        ok = cursor.rowcount > 0
        conn.close()
        return ok

    # ---------------- Summary & Trends ----------------
    def get_spending_summary(self, start=None, end=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # --- Totals grouped by type ---
        query = "SELECT type, SUM(amount) FROM transactions WHERE 1=1"
        params = []
        if start:
            query += " AND date >= ?"
            params.append(start)
        if end:
            query += " AND date <= ?"
            params.append(end)
        query += " GROUP BY type"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        total_income = 0
        total_expenses = 0
        for t, amt in rows:
            if t == "income":
                total_income = amt or 0
            elif t == "expense":
                total_expenses = amt or 0

        # --- Expenses grouped by category ---
        query2 = "SELECT category, SUM(amount) FROM transactions WHERE type='expense'"
        params2 = []
        if start:
            query2 += " AND date >= ?"
            params2.append(start)
        if end:
            query2 += " AND date <= ?"
            params2.append(end)
        query2 += " GROUP BY category"

        cursor.execute(query2, params2)
        expense_by_category = {row[0]: row[1] for row in cursor.fetchall()}

        conn.close()
        return {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net_income": total_income - total_expenses,
            "expense_by_category": expense_by_category
        }


    def get_spending_trends(self, months=6):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        start_date = (datetime.now() - timedelta(days=30*months)).strftime("%Y-%m-%d")
        cursor.execute('''
            SELECT substr(date,1,7) as month, type, SUM(amount)
            FROM transactions
            WHERE date >= ?
            GROUP BY month, type
            ORDER BY month
        ''', (start_date,))
        rows = cursor.fetchall()
        conn.close()
        data = {}
        for month, type_, amt in rows:
            if month not in data:
                data[month] = {"income": 0, "expenses": 0}
            if type_ == "income":
                data[month]["income"] += amt
            else:
                data[month]["expenses"] += amt
        trends = []
        for m in sorted(data.keys()):
            income = data[m]["income"]
            expenses = data[m]["expenses"]
            trends.append({"month": m, "income": income, "expenses": expenses, "net": income - expenses})
        return {"trends": trends}

    # ---------------- Budgets ----------------
    def add_budget(self, category, amount, period="monthly"):
        start_date = datetime.now().strftime("%Y-%m-%d")
        if period == "weekly":
            end_date = (datetime.now() + timedelta(weeks=1)).strftime("%Y-%m-%d")
        elif period == "yearly":
            end_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
        else:  # monthly
            end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO budgets (category, amount, period, start_date, end_date)
            VALUES (?,?,?,?,?)
        ''', (category, amount, period, start_date, end_date))
        conn.commit()
        bid = cursor.lastrowid
        conn.close()
        return bid

    def get_budgets(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT id, category, amount, period, start_date, end_date FROM budgets")
        rows = cursor.fetchall()
        conn.close()
        return [Budget(*row) for row in rows]

    def get_budget_status(self, category=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        query = "SELECT category, amount, period, start_date, end_date FROM budgets"
        params = []
        if category:
            query += " WHERE category=?"
            params.append(category)
        cursor.execute(query, params)
        budgets = cursor.fetchall()

        status = {}
        for cat, amt, period, start, end in budgets:
            cursor.execute('''
                SELECT SUM(amount) FROM transactions
                WHERE category=? AND type='expense' AND date BETWEEN ? AND ?
            ''', (cat, start, end))
            spent = cursor.fetchone()[0] or 0
            remaining = amt - spent
            pct = (spent/amt)*100 if amt else 0
            status[cat] = {
                "budget_amount": amt,
                "spent": spent,
                "remaining": remaining,
                "percentage_used": pct,
                "over_budget": spent > amt,
                "period": period,
                "start_date": start,
                "end_date": end
            }
        conn.close()
        return status

    # ---------------- Insights ----------------
    def get_financial_insights(self):
        summary = self.get_spending_summary()
        savings_rate = 0
        if summary["total_income"] > 0:
            savings_rate = (summary["net_income"] / summary["total_income"]) * 100

        # Top 3 categories
        top_cats = sorted(summary["expense_by_category"].items(),
                          key=lambda x: x[1], reverse=True)[:3]

        budget_alerts = []
        for cat, s in self.get_budget_status().items():
            if s["over_budget"]:
                budget_alerts.append(f"⚠️ Over budget in {cat} by ${abs(s['remaining']):.2f}")

        recs = []
        if savings_rate < 10:
            recs.append("Try to save at least 10% of your income.")
        if top_cats:
            biggest_cat = top_cats[0][0]
            recs.append(f"Review your spending in {biggest_cat}, it is your top expense.")

        return {
            "savings_rate": savings_rate,
            "top_spending_categories": top_cats,
            "budget_alerts": budget_alerts,
            "recommendations": recs
        }

    # ---------------- Export ----------------
    def export_data(self, filepath, start=None, end=None):
        data = {
            "summary": self.get_spending_summary(start, end),
            "transactions": [asdict(t) for t in self.get_transactions(start, end)],
            "budgets": [asdict(b) for b in self.get_budgets()]
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

# --- Flask setup (AFTER FinanceTracker is defined) ---
app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)
tracker = FinanceTracker()

# --- static file serving ---
@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("../frontend", path)

# --- API routes ---
@app.get("/api/health")
def health():
    return jsonify({"ok": True})

@app.get("/api/summary")
def api_summary():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    return jsonify(tracker.get_spending_summary(start, end))

@app.get("/api/trends")
def api_trends():
    months = int(request.args.get("months", 6))
    return jsonify(tracker.get_spending_trends(months))

@app.route("/api/categories")
def get_categories():
    ctype = request.args.get("type", "all")

    expense_categories = [
        "Food", "Rent", "Utilities", "Transport", "Shopping", "Health", "Entertainment", "Other"
    ]
    income_categories = [
        "Salary", "Investments", "Freelance", "Gifts", "Other"
    ]

    if ctype == "expense":
        return jsonify(expense_categories)
    elif ctype == "income":
        return jsonify(income_categories)
    else:  # "all"
        return jsonify(expense_categories + income_categories)

@app.route("/api/transactions", methods=["GET","POST"])
def api_transactions():
    if request.method == "POST":
        data = request.get_json(force=True)
        tid = tracker.add_transaction(
            float(data["amount"]),
            data["description"],
            data["category"],
            data["type"],
            data.get("date"),
            data.get("account","main")
        )
        return jsonify({"id": tid, "status":"ok"})
    # GET with filters
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    cat = request.args.get("category")
    t = request.args.get("type")
    limit = request.args.get("limit", type=int)
    txs = tracker.get_transactions(start, end, cat, t, limit)
    return jsonify([asdict(tx) for tx in txs])

@app.delete("/api/transactions/<int:tx_id>")
def api_delete_transaction(tx_id):
    ok = tracker.delete_transaction(tx_id)
    return jsonify({"deleted": ok})

@app.route("/api/budgets", methods=["GET","POST"])
def api_budgets():
    if request.method == "POST":
        data = request.get_json(force=True)
        bid = tracker.add_budget(data["category"], float(data["amount"]), data.get("period","monthly"))
        return jsonify({"id": bid, "status":"ok"})
    budgets = [asdict(b) for b in tracker.get_budgets()]
    return jsonify(budgets)

@app.get("/api/budgets/status")
def api_budget_status():
    cat = request.args.get("category")
    return jsonify(tracker.get_budget_status(cat))

@app.get("/api/insights")
def api_insights():
    return jsonify(tracker.get_financial_insights())

@app.get("/api/export")
def api_export():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    fd, path = tempfile.mkstemp(prefix="finance_export_", suffix=".json")
    os.close(fd)
    tracker.export_data(path, start, end)
    return send_file(path, as_attachment=True, download_name="finance_export.json", mimetype="application/json")

# --- Run the app ---
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
