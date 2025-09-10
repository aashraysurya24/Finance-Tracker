# 💰 Personal Finance Tracker  

A full-stack **Personal Finance Tracker** built with **Flask (Python)** and a **vanilla JavaScript frontend**.  
It helps you **track income, expenses, budgets, and get insights** into your spending habits with interactive dashboards and charts.  

---

## 🚀 Features  

- 📊 **Dashboard** with income, expenses, and net income overview  
- 💳 **Transactions**: Add, view, filter, and delete transactions  
- 🎯 **Budgets**: Set budgets per category and track status over time  
- 📈 **Insights**: View savings rate, top spending categories, and budget alerts  
- 🔄 **Export**: Download your data as JSON for backup or analysis  
- 🎨 Clean UI with **Chart.js** visualizations  

---

## 🛠️ Tech Stack  

- **Backend**: Flask (Python), SQLite  
- **Frontend**: Vanilla JavaScript, HTML, CSS, Chart.js  
- **API**: RESTful endpoints (`/api/transactions`, `/api/budgets`, `/api/categories`, etc.)  

---

## 📂 Project Structure  

Finance Tracker/
├─ Backend/
│ ├─ app.py # Flask API server
│ └─ finance.db # SQLite database (auto-created)
└─ frontend/
├─ index.html # Main UI
├─ styles.css # Styling
└─ app.js # Frontend logic


---

## ⚡ Getting Started  

### 1. Clone the repo  
- git clone https://github.com/aashraysurya24/finance-tracker.git
- cd finance-tracker/Backend


### 2.  Setup environment
python -m venv .venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate  # Mac/Linux
pip install flask flask-cors

### 3. Run the Backend
python app.py

### 4. Open the app
Just go to http://127.0.0.1:5000/
 in your browser.

- Add transactions and budgets.
- Watch the dashboard update in real-time.
