import streamlit as st
import sqlite3
import pandas as pd
import plotly.express as px
from datetime import datetime

# Configure page
st.set_page_config(page_title="Smart Expense Tracker", page_icon="💸", layout="wide")

DB_FILE = 'database.db'

# --- Database Setup & Utilities ---
def get_db_connection():
    return sqlite3.connect(DB_FILE)

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,a
            category TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS budget (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            amount REAL NOT NULL DEFAULT 0
        )
    ''')
    c.execute('INSERT OR IGNORE INTO budget (id, amount) VALUES (1, 1000.0)')
    conn.commit()
    conn.close()

init_db()

# --- Helper Functions ---
def format_inr(amount):
    return f"₹ {amount:,.2f}"

def get_expenses_df():
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT id, date, category, amount, description FROM expenses ORDER BY date DESC", conn)
    conn.close()
    return df

def get_budget():
    conn = get_db_connection()
    budget = conn.execute('SELECT amount FROM budget WHERE id=1').fetchone()[0]
    conn.close()
    return float(budget)

def update_budget(amount):
    conn = get_db_connection()
    conn.execute('UPDATE budget SET amount=? WHERE id=1', (amount,))
    conn.commit()
    conn.close()

def add_expense(date, category, amount, description):
    conn = get_db_connection()
    conn.execute('INSERT INTO expenses (date, category, amount, description) VALUES (?, ?, ?, ?)',
                 (date.strftime("%Y-%m-%d"), category, float(amount), description))
    conn.commit()
    conn.close()

def delete_expense(expense_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM expenses WHERE id=?', (int(expense_id),))
    conn.commit()
    conn.close()

# --- Main Application ---
st.title("💸 Smart Expense Tracker")

# Sidebar - Actions
with st.sidebar:
    st.header("➕ Add Expense")
    with st.form("add_expense_form", clear_on_submit=True):
        date = st.date_input("Date", datetime.today())
        category = st.selectbox("Category", ["Food", "Travel", "Shopping", "Bills", "Entertainment", "Health", "Education", "Others"])
        amount = st.number_input("Amount (₹)", min_value=0.01, step=10.0)
        description = st.text_input("Description (Optional)")
        submitted = st.form_submit_button("Save Expense")
        if submitted:
            add_expense(date, category, amount, description)
            st.success("Expense added successfully!")
            st.rerun()
            
    st.divider()
    
    st.header("🎯 Set Budget")
    current_budget = get_budget()
    with st.form("update_budget_form"):
        new_budget = st.number_input("Monthly Budget (₹)", min_value=0.0, value=current_budget, step=100.0)
        budget_submitted = st.form_submit_button("Update Budget")
        if budget_submitted:
            update_budget(new_budget)
            st.success("Budget updated!")
            st.rerun()

# Load Data
df = get_expenses_df()
current_budget = get_budget()

# Calculate Metrics
total_expense = df['amount'].sum() if not df.empty else 0.0

current_month_str = datetime.now().strftime("%Y-%m")
if not df.empty:
    # Ensure date is string to match the format
    df['date_str'] = df['date'].astype(str)
    monthly_df = df[df['date_str'].str.startswith(current_month_str)]
    monthly_expense = monthly_df['amount'].sum()
    
    category_totals = df.groupby('category')['amount'].sum().reset_index()
    highest_category = category_totals.sort_values(by='amount', ascending=False).iloc[0]['category'] if not category_totals.empty else "-"
else:
    monthly_expense = 0.0
    highest_category = "-"

# --- Dashboard Metrics ---
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Total Expenses", format_inr(total_expense))
with col2:
    st.metric("This Month", format_inr(monthly_expense))
with col3:
    budget_delta = current_budget - monthly_expense
    delta_color = "normal" if budget_delta >= 0 else "inverse"
    st.metric("Monthly Budget", format_inr(current_budget), delta=format_inr(budget_delta), delta_color=delta_color)
with col4:
    st.metric("Highest Category", highest_category)

if monthly_expense > current_budget and current_budget > 0:
    st.warning("⚠️ Warning: You have exceeded your monthly budget!")

st.divider()

# --- Tabs for Charts and Data ---
tab1, tab2 = st.tabs(["📊 Analytics", "📋 Transactions & Data Export"])

with tab1:
    if df.empty:
        st.info("No expenses recorded yet. Add some from the sidebar!")
    else:
        chart_col1, chart_col2 = st.columns(2)
        
        with chart_col1:
            st.subheader("Spending by Category")
            fig_pie = px.pie(category_totals, values='amount', names='category', hole=0.4, 
                             color_discrete_sequence=px.colors.qualitative.Pastel)
            st.plotly_chart(fig_pie, use_container_width=True)
            
        with chart_col2:
            st.subheader("Monthly Trend")
            # Create a monthly trend
            df['month'] = df['date_str'].str[:7]
            trend_df = df.groupby('month')['amount'].sum().reset_index()
            # Sort chronologically and keep last 6
            trend_df = trend_df.sort_values('month').tail(6)
            
            fig_bar = px.bar(trend_df, x='month', y='amount', text_auto='.2s', 
                             labels={'month': 'Month', 'amount': 'Amount (₹)'})
            fig_bar.update_traces(textfont_size=12, textangle=0, textposition="outside", cliponaxis=False)
            st.plotly_chart(fig_bar, use_container_width=True)

with tab2:
    st.subheader("Transaction History")
    if df.empty:
        st.info("No transactions found.")
    else:
        # Display data using st.dataframe or st.data_editor (for visual representation)
        # We'll use a simple approach to allow deletion by ID
        
        # Format dataframe for display
        display_df = df[['id', 'date', 'category', 'description', 'amount']].copy()
        
        st.dataframe(
            display_df,
            column_config={
                "id": "ID",
                "date": "Date",
                "category": "Category",
                "description": "Description",
                "amount": st.column_config.NumberColumn("Amount (₹)", format="₹ %.2f")
            },
            hide_index=True,
            use_container_width=True
        )
        
        st.divider()
        st.write("### Manage Transactions")
        del_col1, del_col2 = st.columns([1, 3])
        with del_col1:
            expense_to_delete = st.selectbox("Select ID to Delete", display_df['id'].tolist())
            if st.button("Delete Expense", type="primary"):
                delete_expense(expense_to_delete)
                st.success(f"Expense #{expense_to_delete} deleted!")
                st.rerun()
                
        # Export CSV
        st.divider()
        csv = display_df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="⬇️ Download Data as CSV",
            data=csv,
            file_name='smart_expenses.csv',
            mime='text/csv',
        )
