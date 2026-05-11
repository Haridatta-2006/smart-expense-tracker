// Global state
let currentView = 'dashboard';
let expenses = [];
let categoryChartInstance = null;
let trendChartInstance = null;
let currentEditId = null;
let deleteId = null;

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;
const sidebarNavs = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');

// Formatting utilities
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
};

const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
};

// Theme management
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
};

const toggleTheme = () => {
    const currentTheme = htmlEl.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    // Re-render charts for theme colors
    loadDashboardStats();
};

const updateThemeIcon = (theme) => {
    themeToggle.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
};

themeToggle.addEventListener('click', toggleTheme);

// Navigation
const switchView = (view) => {
    currentView = view;
    
    // Update sidebar active state
    sidebarNavs.forEach(nav => {
        if(nav.dataset.view === view) {
            nav.classList.add('active');
            document.getElementById('page-title').innerText = nav.querySelector('span').innerText;
        } else {
            nav.classList.remove('active');
        }
    });

    // Update main content views
    viewSections.forEach(section => {
        if(section.id === `${view}-view`) {
            section.classList.remove('d-none');
        } else {
            section.classList.add('d-none');
        }
    });

    // Load data based on view
    if(view === 'dashboard') loadDashboardStats();
    if(view === 'transactions') loadTransactions();
    if(view === 'budget') loadBudget();

    // Close mobile menu if open
    sidebar.classList.remove('open');
};

sidebarNavs.forEach(nav => {
    nav.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(nav.dataset.view);
    });
});

mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// Toast Notifications
const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// API Calls
const api = {
    getExpenses: async (category = 'All', search = '') => {
        const params = new URLSearchParams();
        if(category !== 'All') params.append('category', category);
        if(search) params.append('search', search);
        
        const res = await fetch(`/api/expenses?${params.toString()}`);
        return res.json();
    },
    addExpense: async (data) => {
        const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error((await res.json()).error);
        return res.json();
    },
    updateExpense: async (id, data) => {
        const res = await fetch(`/api/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error((await res.json()).error);
        return res.json();
    },
    deleteExpense: async (id) => {
        const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error((await res.json()).error);
        return res.json();
    },
    getDashboardStats: async () => {
        const res = await fetch('/api/dashboard');
        return res.json();
    },
    getBudget: async () => {
        const res = await fetch('/api/budget');
        return res.json();
    },
    updateBudget: async (amount) => {
        const res = await fetch('/api/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        if(!res.ok) throw new Error((await res.json()).error);
        return res.json();
    }
};

// Dashboard Logic
const loadDashboardStats = async () => {
    try {
        const data = await api.getDashboardStats();
        
        // Update Stats Cards
        document.getElementById('stat-total').innerText = formatCurrency(data.total_expenses);
        document.getElementById('stat-monthly').innerText = formatCurrency(data.monthly_expenses);
        document.getElementById('stat-budget').innerText = formatCurrency(data.budget);
        
        const categories = Object.keys(data.categories);
        const highestCategory = categories.length > 0 ? categories[0] : '-';
        document.getElementById('stat-highest').innerText = highestCategory;

        // Render Charts
        renderCategoryChart(data.categories);
        renderTrendChart(data.trend);

        // Load recent transactions (first 5)
        const recentExpenses = await api.getExpenses();
        renderRecentTransactions(recentExpenses.slice(0, 5));

    } catch (error) {
        showToast('Failed to load dashboard data', 'error');
    }
};

// Chart Generators
const getChartColors = () => {
    const isDark = htmlEl.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#f8fafc' : '#0f172a',
        grid: isDark ? '#334155' : '#e2e8f0',
        palette: [
            '#6366f1', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'
        ]
    };
};

const renderCategoryChart = (categoryData) => {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const colors = getChartColors();
    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);

    if (categoryChartInstance) categoryChartInstance.destroy();

    if(labels.length === 0) {
        // Render empty state
        categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Data'], datasets: [{ data: [1], backgroundColor: [colors.grid] }] },
            options: { plugins: { tooltip: { enabled: false } }, cutout: '70%' }
        });
        return;
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.palette,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: colors.text } }
            },
            cutout: '70%'
        }
    });
};

const renderTrendChart = (trendData) => {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const colors = getChartColors();
    
    // Sort months chronologically
    const sortedMonths = Object.keys(trendData).sort();
    const data = sortedMonths.map(month => trendData[month]);

    // Format labels nicely (e.g., "2023-10" to "Oct '23")
    const labels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Spend',
                data: data,
                backgroundColor: '#6366f1',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
                x: { grid: { display: false }, ticks: { color: colors.text } }
            }
        }
    });
};

// Render Tables
const renderRecentTransactions = (expenses) => {
    const tbody = document.getElementById('recent-transactions-body');
    const emptyState = document.getElementById('recent-empty-state');
    
    tbody.innerHTML = '';
    
    if(expenses.length === 0) {
        emptyState.classList.remove('d-none');
        tbody.parentElement.classList.add('d-none');
        return;
    }
    
    emptyState.classList.add('d-none');
    tbody.parentElement.classList.remove('d-none');

    expenses.forEach(exp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(exp.date)}</td>
            <td>${exp.description || '-'}</td>
            <td><span class="badge badge-${exp.category}">${exp.category}</span></td>
            <td class="text-danger font-weight-bold">-${formatCurrency(exp.amount)}</td>
        `;
        tbody.appendChild(tr);
    });
};

// Transactions View Logic
const loadTransactions = async () => {
    const category = document.getElementById('category-filter').value;
    const search = document.getElementById('search-input').value;
    
    try {
        const data = await api.getExpenses(category, search);
        expenses = data;
        renderAllTransactions();
    } catch (error) {
        showToast('Failed to load transactions', 'error');
    }
};

const renderAllTransactions = () => {
    const tbody = document.getElementById('all-transactions-body');
    const emptyState = document.getElementById('all-empty-state');
    
    tbody.innerHTML = '';
    
    if(expenses.length === 0) {
        emptyState.classList.remove('d-none');
        document.querySelector('.table-wrapper').classList.add('d-none');
        return;
    }
    
    emptyState.classList.add('d-none');
    document.querySelector('.table-wrapper').classList.remove('d-none');

    expenses.forEach(exp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(exp.date)}</td>
            <td>${exp.description || '-'}</td>
            <td><span class="badge badge-${exp.category}">${exp.category}</span></td>
            <td class="text-danger">-${formatCurrency(exp.amount)}</td>
            <td>
                <button class="btn-icon" onclick="editExpense(${exp.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon delete" onclick="confirmDelete(${exp.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// Filters
document.getElementById('category-filter').addEventListener('change', loadTransactions);
let searchTimeout;
document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadTransactions, 500);
});

// Modals Logic (Add/Edit)
const expenseModal = document.getElementById('expense-modal');
const expenseForm = document.getElementById('expense-form');

const openExpenseModal = (editMode = false) => {
    document.getElementById('modal-title').innerText = editMode ? 'Edit Expense' : 'Add Expense';
    expenseModal.classList.add('active');
    if(!editMode) {
        expenseForm.reset();
        document.getElementById('expense-id').value = '';
        document.getElementById('date').valueAsDate = new Date(); // default today
    }
};

const closeExpenseModal = () => {
    expenseModal.classList.remove('active');
    currentEditId = null;
};

document.querySelectorAll('.add-expense-btn').forEach(btn => {
    btn.addEventListener('click', () => openExpenseModal(false));
});

document.getElementById('close-modal').addEventListener('click', closeExpenseModal);
document.getElementById('cancel-modal').addEventListener('click', closeExpenseModal);

// Submit Expense Form
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('save-expense');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const id = document.getElementById('expense-id').value;
    const data = {
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        date: document.getElementById('date').value,
        description: document.getElementById('description').value
    };

    try {
        if(id) {
            await api.updateExpense(id, data);
            showToast('Expense updated successfully');
        } else {
            await api.addExpense(data);
            showToast('Expense added successfully');
        }
        closeExpenseModal();
        if(currentView === 'dashboard') loadDashboardStats();
        if(currentView === 'transactions') loadTransactions();
        if(currentView === 'budget') loadBudget(); // Update budget progress
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Save Expense';
    }
});

window.editExpense = (id) => {
    const expense = expenses.find(e => e.id === id);
    if(expense) {
        document.getElementById('expense-id').value = expense.id;
        document.getElementById('amount').value = expense.amount;
        document.getElementById('category').value = expense.category;
        document.getElementById('date').value = expense.date;
        document.getElementById('description').value = expense.description;
        openExpenseModal(true);
    }
};

// Delete Modal Logic
const confirmModal = document.getElementById('confirm-modal');

window.confirmDelete = (id) => {
    deleteId = id;
    confirmModal.classList.add('active');
};

const closeConfirmModal = () => {
    confirmModal.classList.remove('active');
    deleteId = null;
};

document.getElementById('cancel-delete').addEventListener('click', closeConfirmModal);

document.getElementById('confirm-delete').addEventListener('click', async () => {
    if(deleteId) {
        const btn = document.getElementById('confirm-delete');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
        
        try {
            await api.deleteExpense(deleteId);
            showToast('Expense deleted successfully');
            closeConfirmModal();
            if(currentView === 'dashboard') loadDashboardStats();
            if(currentView === 'transactions') loadTransactions();
            if(currentView === 'budget') loadBudget();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = 'Delete';
        }
    }
});

// Budget View Logic
const loadBudget = async () => {
    try {
        const data = await api.getDashboardStats(); // reusing stats API to get current month expenses
        const currentMonthSpent = data.monthly_expenses;
        const budgetLimit = data.budget;

        document.getElementById('budget-spent').innerText = formatCurrency(currentMonthSpent);
        document.getElementById('budget-limit').innerText = formatCurrency(budgetLimit);
        document.getElementById('budget-amount-input').value = budgetLimit;

        const progressEl = document.getElementById('budget-progress');
        const alertEl = document.getElementById('budget-alert');

        if (budgetLimit > 0) {
            let percentage = (currentMonthSpent / budgetLimit) * 100;
            if(percentage > 100) percentage = 100;
            
            progressEl.style.width = `${percentage}%`;
            
            // Color logic
            progressEl.className = 'progress-bar';
            if (percentage >= 90) {
                progressEl.classList.add('danger');
            } else if (percentage >= 75) {
                progressEl.classList.add('warning');
            }

            if(currentMonthSpent > budgetLimit) {
                alertEl.classList.remove('d-none');
            } else {
                alertEl.classList.add('d-none');
            }
        } else {
            progressEl.style.width = '0%';
            alertEl.classList.add('d-none');
        }

    } catch (error) {
        showToast('Failed to load budget', 'error');
    }
};

document.getElementById('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('budget-amount-input').value;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    
    try {
        await api.updateBudget(amount);
        showToast('Budget updated successfully');
        loadBudget();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
});

// Export CSV Logic
document.getElementById('export-btn').addEventListener('click', () => {
    window.location.href = '/api/export';
});

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    switchView('dashboard');
});
