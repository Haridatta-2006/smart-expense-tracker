import os
import sqlite3
import csv
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify, render_template, Response
from datetime import datetime

app = Flask(__name__)
DB_FILE = 'database.db'

# --- Database Setup & Utilities ---
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    # Create Expenses Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL
        )
    ''')
    # Create Budget Table (single row for simplicity)
    c.execute('''
        CREATE TABLE IF NOT EXISTS budget (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            amount REAL NOT NULL DEFAULT 0
        )
    ''')
    
    # Initialize default budget if not exists
    c.execute('INSERT OR IGNORE INTO budget (id, amount) VALUES (1, 1000.0)')
    
    # Check if we need sample data
    c.execute('SELECT COUNT(*) FROM expenses')
    if c.fetchone()[0] == 0:
        sample_expenses = [
            (150.0, 'Food', 'Groceries', '2023-10-01'),
            (45.5, 'Travel', 'Uber', '2023-10-02'),
            (200.0, 'Shopping', 'Shoes', '2023-10-05'),
            (80.0, 'Bills', 'Electricity', '2023-10-10'),
            (30.0, 'Entertainment', 'Movie ticket', '2023-10-12'),
            (50.0, 'Health', 'Pharmacy', '2023-10-15'),
            (120.0, 'Food', 'Restaurant', '2023-10-20')
        ]
        c.executemany('INSERT INTO expenses (amount, category, description, date) VALUES (?, ?, ?, ?)', sample_expenses)
        
    conn.commit()
    conn.close()

# Initialize DB on startup
init_db()

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

# --- API Routes ---

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    try:
        conn = get_db_connection()
        # Optional filters
        category = request.args.get('category')
        search = request.args.get('search')
        
        query = 'SELECT * FROM expenses WHERE 1=1'
        params = []
        
        if category and category != 'All':
            query += ' AND category = ?'
            params.append(category)
        if search:
            query += ' AND (description LIKE ? OR category LIKE ?)'
            params.extend(['%'+search+'%', '%'+search+'%'])
            
        query += ' ORDER BY date DESC'
        
        expenses = conn.execute(query, params).fetchall()
        conn.close()
        
        return jsonify([dict(row) for row in expenses])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    try:
        data = request.json
        amount = float(data.get('amount'))
        category = data.get('category')
        description = data.get('description', '')
        date = data.get('date')

        if amount <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400
        if not category or not date:
            return jsonify({'error': 'Category and date are required'}), 400

        conn = get_db_connection()
        conn.execute('INSERT INTO expenses (amount, category, description, date) VALUES (?, ?, ?, ?)',
                     (amount, category, description, date))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Expense added successfully'}), 201
    except ValueError:
        return jsonify({'error': 'Invalid amount format'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses/<int:id>', methods=['PUT'])
def edit_expense(id):
    try:
        data = request.json
        amount = float(data.get('amount'))
        category = data.get('category')
        description = data.get('description', '')
        date = data.get('date')

        if amount <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400

        conn = get_db_connection()
        cursor = conn.execute('UPDATE expenses SET amount=?, category=?, description=?, date=? WHERE id=?',
                              (amount, category, description, date, id))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Expense not found'}), 404
        
        conn.commit()
        conn.close()
        return jsonify({'message': 'Expense updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/expenses/<int:id>', methods=['DELETE'])
def delete_expense(id):
    try:
        conn = get_db_connection()
        cursor = conn.execute('DELETE FROM expenses WHERE id=?', (id,))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Expense not found'}), 404
            
        conn.commit()
        conn.close()
        return jsonify({'message': 'Expense deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_stats():
    try:
        conn = get_db_connection()
        
        # Total Expenses
        total = conn.execute('SELECT SUM(amount) FROM expenses').fetchone()[0] or 0
        
        # Current Month Expenses
        current_month = datetime.now().strftime('%Y-%m')
        monthly_total = conn.execute("SELECT SUM(amount) FROM expenses WHERE strftime('%Y-%m', date) = ?", (current_month,)).fetchone()[0] or 0
        
        # Budget
        budget = conn.execute('SELECT amount FROM budget WHERE id=1').fetchone()[0] or 0
        
        # Category-wise
        categories = conn.execute('SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC').fetchall()
        category_data = {row['category']: row['total'] for row in categories}
        
        # Monthly trend (last 6 months)
        monthly_trend = conn.execute('''
            SELECT strftime('%Y-%m', date) as month, SUM(amount) as total 
            FROM expenses 
            GROUP BY month 
            ORDER BY month DESC 
            LIMIT 6
        ''').fetchall()
        
        trend_data = {row['month']: row['total'] for row in monthly_trend}
        
        conn.close()
        
        return jsonify({
            'total_expenses': round(total, 2),
            'monthly_expenses': round(monthly_total, 2),
            'budget': round(budget, 2),
            'categories': category_data,
            'trend': trend_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/budget', methods=['GET', 'POST'])
def manage_budget():
    try:
        conn = get_db_connection()
        if request.method == 'GET':
            budget = conn.execute('SELECT amount FROM budget WHERE id=1').fetchone()[0]
            conn.close()
            return jsonify({'budget': budget})
        elif request.method == 'POST':
            amount = float(request.json.get('amount', 0))
            if amount < 0:
                return jsonify({'error': 'Budget cannot be negative'}), 400
            conn.execute('UPDATE budget SET amount=? WHERE id=1', (amount,))
            conn.commit()
            conn.close()
            return jsonify({'message': 'Budget updated successfully', 'budget': amount})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['GET'])
def export_csv():
    try:
        conn = get_db_connection()
        expenses = conn.execute('SELECT date, category, amount, description FROM expenses ORDER BY date DESC').fetchall()
        conn.close()

        def generate():
            yield 'Date,Category,Amount,Description\n'
            for row in expenses:
                yield f"{row['date']},{row['category']},{row['amount']},\"{row['description']}\"\n"

        return Response(generate(), mimetype='text/csv', headers={"Content-Disposition": "attachment; filename=expenses.csv"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000)

