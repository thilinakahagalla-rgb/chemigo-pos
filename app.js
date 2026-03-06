// --- Database Initialization ---
const db = new Dexie('ChemigoDB');
db.version(5).stores({
    products: '++id, barcode, name, sellingPrice, stock',
    expenses: '++id, category, date',
    customers: '++id, phone, name',
    sales: '++id, date, customerPhone',
    accounts: '++id, name, balance'
});

// Initialize Accounts if they don't exist
const initAccounts = async () => {
    const count = await db.accounts.count();
    if (count === 0) {
        await db.accounts.add({ name: 'Cash Box', balance: 0 });
        await db.accounts.add({ name: 'Bank Account', balance: 0 });
    }
};
initAccounts();

// --- State Management ---
const state = {
    cart: [],
    currentView: 'pos',
    scanner: null,
    editingProduct: null,
    reportMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
    expenseMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
    paymentMethod: 'cash'
};

// --- Utilities ---
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
};

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl text-white shadow-lg transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-3 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// --- Router ---
const router = {
    navigate: async (view) => {
        state.currentView = view;

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === view);
        });

        const content = document.getElementById('app-content');
        content.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fa-solid fa-spinner fa-spin text-4xl text-primary"></i></div>';

        try {
            switch (view) {
                case 'pos': await views.pos(); break;
                case 'products': await views.products(); break;
                case 'expenses': await views.expenses(); break;
                case 'customers': await views.customers(); break;
                case 'reports': await views.reports(); break;
                case 'inventory': await views.inventory(); break;
                case 'sales': await views.sales(); break;
                case 'deliveries': await views.deliveries(); break;
                case 'accounts': await views.accounts(); break;
                case 'backup': await views.backup(); break;
                default: await views.pos();
            }
        } catch (error) {
            console.error(error);
            showToast('Error loading view', 'error');
        }
    }
};

// --- Views ---
const views = {
    pos: async () => {
        const content = document.getElementById('app-content');
        document.getElementById('page-title').innerText = 'Point of Sale';

        content.innerHTML = `
            <div class="flex h-full gap-6 flex-col lg:flex-row pb-20 lg:pb-0">
                <!-- Product Section -->
                <div class="flex-1 flex flex-col gap-4 h-full overflow-hidden">
                    <!-- Search & Scan -->
                    <div class="glass-panel p-4 rounded-2xl flex gap-2 sm:gap-4 items-center shrink-0">
                        <div class="relative flex-1">
                            <input type="text" id="pos-search" placeholder="Scan/Search..." 
                                class="w-full bg-slate-900 border border-slate-700 rounded-xl px-10 sm:px-12 py-3 focus:outline-none focus:border-primary text-base sm:text-lg"
                                autofocus>
                            <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
                        </div>
                        <button onclick="actions.toggleScanner()" class="p-3 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-primary transition-colors shrink-0" title="Scan Barcode">
                            <i class="fa-solid fa-barcode text-xl"></i>
                        </button>
                        <button onclick="actions.openQuickAddModal()" class="p-3 bg-green-600/20 border border-green-500/30 rounded-xl hover:bg-green-600/30 text-green-500 transition-colors shrink-0 font-bold" title="Quick Add">
                            <i class="fa-solid fa-plus text-lg"></i>
                        </button>
                    </div>

                    <div id="scanner-container" class="hidden glass-panel p-2 rounded-2xl overflow-hidden relative shrink-0">
                         <div id="reader" width="100%"></div>
                         <button onclick="actions.stopScanner()" class="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white w-8 h-8 flex items-center justify-center"><i class="fa-solid fa-times"></i></button>
                    </div>

                    <!-- Product Grid -->
                    <div class="flex-1 overflow-y-auto glass-panel rounded-2xl p-2 sm:p-4">
                        <div id="product-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 pb-20">
                            <!-- Products injected here -->
                        </div>
                    </div>
                </div>

                <!-- Floating Cart Toggle (Mobile) -->
                <button onclick="document.getElementById('mobile-cart').classList.toggle('translate-y-full')" 
                    class="lg:hidden fixed bottom-20 right-4 bg-primary text-white p-4 rounded-full shadow-2xl z-40 flex items-center gap-2 animate-bounce-custom">
                    <i class="fa-solid fa-cart-shopping"></i>
                    <span id="mobile-cart-count" class="font-bold">0</span>
                </button>

                <!-- Cart Section (Responsive) -->
                <div id="mobile-cart" class="fixed inset-x-0 bottom-0 top-20 bg-slate-900 z-50 transform translate-y-full transition-transform duration-300 lg:translate-y-0 lg:static lg:w-[400px] lg:bg-transparent lg:block glass-panel rounded-t-2xl lg:rounded-2xl flex flex-col h-full border-l-0 lg:border-l-4 border-primary/20">
                    <div class="p-4 border-b border-white/10 flex justify-between items-center bg-slate-800/50 rounded-t-2xl shrink-0">
                        <h3 class="font-bold text-lg"><i class="fa-solid fa-cart-shopping mr-2 text-primary"></i> Current Sale</h3>
                        <div class="flex items-center gap-3">
                             <span class="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold" id="cart-count">0 Items</span>
                             <button onclick="document.getElementById('mobile-cart').classList.add('translate-y-full')" class="lg:hidden text-slate-400"><i class="fa-solid fa-chevron-down text-xl"></i></button>
                        </div>
                    </div>

                    <!-- Cart Items -->
                    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3" id="cart-items">
                        <div class="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                            <i class="fa-solid fa-basket-shopping text-6xl opacity-20"></i>
                            <p>Cart is empty</p>
                        </div>
                    </div>

                    <!-- Customer Select -->
                    <div class="p-4 border-t border-white/10 bg-slate-800/30 shrink-0">
                         <div class="flex gap-2">
                            <select id="cart-customer" class="flex-1 p-2 rounded-lg text-sm bg-slate-900 border border-slate-700">
                                <option value="">Select Customer (Optional)</option>
                            </select>
                            <button onclick="actions.openCustomerModal()" class="p-2 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700"><i class="fa-solid fa-plus text-primary"></i></button>
                         </div>
                    </div>

                    <!-- Totals -->
                    <div class="p-6 bg-slate-800 rounded-b-lg lg:rounded-b-2xl border-t border-white/10 shadow-inner shrink-0">
                        <div class="flex justify-between mb-2 text-sm text-slate-400">
                            <span>Subtotal</span>
                            <span id="cart-subtotal">0.00 LKR</span>
                        </div>
                        <div class="flex justify-between mb-2 text-sm text-slate-400">
                            <span>Item Discount</span>
                            <span id="cart-discount" class="text-green-400">0.00 LKR</span>
                        </div>
                        <div class="flex justify-between mb-2 text-sm text-slate-400">
                            <span>Bill Discount</span>
                            <div class="flex items-center gap-2">
                                <input type="number" id="cart-bill-discount" value="0" class="w-20 text-right bg-transparent border-b border-slate-600 focus:border-green-500 p-0 h-6 text-sm text-green-400" oninput="actions.updateCartTotals()">
                            </div>
                        </div>
                        <div class="flex justify-between mb-2 text-sm text-slate-400">
                            <span>Delivery</span>
                            <div class="flex items-center gap-2">
                                <label class="flex items-center gap-1 cursor-pointer group" title="Auto Calculate Delivery by Weight">
                                    <input type="checkbox" id="auto-delivery" class="hidden peer" onchange="actions.updateCartTotals()">
                                    <div class="w-8 h-4 bg-slate-700 rounded-full peer-checked:bg-primary transition-colors relative">
                                        <div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                                    </div>
                                    <span class="text-[10px] uppercase font-bold text-slate-500 peer-checked:text-primary">Auto</span>
                                </label>
                                <input type="number" id="cart-delivery" value="0" class="w-20 text-right bg-transparent border-b border-slate-600 focus:border-primary p-0 h-6 text-sm" oninput="actions.toggleDeliveryDetails(this.value); actions.updateCartTotals()">
                            </div>
                        </div>
                        <div id="weight-display" class="flex justify-between mb-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider hidden">
                            <span>Total Weight</span>
                            <span id="cart-total-weight">0.00 kg</span>
                        </div>
                        <div id="profit-display-section" class="flex justify-between mb-2 text-[10px] text-green-500 font-bold uppercase tracking-wider">
                            <span>Expected Profit</span>
                            <span id="cart-profit-estimate">0.00 LKR</span>
                        </div>

                        <!-- Delivery Details Section -->
                        <div id="delivery-details-section" class="hidden space-y-3 mt-4 p-3 bg-white/5 rounded-xl border border-white/5 animate-fade-in">
                            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Delivery Details</h4>
                            <input type="text" id="delivery-name" placeholder="Recipient Name" class="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2">
                            <textarea id="delivery-address" placeholder="Delivery Address" class="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2" rows="2"></textarea>
                            <input type="text" id="delivery-tracking" placeholder="Tracking Number (Optional)" class="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-primary font-mono">
                        </div>

                        <div class="flex justify-between mt-4 text-2xl font-bold">
                            <span>Total</span>
                            <span class="text-primary" id="cart-total">0.00 LKR</span>
                        </div>

                        <!-- Payment & Cash Integration -->
                        <div class="mt-6 space-y-4 pt-4 border-t border-white/10">
                            <div class="flex flex-col gap-2">
                                <label class="text-xs font-bold text-slate-400 uppercase">Payment Method</label>
                                <div class="grid grid-cols-2 gap-2">
                                    <button onclick="actions.setPaymentMethod('cash')" id="btn-pay-cash" class="pay-method-btn active p-2 rounded-xl border border-primary/50 bg-primary/20 text-primary flex items-center justify-center gap-2">
                                        <i class="fa-solid fa-money-bill-1"></i> Cash
                                    </button>
                                    <button onclick="actions.setPaymentMethod('bank')" id="btn-pay-bank" class="pay-method-btn p-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 flex items-center justify-center gap-2">
                                        <i class="fa-solid fa-building-columns"></i> Bank
                                    </button>
                                </div>
                            </div>

                            <div id="cash-calculation-section" class="space-y-3 animate-fade-in">
                                <div class="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-white/5">
                                    <span class="text-sm font-medium">Amount Received</span>
                                    <input type="number" id="cash-given" placeholder="0.00" 
                                        class="w-28 text-right bg-slate-800 border-none rounded-lg p-2 text-primary font-bold focus:ring-1 focus:ring-primary"
                                        oninput="actions.calculateChange()">
                                </div>
                                <div class="flex justify-between items-center px-3">
                                    <span class="text-sm text-slate-400">Balance (Change)</span>
                                    <span class="text-xl font-bold text-green-400" id="cash-balance">0.00 LKR</span>
                                </div>
                            </div>
                        </div>
                        
                        <button onclick="actions.checkout()" class="w-full mt-6 bg-gradient-to-r from-primary to-secondary py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-primary/50 transition-all transform hover:scale-[1.02] flex justify-center items-center gap-2">
                            <i class="fa-solid fa-receipt"></i> Complete Sale
                        </button>

                        <!-- Share Quotation Section -->
                        <div class="grid grid-cols-2 gap-3 mt-4">
                            <button onclick="actions.shareQuotation('whatsapp')" class="bg-slate-700/50 hover:bg-slate-700 p-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 border border-white/5 transition-all text-green-400">
                                <i class="fa-brands fa-whatsapp text-lg"></i> Send WhatsApp Quote
                            </button>
                            <button onclick="actions.shareQuotation('print')" class="bg-slate-700/50 hover:bg-slate-700 p-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 border border-white/5 transition-all text-blue-400">
                                <i class="fa-solid fa-print text-lg"></i> Print Price Quote
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        `;

        actions.loadProductsToGrid();
        actions.loadCustomersToSelect();

        const searchInput = document.getElementById('pos-search');
        searchInput.addEventListener('input', (e) => actions.loadProductsToGrid(e.target.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                actions.scanBarcode(e.target.value);
                e.target.value = '';
            }
        });
        actions.renderCart();
    },

    products: async () => {
        document.getElementById('page-title').innerText = 'Product Management';
        const products = await db.products.toArray();
        const content = document.getElementById('app-content');

        content.innerHTML = `
            <div class="flex flex-col h-full gap-6">
                 <div class="flex justify-between items-center">
                    <div class="flex gap-4">
                        <button onclick="actions.openProductModal()" class="bg-primary hover:bg-primary/90 px-6 py-2 rounded-xl font-medium shadow-lg shadow-primary/20 flex items-center gap-2">
                            <i class="fa-solid fa-plus"></i> New Product
                        </button>
                    </div>
                    <input type="text" placeholder="Search products..." class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 w-64" oninput="actions.filterProductTable(this.value)">
                </div>

                <div class="glass-panel rounded-2xl flex-1 overflow-hidden flex flex-col">
                    <div class="overflow-x-auto">
                        <table class="table-glass w-full">
                            <thead>
                                <tr>
                                    <th>Barcode</th>
                                    <th>Name</th>
                                    <th>Stock</th>
                                    <th>Market Price</th>
                                    <th>Our Price</th>
                                    <th>Cost</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="product-table-body">
                                ${products.map(p => {
            const totalCost = (parseFloat(p.liquidCost || 0) + parseFloat(p.bottleCost || 0) + parseFloat(p.stickerCost || 0) + parseFloat(p.marketingCost || 0) + (parseFloat(p.otherCost || 0))).toFixed(2);
            return `
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="font-mono text-slate-400 text-xs">${p.barcode}</td>
                                        <td class="font-medium text-white">${p.name}</td>
                                        <td>
                                            <span class="px-2 py-1 rounded text-[10px] font-bold ${p.stock < 10 ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}">
                                                ${p.stock}
                                            </span>
                                        </td>
                                        <td class="text-slate-400 line-through text-sm">${p.marketPrice || p.sellingPrice}</td>
                                        <td class="font-bold text-primary">${p.sellingPrice}</td>
                                        <td class="text-xs text-slate-500">${totalCost}</td>
                                        <td>
                                            <button onclick="actions.editProduct(${p.id})" class="text-blue-400 hover:text-blue-300 mr-2"><i class="fa-solid fa-edit"></i></button>
                                            <button onclick="actions.deleteProduct(${p.id})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `}).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    expenses: async () => {
        document.getElementById('page-title').innerText = 'Expense Tracker';
        const [year, month] = state.expenseMonth.split('-');

        const allExpenses = await db.expenses.toArray();
        const expenses = allExpenses.filter(e => {
            const d = new Date(e.date);
            // Handle legacy dates (if any) or standard YYYY-MM-DD
            return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
        }).reverse();

        const content = document.getElementById('app-content');
        content.innerHTML = `
            <div class="flex flex-col h-full gap-6">
                <!-- Top Stats -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div class="glass-card p-6 rounded-2xl flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 text-xl"><i class="fa-solid fa-flask"></i></div>
                        <div>
                            <p class="text-xs text-slate-400 uppercase">Liquids</p>
                            <h3 class="text-xl font-bold text-white">LKR ${expenses.filter(e => e.category === 'Raw Material').reduce((a, b) => a + parseFloat(b.amount || 0), 0).toFixed(2)}</h3>
                        </div>
                    </div>
                     <div class="glass-card p-6 rounded-2xl flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 text-xl"><i class="fa-solid fa-bottle-water"></i></div>
                        <div>
                            <p class="text-xs text-slate-400 uppercase">Bottles</p>
                            <h3 class="text-xl font-bold text-white">LKR ${expenses.filter(e => e.category === 'Bottles').reduce((a, b) => a + parseFloat(b.amount || 0), 0).toFixed(2)}</h3>
                        </div>
                    </div>
                     <div class="glass-card p-6 rounded-2xl flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-xl"><i class="fa-solid fa-print"></i></div>
                        <div>
                            <p class="text-xs text-slate-400 uppercase">Printing</p>
                            <h3 class="text-xl font-bold text-white">LKR ${expenses.filter(e => e.category === 'Printing').reduce((a, b) => a + parseFloat(b.amount || 0), 0).toFixed(2)}</h3>
                        </div>
                    </div>
                    <div class="glass-card p-6 rounded-2xl flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 text-xl"><i class="fa-solid fa-truck"></i></div>
                        <div>
                            <p class="text-xs text-slate-400 uppercase">Transport</p>
                            <h3 class="text-xl font-bold text-white">LKR ${expenses.filter(e => e.category === 'Transport').reduce((a, b) => a + parseFloat(b.amount || 0), 0).toFixed(2)}</h3>
                        </div>
                    </div>
                </div>

                <div class="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-white/10">
                    <div class="flex items-center gap-3">
                         <label class="text-sm text-slate-400">Month:</label>
                         <input type="month" value="${state.expenseMonth}" onchange="actions.changeExpenseMonth(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
                         <button onclick="actions.downloadExpenseReport()" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm ml-2">
                            <i class="fa-solid fa-file-arrow-down"></i> Report
                        </button>
                    </div>
                    <button onclick="actions.openExpenseModal()" class="bg-secondary hover:bg-secondary/90 px-6 py-2 rounded-xl font-medium shadow-lg shadow-secondary/20 flex items-center gap-2">
                        <i class="fa-solid fa-plus"></i> Add Expense
                    </button>
                </div>

                <div class="glass-panel rounded-2xl flex-1 overflow-auto">
                    <table class="table-glass w-full">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Account</th>
                                <th>Amount</th>
                                <th>Invoice</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${expenses.length > 0 ? expenses.map(e => `
                                <tr>
                                    <td class="text-slate-400">${new Date(e.date).toLocaleDateString()}</td>
                                    <td><span class="px-2 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10">${e.category}</span></td>
                                    <td>${e.description}</td>
                                    <td>
                                        <span class="text-[10px] font-bold uppercase ${e.sourceAccount === 'Bank Account' ? 'text-blue-400' : 'text-orange-400'}">
                                            ${e.sourceAccount || 'Cash Box'}
                                        </span>
                                    </td>
                                    <td class="font-bold text-white">${formatCurrency(e.amount)}</td>
                                    <td>
                                        ${e.invoiceImage ? `<button onclick="actions.viewInvoice('${e.id}')" class="text-primary hover:underline text-sm"><i class="fa-solid fa-paperclip"></i> View</button>` : '<span class="text-slate-600">-</span>'}
                                    </td>
                                    <td>
                                        <button onclick="actions.deleteExpense(${e.id})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" class="text-center p-8 text-slate-500">No expenses found for this month</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
         `;
    },

    customers: async () => {
        document.getElementById('page-title').innerText = 'Customer Loyalty';
        const customers = await db.customers.toArray();
        const content = document.getElementById('app-content');

        content.innerHTML = `
            <div class="flex flex-col h-full gap-6">
                <div class="flex justify-end">
                    <button onclick="actions.openCustomerModal()" class="bg-primary px-6 py-2 rounded-xl font-medium shadow-lg flex items-center gap-2">
                        <i class="fa-solid fa-user-plus"></i> New Customer
                    </button>
                </div>

                <div class="glass-panel rounded-2xl flex-1 overflow-auto">
                    <table class="table-glass w-full">
                        <thead>
                            <tr>
                                <th>Phone</th>
                                <th>Name</th>
                                <th>Address</th>
                                <th>Points</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${customers.map(c => `
                                <tr>
                                    <td class="font-mono text-primary">${c.phone}</td>
                                    <td class="font-medium">${c.name}</td>
                                    <td class="text-slate-400">${c.address}</td>
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <i class="fa-solid fa-star text-yellow-500"></i>
                                            <span class="font-bold text-lg">${c.points || 0}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button onclick="actions.deleteCustomer(${c.id})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    reports: async () => {
        document.getElementById('page-title').innerText = 'Sales Reports';

        // Filter by month
        const [year, month] = state.reportMonth.split('-');

        const allSales = await db.sales.toArray();
        const sales = allSales.filter(s => {
            const d = new Date(s.date);
            return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
        }).reverse();

        const totalSales = sales.reduce((acc, curr) => acc + curr.total, 0);
        const totalProfit = sales.reduce((acc, curr) => acc + (curr.profit || 0), 0);

        const content = document.getElementById('app-content');
        content.innerHTML = `
             <div class="flex flex-col gap-6">
                <div class="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-white/10">
                    <h3 class="font-bold text-lg">Monthly Report</h3>
                    <div class="flex items-center gap-3">
                        <label class="text-sm text-slate-400">Select Month:</label>
                        <input type="month" value="${state.reportMonth}" onchange="actions.changeReportMonth(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
                        <button onclick="actions.downloadMonthlyReport()" class="bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm ml-2">
                            <i class="fa-solid fa-file-arrow-down"></i> Download PDF
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="glass-card p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-transparent border-primary/20">
                        <p class="text-sm text-primary font-bold uppercase tracking-wider mb-2">Total Revenue (${state.reportMonth})</p>
                        <h2 class="text-4xl font-bold text-white">${formatCurrency(totalSales)}</h2>
                    </div>
                     <div class="glass-card p-6 rounded-2xl bg-gradient-to-br from-green-500/20 to-transparent border-green-500/20">
                        <p class="text-sm text-green-400 font-bold uppercase tracking-wider mb-2">Total Profit (${state.reportMonth})</p>
                        <h2 class="text-4xl font-bold text-white">${formatCurrency(totalProfit)}</h2>
                    </div>
                </div>
                
                <div class="glass-panel rounded-2xl p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold">Sales History</h3>
                        <span class="text-xs text-slate-500">${sales.length} transactions</span>
                    </div>
                     <div class="overflow-auto max-h-[500px]">
                        <table class="table-glass w-full">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Invoice #</th>
                                    <th>Customer</th>
                                    <th>Items</th>
                                    <th>Method</th>
                                    <th>Total</th>
                                    <th>Profit</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sales.length > 0 ? sales.map(s => `
                                    <tr>
                                        <td class="text-slate-400">${new Date(s.date).toLocaleString()}</td>
                                        <td class="font-mono text-xs">#${s.id}</td>
                                        <td>${s.customerPhone || 'Walk-in'}</td>
                                        <td>${s.items.length}</td>
                                        <td>
                                            <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase ${s.paymentMethod === 'bank' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}">
                                                ${s.paymentMethod || 'cash'}
                                            </span>
                                        </td>
                                        <td class="font-bold">${formatCurrency(s.total)}</td>
                                        <td class="text-green-400">+${formatCurrency(s.profit || 0)}</td>
                                        <td>
                                            <button onclick="actions.printBill(${s.id})" class="text-slate-300 hover:text-white mr-2" title="Print 80mm"><i class="fa-solid fa-print"></i></button>
                                            <button onclick="actions.downloadInvoice(${s.id})" class="text-primary hover:text-primary-400 mr-2" title="Download A4"><i class="fa-solid fa-file-pdf"></i></button>
                                            <button onclick="actions.openEditSaleModal(${s.id})" class="text-blue-400 hover:text-blue-300 mr-2" title="Edit"><i class="fa-solid fa-edit"></i></button>
                                            <button onclick="actions.deleteSale(${s.id})" class="text-red-400 hover:text-red-300" title="Delete"><i class="fa-solid fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="7" class="text-center p-8 text-slate-500">No sales found for this month</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Database Management Section -->
            <div class="glass-panel rounded-2xl p-6 border-t-4 border-slate-700">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h3 class="text-lg font-bold flex items-center gap-2 text-white">
                            <i class="fa-solid fa-database text-slate-400"></i> Database Management
                        </h3>
                        <p class="text-xs text-slate-500">Auto-backup scheduled for 5:00 PM daily. Manual backup recommended before clear cache.</p>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="actions.exportDatabase()" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 text-sm text-white">
                            <i class="fa-solid fa-download"></i> Export JSON
                        </button>
                        <div class="relative">
                            <input type="file" id="db-import-input" class="hidden" onchange="actions.importDatabase(this.files[0])" accept=".json">
                            <button onclick="document.getElementById('db-import-input').click()" class="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-xl font-bold transition-all border border-primary/30 flex items-center gap-2 text-sm">
                                <i class="fa-solid fa-upload"></i> Restore
                            </button>
                        </div>
                    </div>
                </div>
            </div>
         </div>
    `;
    },

    sales: async () => {
        document.getElementById('page-title').innerText = 'Bill History';
        const [year, month] = state.reportMonth.split('-');

        const allSales = await db.sales.toArray();
        const sales = allSales.filter(s => {
            const d = new Date(s.date);
            return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
        }).reverse();

        const content = document.getElementById('app-content');
        content.innerHTML = `
             <div class="flex flex-col gap-6 h-full">
                <div class="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-white/10">
                    <div class="flex items-center gap-3">
                        <label class="text-sm text-slate-400">Filter Month:</label>
                        <input type="month" value="${state.reportMonth}" onchange="actions.changeSalesMonth(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
                    </div>
                        <div class="relative flex-1">
                            <input type="text" placeholder="Search Invoice # or Customer..." class="bg-white/5 border border-white/10 rounded-xl px-10 py-2 w-full focus:border-primary" oninput="actions.filterSalesTable(this.value)">
                            <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        </div>
                        <div class="flex items-center gap-2">
                            <select id="filter-pay-method" onchange="actions.filterSalesTable(document.querySelector('input[placeholder*=\\'Search Invoice\\']').value)" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs">
                                <option value="">All Methods</option>
                                <option value="cash">Cash Only</option>
                                <option value="bank">Bank Only</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="glass-panel rounded-2xl flex-1 overflow-hidden flex flex-col">
                     <div class="overflow-auto flex-1">
                        <table class="table-glass w-full">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Invoice #</th>
                                    <th>Customer</th>
                                    <th>Items</th>
                                    <th>Method</th>
                                    <th>Total</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="sales-table-body">
                                ${sales.length > 0 ? sales.map(s => `
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="text-slate-400 text-sm">${new Date(s.date).toLocaleString()}</td>
                                        <td class="font-mono text-xs font-bold text-primary">#${s.id}</td>
                                        <td>
                                            <div class="flex flex-col">
                                                <span class="font-medium">${s.customerPhone || 'Walk-in'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="px-2 py-1 rounded-full bg-slate-700 text-[10px] font-bold uppercase">
                                                ${s.items.length} Units
                                            </span>
                                        </td>
                                        <td class="font-bold text-white">${formatCurrency(s.total)}</td>
                                        <td>
                                            <div class="flex gap-2">
                                                <button onclick="actions.printBill(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors" title="Print"><i class="fa-solid fa-print"></i></button>
                                                <button onclick="actions.shareOnWhatsApp(${s.id})" class="p-2 hover:bg-green-600/20 rounded-lg text-green-500 transition-colors" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                                                <button onclick="actions.downloadInvoice(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-primary transition-colors" title="Download"><i class="fa-solid fa-file-pdf"></i></button>
                                                <button onclick="actions.openEditSaleModal(${s.id})" class="p-2 hover:bg-blue-600/20 rounded-lg text-blue-400 transition-colors" title="Edit"><i class="fa-solid fa-edit"></i></button>
                                                <button onclick="actions.deleteSale(${s.id})" class="p-2 hover:bg-red-600/20 rounded-lg text-red-500 transition-colors" title="Delete"><i class="fa-solid fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" class="text-center p-8 text-slate-500">No bills found for this month</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>
        `;
    },

    deliveries: async () => {
        document.getElementById('page-title').innerText = 'Delivery Orders';
        const [year, month] = state.reportMonth.split('-');

        const allSales = await db.sales.toArray();
        const deliveries = allSales.filter(s => {
            const d = new Date(s.date);
            const isThisMonth = d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
            return isThisMonth && (parseFloat(s.delivery || 0) > 0);
        }).reverse();

        const content = document.getElementById('app-content');
        content.innerHTML = `
             <div class="flex flex-col gap-6 h-full">
                <div class="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-white/10">
                    <div class="flex items-center gap-3">
                        <label class="text-sm text-slate-400">Filter Month:</label>
                        <input type="month" value="${state.reportMonth}" onchange="actions.changeDeliveriesMonth(this.value)" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
                    </div>
                    <div class="relative">
                        <input type="text" placeholder="Search Tracking/Recipient..." class="bg-white/5 border border-white/10 rounded-xl px-10 py-2 w-72 focus:border-primary" oninput="actions.filterDeliveriesTable(this.value)">
                        <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="glass-card p-4 rounded-2xl border-l-4 border-primary">
                        <p class="text-xs text-slate-400 uppercase font-bold">Total Deliveries</p>
                        <h3 class="text-2xl font-bold">${deliveries.length}</h3>
                    </div>
                    <div class="glass-card p-4 rounded-2xl border-l-4 border-green-500">
                        <p class="text-xs text-slate-400 uppercase font-bold">Delivery Revenue</p>
                        <h3 class="text-2xl font-bold">${formatCurrency(deliveries.reduce((a, b) => a + (parseFloat(b.delivery || 0)), 0))}</h3>
                    </div>
                    <div class="glass-card p-4 rounded-2xl border-l-4 border-blue-500">
                        <p class="text-xs text-slate-400 uppercase font-bold">Pending Tracking</p>
                        <h3 class="text-2xl font-bold">${deliveries.filter(d => !d.trackingNumber).length} Orders</h3>
                    </div>
                </div>
                
                <div class="glass-panel rounded-2xl flex-1 overflow-hidden flex flex-col">
                     <div class="overflow-auto flex-1">
                        <table class="table-glass w-full">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Recipient</th>
                                    <th>Tracking #</th>
                                    <th>Delivery Fee</th>
                                    <th>Total Bill</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="deliveries-table-body">
                                ${deliveries.length > 0 ? deliveries.map(s => `
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="text-slate-400 text-sm">${new Date(s.date).toLocaleDateString()}</td>
                                        <td>
                                            <div class="flex flex-col">
                                                <span class="font-bold text-white">${s.deliveryName || 'N/A'}</span>
                                                <span class="text-[10px] text-slate-400 truncate max-w-[200px]">${s.deliveryAddress || 'No Address'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="font-mono text-xs ${s.trackingNumber ? 'text-primary' : 'text-slate-600 italic'}">
                                                ${s.trackingNumber || 'Not assigned'}
                                            </span>
                                        </td>
                                        <td class="font-medium text-green-400">${formatCurrency(s.delivery)}</td>
                                        <td class="font-bold text-white">${formatCurrency(s.total)}</td>
                                        <td>
                                            <div class="flex gap-2">
                                                <button onclick="actions.printBill(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors" title="Print"><i class="fa-solid fa-print"></i></button>
                                                <button onclick="actions.shareOnWhatsApp(${s.id})" class="p-2 hover:bg-green-600/20 rounded-lg text-green-500 transition-colors" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                                                <button onclick="actions.downloadInvoice(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-primary transition-colors" title="Download"><i class="fa-solid fa-file-pdf"></i></button>
                                                <button onclick="actions.openEditSaleModal(${s.id})" class="p-2 hover:bg-blue-600/20 rounded-lg text-blue-400 transition-colors" title="Edit/Add Tracking"><i class="fa-solid fa-edit"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" class="text-center p-8 text-slate-500">No delivery orders found for this month</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>
        `;
    },

    backup: async () => {
        document.getElementById('page-title').innerText = 'Database & Backup';
        const lastAuto = localStorage.getItem('lastAutoBackup') || 'Never';
        const content = document.getElementById('app-content');

        content.innerHTML = `
            <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
                <!-- Header Card -->
                <div class="glass-panel p-8 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 relative overflow-hidden">
                    <div class="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div class="text-center md:text-left">
                            <h2 class="text-3xl font-bold text-white mb-2">Data Protection</h2>
                            <p class="text-slate-400 max-w-md">Secure your business data by creating regular backups. You can restore your entire POS system from a backup file at any time.</p>
                        </div>
                        <div class="bg-primary/10 p-6 rounded-2xl border border-primary/20 flex flex-col items-center">
                            <i class="fa-solid fa-clock-rotate-left text-3xl text-primary mb-2"></i>
                            <p class="text-[10px] text-slate-500 uppercase font-extrabold tracking-widest">Last Auto-Backup</p>
                            <p class="text-xl font-bold text-white">${lastAuto}</p>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Export Card -->
                    <div class="glass-panel p-8 rounded-3xl border border-white/10 hover:border-primary/30 transition-all group flex flex-col h-full">
                        <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <i class="fa-solid fa-file-export text-3xl text-primary"></i>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-3">Backup Data</h3>
                        <p class="text-sm text-slate-400 mb-8 flex-1">Create a snapshot of all your products, sales, expenses, and customer records. This file will be saved to your computer.</p>
                        <button onclick="actions.exportDatabase()" class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2">
                            <i class="fa-solid fa-download"></i> Download Backup (JSON)
                        </button>
                    </div>

                    <!-- Import Card -->
                    <div class="glass-panel p-8 rounded-3xl border border-white/10 hover:border-green-500/30 transition-all group flex flex-col h-full">
                        <div class="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <i class="fa-solid fa-file-import text-3xl text-green-500"></i>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-3">Restore Data</h3>
                        <p class="text-sm text-slate-400 mb-8 flex-1">Recover your data from a previously saved JSON backup file. <span class="text-red-400 font-bold">Caution: This will replace all current data.</span></p>
                        <div class="relative">
                            <input type="file" id="db-restore-file" class="hidden" onchange="actions.importDatabase(this.files[0])" accept=".json">
                            <button onclick="document.getElementById('db-restore-file').click()" class="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-green-900/20 transition-all flex items-center justify-center gap-2">
                                <i class="fa-solid fa-upload"></i> Upload & Restore
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Info Box -->
                <div class="bg-blue-500/5 border border-blue-500/20 p-6 rounded-2xl flex items-start gap-4">
                    <i class="fa-solid fa-circle-info text-blue-400 mt-1"></i>
                    <div>
                        <p class="text-sm text-blue-200/80 leading-relaxed italic">
                            Your data is stored locally in this browser. To prevent data loss when switching computers or clearing browser history, we recommend downloading a backup at the end of each business day.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    inventory: async () => {
        router.navigate('products');
    },

    accounts: async () => {
        document.getElementById('page-title').innerText = 'Account Management';
        const accounts = await db.accounts.toArray();
        const content = document.getElementById('app-content');

        content.innerHTML = `
            <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
                <div class="glass-panel p-8 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10">
                    <h2 class="text-3xl font-bold text-white mb-6">Cash & Bank Balances</h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${accounts.map(acc => `
                            <div class="glass-card p-6 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-2xl">
                                        <i class="fa-solid ${acc.name === 'Cash Box' ? 'fa-wallet' : 'fa-building-columns'}"></i>
                                    </div>
                                    <button onclick="actions.openEditAccountModal(${acc.id})" class="text-slate-400 hover:text-white transition-colors">
                                        <i class="fa-solid fa-pen-to-square"></i> Edit
                                    </button>
                                </div>
                                <p class="text-sm text-slate-400 uppercase font-bold tracking-wider">${acc.name}</p>
                                <h3 class="text-3xl font-bold text-white mt-1">${formatCurrency(acc.balance)}</h3>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="bg-primary/5 border border-primary/20 p-6 rounded-2xl flex items-start gap-4">
                    <i class="fa-solid fa-circle-info text-primary mt-1"></i>
                    <div>
                        <p class="text-sm text-slate-300 leading-relaxed">
                            These balances are updated automatically when you complete a sale. Use the <strong>Edit</strong> button to set your initial cash box amount or adjust the balance manually.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
};

// --- Actions ---
const actions = {
    downloadMonthlyReport: async () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Filter Data
        const [year, month] = state.reportMonth.split('-');
        const allSales = await db.sales.toArray();
        const sales = allSales.filter(s => {
            const d = new Date(s.date);
            return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
        });

        const totalRevenue = sales.reduce((a, c) => a + c.total, 0);
        const totalProfit = sales.reduce((a, c) => a + (c.profit || 0), 0);

        // Header
        doc.setFontSize(22);
        doc.setTextColor(99, 102, 241);
        doc.text('CHEMIGO - Monthly Report', 14, 20);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Month: ${state.reportMonth}`, 14, 30);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);

        // Summary Cards
        doc.setDrawColor(200);
        doc.setFillColor(245, 247, 255);
        doc.roundedRect(14, 45, 85, 25, 3, 3, 'FD');
        doc.roundedRect(105, 45, 85, 25, 3, 3, 'FD');

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Total Revenue", 20, 53);
        doc.text("Total Profit", 111, 53);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0);
        doc.text(`${totalRevenue.toFixed(2)} LKR`, 20, 63);
        doc.setTextColor(34, 197, 94); // Green
        doc.text(`${totalProfit.toFixed(2)} LKR`, 111, 63);

        // Table
        const tableColumn = ["Date", "Invoice #", "Customer", "Items", "Total (LKR)", "Profit (LKR)"];
        const tableRows = sales.map(s => [
            new Date(s.date).toLocaleDateString(),
            `#${s.id}`,
            s.customerPhone || 'Walk-in',
            s.items.length,
            s.total.toFixed(2),
            (s.profit || 0).toFixed(2)
        ]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 80,
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241] },
            styles: { fontSize: 9 },
            columnStyles: {
                4: { fontStyle: 'bold', halign: 'right' },
                5: { textColor: [34, 197, 94], halign: 'right' }
            }
        });

        doc.save(`Monthly_Report_${state.reportMonth}.pdf`);
    },

    // --- Product Actions ---
    loadProductsToGrid: async (search = '') => {
        let products = await db.products.toArray();
        if (search) {
            const lowerSearch = search.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(lowerSearch) ||
                p.barcode.includes(search)
            );
        }

        const grid = document.getElementById('product-grid');
        if (!grid) return;

        grid.innerHTML = products.map(p => `
            <div class="glass-card p-4 rounded-xl flex flex-col gap-2 cursor-pointer hover:bg-white/10 active:scale-95 transition-all" onclick="actions.addToCart(${p.id})">
                <div class="bg-slate-700 h-24 rounded-lg mb-2 flex items-center justify-center text-slate-500">
                    <i class="fa-solid fa-bottle-droplet text-3xl"></i>
                </div>
                <h4 class="font-bold text-sm truncate" title="${p.name}">${p.name}</h4>
                <div class="flex justify-between items-end text-xs">
                    <span class="text-slate-400">${p.stock} in stock</span>
                    <div class="flex flex-col items-end">
                        ${p.marketPrice && p.marketPrice > p.sellingPrice ? `<span class="text-[10px] text-slate-500 line-through">LKR ${p.marketPrice.toFixed(2)}</span>` : ''}
                        <span class="font-bold text-primary text-sm">${p.sellingPrice.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    openProductModal: (product = null) => {
        state.editingProduct = product;
        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');

        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        content.innerHTML = `
            <div class="p-6">
                <h2 class="text-2xl font-bold mb-6 border-b border-white/10 pb-4">${product ? 'Edit Product' : 'Add New Product'}</h2>
                <form id="product-form" onsubmit="event.preventDefault(); actions.saveProduct();" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Product Name</label>
                        <input type="text" id="p-name" value="${product?.name || ''}" class="w-full p-3 rounded-xl" required>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Barcode</label>
                        <div class="flex gap-2">
                             <input type="text" id="p-barcode" value="${product?.barcode || ''}" class="w-full p-3 rounded-xl" required>
                             <button type="button" onclick="actions.scanForInput('p-barcode')" class="p-3 bg-slate-700 rounded-xl"><i class="fa-solid fa-camera"></i></button>
                        </div>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Stock Level</label>
                        <input type="number" id="p-stock" value="${product?.stock || 0}" class="w-full p-3 rounded-xl" required>
                    </div>
                    <div>
                         <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Market Price (වෙළඳපල මිල)</label>
                         <input type="number" id="p-market-price" value="${product?.marketPrice || ''}" class="w-full p-3 rounded-xl text-slate-400 font-bold" placeholder="Market Price">
                    </div>
                    <div>
                         <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Our Price (අපේ මිල)</label>
                         <input type="number" id="p-price" value="${product?.sellingPrice || ''}" class="w-full p-3 rounded-xl text-primary font-bold" required>
                    </div>
                    <div>
                         <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Default Discount</label>
                         <input type="number" id="p-discount" value="${product?.defaultDiscount || 0}" class="w-full p-3 rounded-xl text-green-400 font-bold" placeholder="0.00">
                    </div>
                    <div>
                         <label class="text-xs text-slate-400 uppercase font-bold mb-1 block">Weight (kg)</label>
                         <input type="number" id="p-weight" step="0.001" value="${product?.weight || 0}" class="w-full p-3 rounded-xl text-blue-400 font-bold" placeholder="0.000">
                    </div>
                    
                    <div class="col-span-2 mt-4">
                        <h4 class="text-sm font-bold text-slate-300 mb-3 border-b border-white/10 pb-1">Cost Breakdown</h4>
                    </div>
                    
                    <div><label class="text-xs text-slate-500">Liquid Cost</label><input type="number" id="c-liquid" value="${product?.liquidCost || 0}" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700"></div>
                    <div><label class="text-xs text-slate-500">Bottle Cost</label><input type="number" id="c-bottle" value="${product?.bottleCost || 0}" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700"></div>
                    <div><label class="text-xs text-slate-500">Label Cost</label><input type="number" id="c-label" value="${product?.stickerCost || 0}" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700"></div>
                    <div><label class="text-xs text-slate-500">Marketing</label><input type="number" id="c-marketing" value="${product?.marketingCost || 0}" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700"></div>
                    <div class="col-span-2 flex gap-2 items-end">
                        <div class="flex-1">
                            <label class="text-xs text-slate-500">Other Cost Amount</label>
                            <input type="number" id="c-other" value="${product?.otherCost || 0}" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700">
                        </div>
                        <div class="flex-[2]">
                            <label class="text-xs text-slate-500">Other Cost Description</label>
                            <input type="text" id="c-other-desc" value="${product?.otherCostDesc || ''}" placeholder="e.g. Labor, Packaging" class="w-full p-2 rounded-lg text-sm bg-slate-900 border border-slate-700">
                        </div>
                    </div>

                    <div class="col-span-2 flex justify-end gap-3 mt-6 border-t border-white/10 pt-4">
                        <button type="button" onclick="actions.closeModal()" class="px-6 py-2 rounded-xl hover:bg-white/5 transition-colors">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-primary rounded-xl font-bold shadow-lg shadow-primary/20">Save Product</button>
                    </div>
                </form>
            </div>
        `;
    },

    openQuickAddModal: () => {
        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');

        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        const tempBarcode = 'QB-' + Date.now();

        content.innerHTML = `
            <div class="p-6">
                 <h2 class="text-xl font-bold mb-4 text-green-400"><i class="fa-solid fa-bolt"></i> Quick Add Product</h2>
                 <form onsubmit="event.preventDefault(); actions.saveQuickProduct();" class="flex flex-col gap-4">
                     <div>
                        <label class="text-sm">Product Name</label>
                        <input type="text" id="qa-name" class="w-full p-3 rounded-xl focus:border-green-500" required autofocus>
                     </div>
                     <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="text-sm">Price</label>
                            <input type="number" id="qa-price" class="w-full p-3 rounded-xl font-bold text-lg" required>
                        </div>
                        <div class="flex-1">
                            <label class="text-sm">Barcode (Optional)</label>
                            <input type="text" id="qa-barcode" value="${tempBarcode}" class="w-full p-3 rounded-xl text-slate-400">
                        </div>
                     </div>
                      <div class="flex justify-end gap-3 mt-4">
                        <button type="button" onclick="actions.closeModal()" class="px-4 py-2 rounded-lg hover:bg-white/5">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-green-600 rounded-lg font-bold">Add & Sell</button>
                    </div>
                 </form>
            </div>
         `;
    },

    saveProduct: async () => {
        const product = {
            name: document.getElementById('p-name').value,
            barcode: document.getElementById('p-barcode').value,
            stock: parseInt(document.getElementById('p-stock').value),
            sellingPrice: parseFloat(document.getElementById('p-price').value),
            marketPrice: parseFloat(document.getElementById('p-market-price').value || document.getElementById('p-price').value),
            defaultDiscount: parseFloat(document.getElementById('p-discount').value || 0),
            liquidCost: parseFloat(document.getElementById('c-liquid').value),
            bottleCost: parseFloat(document.getElementById('c-bottle').value),
            stickerCost: parseFloat(document.getElementById('c-label').value),
            marketingCost: parseFloat(document.getElementById('c-marketing').value),
            otherCost: parseFloat(document.getElementById('c-other').value),
            otherCostDesc: document.getElementById('c-other-desc').value,
            weight: parseFloat(document.getElementById('p-weight').value || 0),
        };

        if (state.editingProduct) {
            await db.products.update(state.editingProduct.id, product);
            showToast('Product updated!');
        } else {
            await db.products.add(product);
            showToast('Product added successfully!');
        }

        actions.closeModal();
        if (state.currentView === 'products') views.products();
        if (state.currentView === 'pos') actions.loadProductsToGrid();
    },

    saveQuickProduct: async () => {
        const product = {
            name: document.getElementById('qa-name').value,
            barcode: document.getElementById('qa-barcode').value,
            stock: 100, // Default stock for quick add
            sellingPrice: parseFloat(document.getElementById('qa-price').value),
            marketPrice: parseFloat(document.getElementById('qa-price').value),
            defaultDiscount: 0,
            // Default 0 costs
            liquidCost: 0, bottleCost: 0, stickerCost: 0, marketingCost: 0, otherCost: 0, otherCostDesc: ''
        };

        const id = await db.products.add(product);
        actions.closeModal();
        actions.addToCart(id);
        showToast('Item Added to Cart');
        actions.loadProductsToGrid();
    },

    deleteProduct: async (id) => {
        if (confirm('Are you sure?')) {
            await db.products.delete(id);
            if (state.currentView === 'products') views.products();
        }
    },

    editProduct: async (id) => {
        const p = await db.products.get(id);
        actions.openProductModal(p);
    },

    // --- POS Actions ---
    scanBarcode: async (barcode) => {
        const product = await db.products.where('barcode').equals(barcode).first();
        if (product) {
            actions.addToCart(product.id);
            showToast(`Added ${product.name}`);
        } else {
            // Suggest quick add if not found?
            if (confirm('Product not found! Quick Add?')) {
                actions.openQuickAddModal();
                // Pre-fill barcode if we could pass it, but simple is fine
            }
        }
    },

    addToCart: async (productId) => {
        const product = await db.products.get(productId);
        if (!product) return;

        const existingItem = state.cart.find(item => item.product.id === productId);

        if (existingItem) {
            existingItem.qty++;
            existingItem.discount = (existingItem.unitDiscount || 0) * existingItem.qty;
        } else {
            const unitDiscount = parseFloat(product.defaultDiscount || 0);
            state.cart.push({
                product,
                qty: 1,
                unitDiscount: unitDiscount,
                discount: unitDiscount
            });
        }
        actions.renderCart();
    },

    removeFromCart: (index) => {
        state.cart.splice(index, 1);
        actions.renderCart();
    },

    updateCartQty: (index, change) => {
        if (state.cart[index].qty + change > 0) {
            state.cart[index].qty += change;
            state.cart[index].discount = (state.cart[index].unitDiscount || 0) * state.cart[index].qty;
            actions.renderCart();
        }
    },

    updateItemDiscount: (index, val) => {
        const newDiscount = parseFloat(val) || 0;
        state.cart[index].discount = newDiscount;
        if (state.cart[index].qty > 0) {
            state.cart[index].unitDiscount = newDiscount / state.cart[index].qty;
        }
        actions.renderCart();
    },

    renderCart: () => {
        const container = document.getElementById('cart-items');
        const countBadge = document.getElementById('cart-count');

        if (state.cart.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                    <i class="fa-solid fa-basket-shopping text-6xl opacity-20"></i>
                    <p>Cart is empty</p>
                </div>
            `;
            countBadge.innerText = '0 Items';
            actions.updateCartTotals();
            return;
        }

        container.innerHTML = state.cart.map((item, index) => `
            <div class="bg-slate-800 p-3 rounded-xl flex flex-col gap-2 border border-white/5 animate-slide-in">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-sm text-white">${item.product.name}</h4>
                    <button onclick="actions.removeFromCart(${index})" class="text-slate-500 hover:text-red-400"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="flex justify-between items-center mt-1">
                    <div class="flex items-center gap-2 bg-slate-900 rounded-lg p-1">
                        <button onclick="actions.updateCartQty(${index}, -1)" class="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white">-</button>
                        <span class="text-sm font-bold w-4 text-center">${item.qty}</span>
                        <button onclick="actions.updateCartQty(${index}, 1)" class="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white">+</button>
                    </div>
                    <div class="text-right">
                        <div class="text-primary font-bold">${(item.product.sellingPrice * item.qty).toFixed(2)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <span>Discount:</span>
                    <input type="number" value="${item.discount}" onchange="actions.updateItemDiscount(${index}, this.value)" class="w-16 bg-slate-900 border-none rounded text-right p-1 text-green-400 focus:ring-1 focus:ring-green-500">
                </div>
            </div>
        `).join('');

        const totalItems = state.cart.reduce((a, c) => a + c.qty, 0);
        countBadge.innerText = `${totalItems} Items`;
        const mobileBadge = document.getElementById('mobile-cart-count');
        if (mobileBadge) mobileBadge.innerText = totalItems;
        actions.updateCartTotals();
    },

    updateCartTotals: () => {
        const subtotal = state.cart.reduce((acc, item) => acc + (item.product.sellingPrice * item.qty), 0);
        const itemDiscounts = state.cart.reduce((acc, item) => acc + (item.discount || 0), 0);
        const billDiscount = parseFloat(document.getElementById('cart-bill-discount')?.value || 0);
        const totalWeight = state.cart.reduce((acc, item) => acc + ((item.product.weight || 0) * item.qty), 0);

        let delivery = parseFloat(document.getElementById('cart-delivery')?.value || 0);
        const isAuto = document.getElementById('auto-delivery')?.checked;

        if (isAuto && totalWeight > 0) {
            // First 1kg = 350, then +80 per additional 1kg (or part thereof)
            delivery = 350;
            if (totalWeight > 1) {
                const additionalWeight = Math.ceil(totalWeight - 1);
                delivery += additionalWeight * 80;
            }
            if (document.getElementById('cart-delivery')) {
                document.getElementById('cart-delivery').value = delivery;
                actions.toggleDeliveryDetails(delivery);
            }
        }

        const total = subtotal - itemDiscounts - billDiscount + delivery;

        if (document.getElementById('cart-subtotal')) {
            document.getElementById('cart-subtotal').innerText = formatCurrency(subtotal);
            document.getElementById('cart-discount').innerText = formatCurrency(itemDiscounts);
            document.getElementById('cart-total').innerText = formatCurrency(total);

            const weightDisplay = document.getElementById('weight-display');
            const weightSpan = document.getElementById('cart-total-weight');
            if (weightDisplay && weightSpan) {
                if (totalWeight > 0) {
                    weightDisplay.classList.remove('hidden');
                    weightSpan.innerText = `${totalWeight.toFixed(3)} kg`;
                } else {
                    weightDisplay.classList.add('hidden');
                }
            }

            // Real-time Profit Calculation (excluding delivery)
            let totalCost = 0;
            state.cart.forEach(item => {
                const p = item.product;
                const unitCost = (p.liquidCost || 0) + (p.bottleCost || 0) + (p.stickerCost || 0) + (p.marketingCost || 0) + (p.otherCost || 0);
                totalCost += unitCost * item.qty;
            });
            const profitEstimate = (subtotal - itemDiscounts - billDiscount) - totalCost;

            const profitSpan = document.getElementById('cart-profit-estimate');
            if (profitSpan) {
                profitSpan.innerText = formatCurrency(profitEstimate);
            }
        }
        return { subtotal, itemDiscounts, billDiscount, delivery, total, totalWeight };
    },

    checkout: async () => {
        if (state.cart.length === 0) return showToast('Cart is empty', 'error');

        const totals = actions.updateCartTotals();
        const customerId = document.getElementById('cart-customer').value;

        let totalCost = 0;
        state.cart.forEach(item => {
            const p = item.product;
            const unitCost = (p.liquidCost || 0) + (p.bottleCost || 0) + (p.stickerCost || 0) + (p.marketingCost || 0) + (p.otherCost || 0);
            totalCost += unitCost * item.qty;
        });

        // Profit calculation: (Subtotal - Discounts) - Total Cost. Delivery charge is NOT considered.
        const profit = (totals.subtotal - totals.itemDiscounts - totals.billDiscount) - totalCost;

        const customer = customerId ? await db.customers.get(parseInt(customerId)) : null;

        const sale = {
            date: new Date(),
            items: state.cart,
            subtotal: totals.subtotal,
            discount: totals.itemDiscounts,
            billDiscount: totals.billDiscount,
            delivery: totals.delivery,
            total: totals.total,
            totalWeight: totals.totalWeight,
            profit: profit,
            customerPhone: customer ? customer.phone : null,
            customerId: customer ? customer.id : null,
            deliveryName: document.getElementById('delivery-name')?.value || null,
            deliveryAddress: document.getElementById('delivery-address')?.value || null,
            trackingNumber: document.getElementById('delivery-tracking')?.value || null,
            paymentMethod: state.paymentMethod,
            cashGiven: state.paymentMethod === 'cash' ? parseFloat(document.getElementById('cash-given').value || 0) : null,
            cashBalance: state.paymentMethod === 'cash' ? Math.max(0, parseFloat(document.getElementById('cash-given').value || 0) - totals.total) : null
        };

        const saleId = await db.sales.add(sale);

        for (const item of state.cart) {
            const p = await db.products.get(item.product.id);
            if (p) {
                await db.products.update(p.id, { stock: p.stock - item.qty });
            }
        }

        if (customer) {
            const pointsEarned = Math.floor(totals.total / 100);
            await db.customers.update(customer.id, { points: (customer.points || 0) + pointsEarned });
            showToast(`Added ${pointsEarned} loyalty points!`);
        }

        // Update Account Balance
        const accountName = state.paymentMethod === 'cash' ? 'Cash Box' : 'Bank Account';
        const account = await db.accounts.where('name').equals(accountName).first();
        if (account) {
            await db.accounts.update(account.id, { balance: (parseFloat(account.balance) || 0) + totals.total });
        }

        state.cart = [];
        actions.renderCart();
        actions.setPaymentMethod('cash');
        if (document.getElementById('cash-given')) document.getElementById('cash-given').value = '';
        if (document.getElementById('cash-balance')) document.getElementById('cash-balance').innerText = '0.00 LKR';

        const deliveryInput = document.getElementById('cart-delivery');
        if (deliveryInput) deliveryInput.value = 0;
        actions.toggleDeliveryDetails(0);

        if (document.getElementById('delivery-name')) document.getElementById('delivery-name').value = '';
        if (document.getElementById('delivery-address')) document.getElementById('delivery-address').value = '';
        if (document.getElementById('delivery-tracking')) document.getElementById('delivery-tracking').value = '';

        if (document.getElementById('cart-bill-discount')) document.getElementById('cart-bill-discount').value = 0;

        if (document.getElementById('cart-bill-discount')) document.getElementById('cart-bill-discount').value = 0;

        // Open a custom choice modal or handle sequentially
        // Browsers block window.open if it happens too long after a gesture
        const printConfirm = confirm('Sale Complete! Print Receipt?');
        if (printConfirm) {
            await actions.printBill(saleId);
        }

        if (confirm('Send Invoice via WhatsApp?')) {
            actions.shareOnWhatsApp(saleId);
        } else if (!printConfirm) {
            showToast('Sale saved successfully');
        }
    },

    setPaymentMethod: (method) => {
        state.paymentMethod = method;
        document.querySelectorAll('.pay-method-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-primary/20', 'text-primary', 'border-primary/50');
            btn.classList.add('bg-slate-900', 'text-slate-400', 'border-slate-700');
        });

        const activeBtn = document.getElementById(`btn-pay-${method}`);
        activeBtn.classList.add('active', 'bg-primary/20', 'text-primary', 'border-primary/50');
        activeBtn.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-700');

        const cashSection = document.getElementById('cash-calculation-section');
        if (method === 'cash') {
            cashSection.classList.remove('hidden');
        } else {
            cashSection.classList.add('hidden');
        }
    },

    calculateChange: () => {
        const totals = actions.updateCartTotals();
        const cashGiven = parseFloat(document.getElementById('cash-given').value || 0);
        const change = cashGiven - totals.total;

        const balanceDisplay = document.getElementById('cash-balance');
        balanceDisplay.innerText = formatCurrency(Math.max(0, change));

        if (change < 0 && cashGiven > 0) {
            balanceDisplay.classList.add('text-red-400');
            balanceDisplay.classList.remove('text-green-400');
        } else {
            balanceDisplay.classList.remove('text-red-400');
            balanceDisplay.classList.add('text-green-400');
        }
    },

    openEditAccountModal: async (id) => {
        const acc = await db.accounts.get(id);
        if (!acc) return;

        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');

        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        content.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <h2 class="text-2xl font-bold">Edit ${acc.name}</h2>
                    <button onclick="actions.closeModal()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-times text-xl"></i></button>
                </div>
                
                <form onsubmit="event.preventDefault(); actions.updateAccount(${acc.id});" class="space-y-6">
                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-2 block">Account Name</label>
                        <input type="text" id="edit-acc-name" value="${acc.name}" class="w-full p-4 rounded-xl bg-slate-900 border border-slate-700" disabled>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-2 block">Balance (LKR)</label>
                        <input type="number" id="edit-acc-balance" value="${acc.balance}" step="0.01" class="w-full p-4 rounded-xl bg-slate-900 border border-slate-700 text-2xl font-bold text-primary focus:border-primary outline-none" autofocus>
                    </div>

                    <div class="flex justify-end gap-3 pt-6 border-t border-white/10">
                        <button type="button" onclick="actions.closeModal()" class="px-6 py-2 rounded-xl hover:bg-white/5 transition-colors">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-primary rounded-xl font-bold shadow-lg shadow-primary/20">Save Changes</button>
                    </div>
                </form>
            </div>
        `;
    },

    updateAccount: async (id) => {
        const balance = parseFloat(document.getElementById('edit-acc-balance').value || 0);
        await db.accounts.update(id, { balance: balance });
        actions.closeModal();
        showToast('Account balance updated');
        views.accounts();
    },

    // --- Report Actions ---
    changeReportMonth: (val) => {
        state.reportMonth = val;
        views.reports();
    },

    changeSalesMonth: (val) => {
        state.reportMonth = val;
        views.sales();
    },

    changeDeliveriesMonth: (val) => {
        state.reportMonth = val;
        views.deliveries();
    },

    toggleDeliveryDetails: (val) => {
        const section = document.getElementById('delivery-details-section');
        if (!section) return;
        if (parseFloat(val) > 0) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    },

    filterDeliveriesTable: async (query) => {
        const [year, month] = state.reportMonth.split('-');
        const allSales = await db.sales.toArray();
        const lowerQuery = query.toLowerCase();

        const filtered = allSales.filter(s => {
            const d = new Date(s.date);
            const matchesMonth = d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
            const isDelivery = parseFloat(s.delivery || 0) > 0;
            const matchesQuery = (s.deliveryName?.toLowerCase().includes(lowerQuery)) ||
                (s.trackingNumber?.toLowerCase().includes(lowerQuery));
            return matchesMonth && isDelivery && matchesQuery;
        }).reverse();

        const tbody = document.getElementById('deliveries-table-body');
        if (!tbody) return;

        tbody.innerHTML = filtered.length > 0 ? filtered.map(s => `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="text-slate-400 text-sm">${new Date(s.date).toLocaleDateString()}</td>
                <td>
                    <div class="flex flex-col">
                        <span class="font-bold text-white">${s.deliveryName || 'N/A'}</span>
                        <span class="text-[10px] text-slate-400 truncate max-w-[200px]">${s.deliveryAddress || 'No Address'}</span>
                    </div>
                </td>
                <td>
                    <span class="font-mono text-xs ${s.trackingNumber ? 'text-primary' : 'text-slate-600 italic'}">
                        ${s.trackingNumber || 'Not assigned'}
                    </span>
                </td>
                <td class="font-medium text-green-400">${formatCurrency(s.delivery)}</td>
                <td class="font-bold text-white">${formatCurrency(s.total)}</td>
                <td>
                    <div class="flex gap-2">
                        <button onclick="actions.printBill(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"><i class="fa-solid fa-print"></i></button>
                        <button onclick="actions.downloadInvoice(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-primary transition-colors"><i class="fa-solid fa-file-pdf"></i></button>
                        <button onclick="actions.openEditSaleModal(${s.id})" class="p-2 hover:bg-blue-600/20 rounded-lg text-blue-400 transition-colors"><i class="fa-solid fa-edit"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="6" class="text-center p-8 text-slate-500">No matching deliveries found</td></tr>';
    },

    filterSalesTable: async (query) => {
        const [year, month] = state.reportMonth.split('-');
        const allSales = await db.sales.toArray();
        const lowerQuery = query.toLowerCase();
        const methodFilter = document.getElementById('filter-pay-method')?.value || '';

        const filtered = allSales.filter(s => {
            const d = new Date(s.date);
            const matchesMonth = d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
            const matchesQuery = s.id.toString().includes(query) || (s.customerPhone?.toLowerCase().includes(lowerQuery));
            const matchesMethod = !methodFilter || (s.paymentMethod || 'cash') === methodFilter;
            return matchesMonth && matchesQuery && matchesMethod;
        }).reverse();

        const tbody = document.getElementById('sales-table-body');
        if (!tbody) return;

        tbody.innerHTML = filtered.length > 0 ? filtered.map(s => `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="text-slate-400 text-sm">${new Date(s.date).toLocaleString()}</td>
                <td class="font-mono text-xs font-bold text-primary">#${s.id}</td>
                <td><span class="font-medium">${s.customerPhone || 'Walk-in'}</span></td>
                <td><span class="px-2 py-1 rounded-full bg-slate-700 text-[10px] font-bold uppercase">${s.items.length} Units</span></td>
                <td>
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase ${s.paymentMethod === 'bank' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}">
                        ${s.paymentMethod || 'cash'}
                    </span>
                </td>
                <td class="font-bold text-white">${formatCurrency(s.total)}</td>
                <td>
                    <div class="flex gap-2">
                        <button onclick="actions.printBill(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors" title="Print"><i class="fa-solid fa-print"></i></button>
                        <button onclick="actions.downloadInvoice(${s.id})" class="p-2 hover:bg-slate-700 rounded-lg text-primary transition-colors" title="Download"><i class="fa-solid fa-file-pdf"></i></button>
                        <button onclick="actions.openEditSaleModal(${s.id})" class="p-2 hover:bg-blue-600/20 rounded-lg text-blue-400 transition-colors" title="Edit"><i class="fa-solid fa-edit"></i></button>
                        <button onclick="actions.deleteSale(${s.id})" class="p-2 hover:bg-red-600/20 rounded-lg text-red-500 transition-colors" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="7" class="text-center p-8 text-slate-500">No matching bills found</td></tr>';
    },

    deleteSale: async (id) => {
        if (!confirm('Are you sure you want to delete this bill? This will restore stock levels.')) return;

        const sale = await db.sales.get(id);
        if (!sale) return;

        // Restore stock
        for (const item of sale.items) {
            const p = await db.products.get(item.product.id);
            if (p) {
                await db.products.update(p.id, { stock: p.stock + item.qty });
            }
        }

        // Deduct loyalty points if applicable
        if (sale.customerId) {
            const customer = await db.customers.get(sale.customerId);
            if (customer) {
                const pointsToDeduct = Math.floor(sale.total / 100);
                await db.customers.update(customer.id, { points: Math.max(0, (customer.points || 0) - pointsToDeduct) });
            }
        }

        await db.sales.delete(id);
        showToast('Bill deleted and stock restored');
        views.sales();
    },

    openEditSaleModal: async (id) => {
        const sale = await db.sales.get(id);
        if (!sale) return;

        const customers = await db.customers.toArray();
        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');

        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        content.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <h2 class="text-2xl font-bold">Edit Bill #${sale.id}</h2>
                    <span class="text-slate-400 text-sm">${new Date(sale.date).toLocaleString()}</span>
                </div>
                
                <form id="edit-sale-form" onsubmit="event.preventDefault(); actions.updateSale(${sale.id});" class="space-y-6">
                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-2 block">Customer</label>
                        <select id="edit-sale-customer" class="w-full p-3 rounded-xl bg-slate-900 border border-slate-700">
                            <option value="">Walk-in Customer</option>
                            ${customers.map(c => `<option value="${c.id}" ${c.phone === sale.customerPhone ? 'selected' : ''}>${c.name} (${c.phone})</option>`).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="text-xs text-slate-400 uppercase font-bold mb-2 block">Bill Items</label>
                        <div class="space-y-3 max-h-60 overflow-y-auto pr-2" id="edit-sale-items">
                            ${sale.items.map((item, index) => `
                                <div class="bg-slate-900/50 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-4">
                                    <div class="flex-1">
                                        <p class="font-medium text-sm">${item.product.name}</p>
                                        <p class="text-xs text-slate-500">${formatCurrency(item.product.sellingPrice)} per unit</p>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <div class="flex flex-col items-center">
                                            <label class="text-[10px] text-slate-500 mb-1">Qty</label>
                                            <input type="number" value="${item.qty}" data-index="${index}" class="edit-qty w-16 bg-slate-800 border-none rounded text-center p-1 text-sm focus:ring-1 focus:ring-primary" min="1">
                                        </div>
                                        <div class="flex flex-col items-center">
                                            <label class="text-[10px] text-slate-500 mb-1">Discount</label>
                                            <input type="number" value="${item.discount}" data-index="${index}" class="edit-discount w-20 bg-slate-800 border-none rounded text-right p-1 text-sm text-green-400 focus:ring-1 focus:ring-green-500">
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs text-slate-400 uppercase font-bold mb-2 block">Delivery Fee</label>
                            <input type="number" id="edit-sale-delivery" value="${sale.delivery || 0}" class="w-full p-3 rounded-xl bg-slate-900 border border-slate-700">
                        </div>
                        <div class="flex flex-col justify-end items-end">
                            <p class="text-xs text-slate-400 uppercase font-bold mb-1">Current Total</p>
                            <p class="text-2xl font-bold text-primary" id="edit-sale-total-display">${formatCurrency(sale.total)}</p>
                        </div>
                    </div>

                    <div id="edit-delivery-info" class="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                        <label class="text-xs text-slate-400 uppercase font-bold block">Delivery Information</label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" id="edit-delivery-name" placeholder="Recipient Name" value="${sale.deliveryName || ''}" class="w-full p-3 rounded-xl bg-slate-900 border border-slate-700">
                            <input type="text" id="edit-delivery-tracking" placeholder="Tracking Number" value="${sale.trackingNumber || ''}" class="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 font-mono text-primary">
                        </div>
                        <textarea id="edit-delivery-address" placeholder="Delivery Address" class="w-full p-3 rounded-xl bg-slate-900 border border-slate-700" rows="2">${sale.deliveryAddress || ''}</textarea>
                    </div>

                    <div class="flex justify-end gap-3 pt-6 border-t border-white/10">
                        <button type="button" onclick="actions.closeModal()" class="px-6 py-2 rounded-xl hover:bg-white/5 transition-colors">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-primary rounded-xl font-bold shadow-lg shadow-primary/20">Update Bill</button>
                    </div>
                </form>
            </div>
        `;

        // Listen for changes to update total display
        content.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                let subtotal = 0;
                let totalDiscount = 0;
                content.querySelectorAll('.edit-qty').forEach((qInput, i) => {
                    const qty = parseInt(qInput.value) || 0;
                    const dInput = content.querySelectorAll('.edit-discount')[i];
                    const disc = parseFloat(dInput.value) || 0;
                    subtotal += qty * sale.items[i].product.sellingPrice;
                    totalDiscount += disc;
                });
                const delivery = parseFloat(document.getElementById('edit-sale-delivery').value) || 0;
                const grandTotal = subtotal - totalDiscount + delivery;
                document.getElementById('edit-sale-total-display').innerText = formatCurrency(grandTotal);
            });
        });
    },

    updateSale: async (id) => {
        const sale = await db.sales.get(id);
        if (!sale) return;

        const customerId = document.getElementById('edit-sale-customer').value;
        const customer = customerId ? await db.customers.get(parseInt(customerId)) : null;
        const delivery = parseFloat(document.getElementById('edit-sale-delivery').value) || 0;

        const qtyInputs = document.querySelectorAll('.edit-qty');
        const discInputs = document.querySelectorAll('.edit-discount');

        let newSubtotal = 0;
        let newItemDiscounts = 0;
        let totalCost = 0;

        // Old loyalty points deduction
        if (sale.customerId) {
            const oldCust = await db.customers.get(sale.customerId);
            if (oldCust) {
                const pointsToDeduct = Math.floor(sale.total / 100);
                await db.customers.update(oldCust.id, { points: Math.max(0, (oldCust.points || 0) - pointsToDeduct) });
            }
        }

        // Update items and stock
        for (let i = 0; i < sale.items.length; i++) {
            const newQty = parseInt(qtyInputs[i].value) || 1;
            const newDisc = parseFloat(discInputs[i].value) || 0;
            const item = sale.items[i];

            // Adjust stock: diff = newQty - oldQty. Current stock should decrease by diff.
            // Simplified: revert old stock, then deduct new qty.
            const p = await db.products.get(item.product.id);
            if (p) {
                const restoredStock = p.stock + item.qty;
                await db.products.update(p.id, { stock: restoredStock - newQty });
            }

            item.qty = newQty;
            item.discount = newDisc;
            item.unitDiscount = newQty > 0 ? newDisc / newQty : 0;

            newSubtotal += newQty * item.product.sellingPrice;
            newItemDiscounts += newDisc;

            const unitCost = (item.product.liquidCost || 0) + (item.product.bottleCost || 0) + (item.product.stickerCost || 0) + (item.product.marketingCost || 0) + (item.product.otherCost || 0);
            totalCost += unitCost * newQty;
        }

        const newTotal = newSubtotal - newItemDiscounts + delivery;
        const newProfit = newTotal - totalCost - delivery;

        const updatedSale = {
            ...sale,
            items: sale.items,
            subtotal: newSubtotal,
            discount: newItemDiscounts,
            delivery: delivery,
            total: newTotal,
            profit: newProfit,
            customerPhone: customer ? customer.phone : null,
            customerId: customer ? customer.id : null,
            deliveryName: document.getElementById('edit-delivery-name')?.value || null,
            deliveryAddress: document.getElementById('edit-delivery-address')?.value || null,
            trackingNumber: document.getElementById('edit-delivery-tracking')?.value || null
        };

        await db.sales.update(id, updatedSale);

        // Add new loyalty points
        if (customer) {
            const pointsToAdd = Math.floor(newTotal / 100);
            const freshCust = await db.customers.get(customer.id);
            await db.customers.update(customer.id, { points: (freshCust.points || 0) + pointsToAdd });
        }

        actions.closeModal();
        showToast('Bill updated successfully');
        views.sales();
    },

    // --- Customer Actions ---
    loadCustomersToSelect: async () => {
        const customers = await db.customers.toArray();
        const select = document.getElementById('cart-customer');
        if (select) {
            select.innerHTML = '<option value="">Select Customer (Optional)</option>' +
                customers.map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('');
        }
    },

    openCustomerModal: () => {
        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');
        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        content.innerHTML = `
            <div class="p-6">
                <h2 class="text-2xl font-bold mb-4">New Customer</h2>
                <form onsubmit="event.preventDefault(); actions.saveCustomer();" class="flex flex-col gap-4">
                    <input type="text" id="cust-phone" placeholder="Phone Number" class="p-3 rounded-xl w-full" required>
                    <input type="text" id="cust-name" placeholder="Full Name" class="p-3 rounded-xl w-full" required>
                    <textarea id="cust-address" placeholder="Address" class="p-3 rounded-xl w-full"></textarea>
                    
                    <div class="flex justify-end gap-3 mt-4">
                         <button type="button" onclick="actions.closeModal()" class="px-6 py-2 rounded-xl hover:bg-white/5">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-primary rounded-xl font-bold">Save Customer</button>
                    </div>
                </form>
            </div>
        `;
    },

    saveCustomer: async () => {
        const customer = {
            phone: document.getElementById('cust-phone').value,
            name: document.getElementById('cust-name').value,
            address: document.getElementById('cust-address').value,
            points: 0
        };

        await db.customers.add(customer);
        actions.closeModal();
        actions.loadCustomersToSelect();
        showToast('Customer Registered!');
        if (state.currentView === 'customers') views.customers();
    },

    deleteCustomer: async (id) => {
        if (confirm('Delete customer?')) {
            await db.customers.delete(id);
            views.customers();
        }
    },

    // --- Expense Actions ---
    openExpenseModal: () => {
        const modal = document.getElementById('modal-backdrop');
        const content = document.getElementById('modal-content');
        modal.classList.remove('hidden', 'opacity-0');
        modal.classList.add('opacity-100');

        const today = new Date().toISOString().split('T')[0];

        content.innerHTML = `
            <div class="p-6">
                <h2 class="text-2xl font-bold mb-4">Add Expense</h2>
                <form onsubmit="event.preventDefault(); actions.saveExpense();" class="flex flex-col gap-4">
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="text-sm text-slate-400 mb-1 block">Category</label>
                            <select id="exp-category" class="p-3 rounded-xl w-full bg-slate-900 border border-slate-700">
                                <option value="Raw Material">Raw Material (Liquid)</option>
                                <option value="Bottles">Bottles/Containers</option>
                                <option value="Printing">Printing (Labels/Stickers)</option>
                                <option value="Transport">Transport</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="flex-1">
                             <label class="text-sm text-slate-400 mb-1 block">Date</label>
                             <input type="date" id="exp-date" value="${today}" class="p-3 rounded-xl w-full bg-slate-900 border border-slate-700 text-white" required>
                        </div>
                    </div>
                    <input type="number" id="exp-amount" placeholder="Amount (LKR)" class="p-3 rounded-xl w-full" required>
                    <textarea id="exp-desc" placeholder="Description" class="p-3 rounded-xl w-full"></textarea>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex-1">
                            <label class="text-sm text-slate-400 mb-1 block">Pay From</label>
                            <select id="exp-account" class="p-3 rounded-xl w-full bg-slate-900 border border-slate-700">
                                <option value="Cash Box">Cash Box</option>
                                <option value="Bank Account">Bank Account</option>
                            </select>
                        </div>
                        <div class="flex-1 pt-6 text-xs text-slate-500 italic">
                            Amount will be deducted from the selected account balance.
                        </div>
                    </div>

                    <div>
                        <label class="block mb-2 text-sm text-slate-400">Invoice Image (Optional)</label>
                        <input type="file" id="exp-file" accept="image/*" class="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/80">
                    </div>

                    <div class="flex justify-end gap-3 mt-4">
                         <button type="button" onclick="actions.closeModal()" class="px-6 py-2 rounded-xl hover:bg-white/5">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-secondary rounded-xl font-bold">Save Expense</button>
                    </div>
                </form>
            </div>
        `;
    },

    saveExpense: async () => {
        const fileInput = document.getElementById('exp-file');
        let imageBase64 = null;

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            imageBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }

        const expense = {
            category: document.getElementById('exp-category').value,
            amount: parseFloat(document.getElementById('exp-amount').value),
            description: document.getElementById('exp-desc').value,
            date: document.getElementById('exp-date').value,
            invoiceImage: imageBase64,
            sourceAccount: document.getElementById('exp-account').value
        };

        // Deduct from account
        const account = await db.accounts.where('name').equals(expense.sourceAccount).first();
        if (account) {
            await db.accounts.update(account.id, { balance: (parseFloat(account.balance) || 0) - expense.amount });
        }

        await db.expenses.add(expense);
        actions.closeModal();
        views.expenses();
        showToast('Expense Logged');
    },

    changeExpenseMonth: (val) => {
        state.expenseMonth = val;
        views.expenses();
    },

    downloadExpenseReport: async () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Filter Data
        const [year, month] = state.expenseMonth.split('-');
        const allExpenses = await db.expenses.toArray();
        const expenses = allExpenses.filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
        });

        const totalExpense = expenses.reduce((a, c) => a + c.amount, 0);

        // Header
        doc.setFontSize(22);
        doc.setTextColor(236, 72, 153); // Pink Secondary
        doc.text('CHEMIGO - Expense Report', 14, 20);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Month: ${state.expenseMonth}`, 14, 30);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);

        // Summary
        doc.setDrawColor(200);
        doc.setFillColor(255, 240, 245);
        doc.roundedRect(14, 45, 120, 20, 3, 3, 'FD');

        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text("Total Expenses", 20, 58);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(236, 72, 153);
        doc.text(`${totalExpense.toFixed(2)} LKR`, 60, 58);

        // Category Summary
        const categories = {};
        expenses.forEach(e => {
            categories[e.category] = (categories[e.category] || 0) + e.amount;
        });

        const catData = Object.entries(categories).map(([cat, amt]) => [cat, amt.toFixed(2)]);

        doc.autoTable({
            head: [['Category', 'Amount (LKR)']],
            body: catData,
            startY: 75,
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139] },
            margin: { left: 14, right: 100 }
        });

        // Detailed Table
        const tableColumn = ["Date", "Category", "Description", "Amount (LKR)"];
        const tableRows = expenses.map(e => [
            new Date(e.date).toLocaleDateString(),
            e.category,
            e.description,
            e.amount.toFixed(2)
        ]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: doc.lastAutoTable.finalY + 10,
            theme: 'grid',
            headStyles: { fillColor: [236, 72, 153] },
            styles: { fontSize: 9 },
            columnStyles: {
                3: { fontStyle: 'bold', halign: 'right' }
            }
        });

        doc.save(`Expense_Report_${state.expenseMonth}.pdf`);
    },

    deleteExpense: async (id) => {
        if (!confirm('Are you sure you want to delete this expense? This will restore the account balance.')) return;

        const exp = await db.expenses.get(id);
        if (exp) {
            const account = await db.accounts.where('name').equals(exp.sourceAccount || 'Cash Box').first();
            if (account) {
                await db.accounts.update(account.id, { balance: (parseFloat(account.balance) || 0) + exp.amount });
            }
        }
        await db.expenses.delete(id);
        showToast('Expense deleted and balance restored');
        views.expenses();
    },

    viewInvoice: async (id) => {
        const exp = await db.expenses.get(parseInt(id));
        if (!exp.invoiceImage) return;

        const win = window.open("");
        win.document.write(`<img src="${exp.invoiceImage}" style="max-width:100%">`);
    },

    // --- Modal Utils ---
    closeModal: () => {
        const modal = document.getElementById('modal-backdrop');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    },

    // --- Scanner Logic ---
    toggleScanner: () => {
        const container = document.getElementById('scanner-container');
        if (!state.scanner) {
            container.classList.remove('hidden');
            state.scanner = new Html5Qrcode("reader");
            state.scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    actions.scanBarcode(decodedText);
                    // Optional: Stop after scan? No, keep scanning for speed.
                },
                (errorMessage) => {
                    // ignore
                }
            ).catch(err => {
                console.error(err);
                showToast("Camera error", 'error');
            });
        } else {
            actions.stopScanner();
        }
    },

    stopScanner: () => {
        if (state.scanner) {
            state.scanner.stop().then(() => {
                state.scanner.clear();
                state.scanner = null;
                document.getElementById('scanner-container').classList.add('hidden');
            }).catch(err => console.log(err));
        }
    },

    scanForInput: (inputId) => {
        // Simple overlay scanner for input fields
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4">
                <div class="relative w-full max-w-md bg-slate-800 rounded-2xl overflow-hidden">
                    <div id="reader-input" class="w-full"></div>
                    <button id="close-scan" class="absolute top-2 right-2 bg-red-500 rounded-full w-8 h-8 text-white"><i class="fa-solid fa-times"></i></button>
                    <p class="text-center p-2 text-slate-400">Scan code now</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const scanner = new Html5Qrcode("reader-input");
        scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
            (text) => {
                document.getElementById(inputId).value = text;
                scanner.stop().then(() => {
                    scanner.clear();
                    modal.remove();
                });
            });

        document.getElementById('close-scan').onclick = () => {
            scanner.stop().then(() => {
                scanner.clear();
                modal.remove();
            });
        };
    },

    // --- Print & PDF ---
    printBill: async (saleId) => {
        const sale = await db.sales.get(saleId);
        if (!sale) return;
        const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
        const currentPoints = customer ? Math.floor(sale.total / 100) : 0;
        const win = window.open('', '', 'width=300,height=600');

        const style = `
            <style>
                @page { margin: 0; size: auto; }
                body { 
                    font-family: 'Arial', sans-serif; 
                    width: 72mm; 
                    font-size: 12px; 
                    color: #000; 
                    margin: 0; 
                    padding: 4mm;
                    line-height: 1.2;
                }
                .text-center { text-align: center; }
                .bold { font-weight: bold; }
                .brand-name { font-size: 32px; font-weight: 900; margin-bottom: 5px; display: block; }
                .line { border-bottom: 1px solid #000; margin: 5px 0; }
                .dashed-line { border-bottom: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; }
                td { vertical-align: top; padding: 2px 0; font-size: 12px; }
                .right { text-align: right; }
                * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            </style>
        `;

        const itemsHtml = sale.items.map(i => {
            const mktPrice = i.product.marketPrice || i.product.sellingPrice;
            const ourPrice = i.product.sellingPrice - (i.unitDiscount || 0);
            return `
                <tr>
                    <td colspan="2" class="bold">${i.product.name}</td>
                </tr>
                <tr>
                    <td>${i.qty} x ${ourPrice.toFixed(2)}</td>
                    <td class="right">${(ourPrice * i.qty).toFixed(2)}</td>
                </tr>
                <tr>
                    <td colspan="2" style="font-size: 10px; color: #000 !important; font-weight: bold;">
                        වෙළඳපල මිල: ${mktPrice.toFixed(2)} | අපේ මිල: ${ourPrice.toFixed(2)}
                    </td>
                </tr>
                <tr><td colspan="2" style="height: 2px;"></td></tr>
            `;
        }).join('');

        const totalSaving = sale.items.reduce((acc, i) => {
            const mktPrice = i.product.marketPrice || i.product.sellingPrice;
            return acc + ((mktPrice - i.product.sellingPrice) * i.qty) + (i.discount || 0);
        }, 0);

        win.document.write(`
            <html>
                <head>${style}</head>
                <body>
                    <div class="text-center">
                        <span class="brand-name">CHEMIGO</span>
                        <span style="font-size: 12px;">13/3 Temple road Pilanduwa, Warakapola</span><br>
                        <span class="bold" style="font-size: 14px;">075 88 99 312</span>
                    </div>
                    <div class="line"></div>
                    <div style="font-size: 12px;">
                        Date: ${new Date(sale.date).toLocaleString()}<br>
                        Bill No: #${sale.id}<br>
                        ${customer ? `Customer: ${customer.name || sale.customerPhone}` : ''}
                    </div>
                    <div class="line"></div>
                    <table>
                        ${itemsHtml}
                    </table>
                    <div class="line"></div>
                    <table>
                        <tr><td>Subtotal</td><td class="right">${sale.subtotal.toFixed(2)}</td></tr>
                        ${sale.discount > 0 ? `<tr><td>Item Discount</td><td class="right">-${sale.discount.toFixed(2)}</td></tr>` : ''}
                        ${sale.billDiscount > 0 ? `<tr><td>Bill Discount</td><td class="right">-${sale.billDiscount.toFixed(2)}</td></tr>` : ''}
                        ${sale.delivery > 0 ? `
                            <tr>
                                <td style="font-size: 10px;">Delivery (${sale.totalWeight?.toFixed(2)}kg)<br><span style="font-size: 8px;">(1kg:350 + extra:80/kg)</span></td>
                                <td class="right">${sale.delivery.toFixed(2)}</td>
                            </tr>` : ''}
                        <tr class="bold" style="font-size:16px"><td>TOTAL</td><td class="right">${sale.total.toFixed(2)}</td></tr>
                    </table>
                    <div class="dashed-line"></div>
                    <table>
                        <tr><td>Pay Method</td><td class="right">${sale.paymentMethod?.toUpperCase() || 'CASH'}</td></tr>
                        ${sale.paymentMethod === 'cash' ? `
                            <tr><td>Cash Taken</td><td class="right">${(sale.cashGiven || 0).toFixed(2)}</td></tr>
                            <tr><td>Balance</td><td class="right">${(sale.cashBalance || 0).toFixed(2)}</td></tr>
                        ` : ''}
                    </table>
                    <div class="line"></div>
                    <div class="text-center" style="margin-top: 10px;">
                        <span style="font-size: 14px; display: block; font-weight: bold;">ඔබට ලැබුනු ලාබය: ${totalSaving.toFixed(2)} LKR</span>
                        ${customer ? `
                        <div style="margin: 5px 0; border: 1px solid #000; padding: 5px;">
                            <span style="font-size: 12px; display: block;">Points: ${currentPoints}</span>
                            <span style="font-size: 13px; display: block;" class="bold">Total Points: ${customer.points || 0}</span>
                        </div>
                        ` : ''}
                        <span style="font-size: 14px; font-weight: bold;">Thank You! Come Again.</span>
                    </div>
                </body>
            </html>
        `);

        win.document.close();

        // Wait for fonts and content to load
        setTimeout(() => {
            win.focus();
            win.print();
            // Close after printing starts to ensure it doesn't close too early
            setTimeout(() => win.close(), 1000);
        }, 800);
    },

    downloadInvoice: async (saleId) => {
        const sale = await db.sales.get(saleId);
        const { jsPDF } = window.jspdf;

        // Create A5 document
        const doc = new jsPDF('p', 'mm', 'a5');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Helper to load image
        const loadImage = (url) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });

        const logo = await loadImage('logo.png');

        // Theme Colors (Matching Logo: Light Green, Light Blue, Black)
        const colorGreen = [34, 197, 94]; // #22c55e
        const colorBlue = [6, 182, 212];  // #06b6d4
        const colorBlack = [15, 23, 42];  // Slate 900 (Dark/Black)
        const colorGray = [100, 116, 139]; // Slate 500

        // Top Border Bar
        doc.setFillColor(...colorGreen);
        doc.rect(0, 0, pageWidth, 4, 'F');
        doc.setFillColor(...colorBlue);
        doc.rect(0, 4, pageWidth, 2, 'F');

        // Add Logo
        if (logo) {
            doc.addImage(logo, 'PNG', 10, 10, 25, 25);
        }

        // Company Name
        doc.setFontSize(24);
        doc.setTextColor(...colorBlack);
        doc.setFont(undefined, 'bold');
        doc.text('CHEMIGO', 40, 22);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...colorGreen);
        doc.text('PREMIUM CLEANING PRODUCTS', 40, 28);

        // Address & Contact (Right Aligned)
        doc.setFontSize(8);
        doc.setTextColor(...colorBlack);
        doc.text('13/3 Temple road Pilanduwa, Warakapola', pageWidth - 10, 15, { align: 'right' });
        doc.text('Mobile: 075 88 99 312', pageWidth - 10, 20, { align: 'right' });
        doc.text('Email: info@chemigo.lk', pageWidth - 10, 25, { align: 'right' });

        // Invoice Header Banner
        doc.setFillColor(248, 250, 252); // Slate 50
        doc.rect(10, 42, pageWidth - 20, 20, 'F');
        doc.setDrawColor(226, 232, 240); // Slate 200
        doc.rect(10, 42, pageWidth - 20, 20, 'S');

        doc.setFontSize(12);
        doc.setTextColor(...colorBlack);
        doc.setFont(undefined, 'bold');
        doc.text(`INVOICE: #${sale.id}`, 15, 51);

        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...colorGray);
        doc.text(`ISSUED DATE: ${new Date(sale.date).toLocaleString()}`, 15, 57);

        doc.setTextColor(...colorBlack);
        doc.setFont(undefined, 'bold');
        doc.text(`CUSTOMER:`, pageWidth - 50, 51);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(sale.customerPhone || 'Walk-in Customer', pageWidth - 15, 51, { align: 'right' });

        // Delivery Info (Optional)
        let tableStartY = 68;
        if (sale.deliveryName || sale.deliveryAddress || sale.trackingNumber) {
            doc.setFillColor(240, 253, 244); // Light Green Tint
            doc.rect(10, 65, pageWidth - 20, 22, 'F');
            doc.setDrawColor(...colorGreen);
            doc.setLineWidth(0.2);
            doc.line(10, 65, 10, 87); // Left accent line

            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...colorGreen);
            doc.text('DELIVERY TO:', 15, 70);

            doc.setFont(undefined, 'bold');
            doc.setTextColor(...colorBlack);
            doc.text(sale.deliveryName || 'N/A', 15, 75);

            doc.setFont(undefined, 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...colorBlack);
            doc.text(sale.deliveryAddress || 'No address provided', 15, 79, { maxWidth: pageWidth - 70 });

            if (sale.trackingNumber) {
                doc.setFont(undefined, 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...colorBlue);
                doc.text('TRACKING #:', pageWidth - 60, 70);
                doc.setFont(undefined, 'normal');
                doc.text(sale.trackingNumber, pageWidth - 15, 70, { align: 'right' });
            }
            tableStartY = 92;
        }

        // Items Table
        const tableColumn = ["Product Description", "Qty", "Market Price", "Our Price", "Total"];
        const tableRows = sale.items.map(item => {
            const mktPrice = item.product.marketPrice || item.product.sellingPrice;
            const ourPrice = item.product.sellingPrice - (item.unitDiscount || 0);
            return [
                { content: item.product.name, styles: { fontStyle: 'bold' } },
                item.qty.toString(),
                mktPrice.toFixed(2),
                ourPrice.toFixed(2),
                (ourPrice * item.qty).toFixed(2)
            ];
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: tableStartY,
            theme: 'striped',
            headStyles: {
                fillColor: colorBlue,
                textColor: [255, 255, 255],
                fontSize: 8,
                halign: 'center',
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { halign: 'center', cellWidth: 10 },
                2: { halign: 'right', cellWidth: 20 },
                3: { halign: 'right', cellWidth: 20 },
                4: { halign: 'right', cellWidth: 25 }
            },
            styles: {
                fontSize: 8,
                cellPadding: 3,
                textColor: colorBlack
            },
            alternateRowStyles: {
                fillColor: [240, 253, 244] // Very light green tint
            },
            margin: { left: 10, right: 10 }
        });

        // Totals Section
        let finalY = doc.lastAutoTable.finalY + 10;

        if (finalY > pageHeight - 45) {
            doc.addPage();
            finalY = 20;
        }

        const statsX = pageWidth - 10;
        const labelsX = pageWidth - 50;

        doc.setFontSize(9);
        doc.setTextColor(...colorGray);

        doc.text('Net Subtotal:', labelsX, finalY);
        doc.text(`${sale.subtotal.toFixed(2)}`, statsX, finalY, { align: 'right' });

        finalY += 6;
        doc.text('Discount Amount:', labelsX, finalY);
        doc.setTextColor(...colorGreen);
        doc.text(`- ${sale.discount.toFixed(2)}`, statsX, finalY, { align: 'right' });

        finalY += 6;
        doc.setTextColor(...colorGray);
        doc.text('Delivery Fee:', labelsX, finalY);
        doc.text(`${sale.delivery.toFixed(2)}`, statsX, finalY, { align: 'right' });

        finalY += 8;
        doc.setDrawColor(...colorBlue);
        doc.setLineWidth(0.5);
        doc.line(labelsX - 5, finalY - 5, statsX, finalY - 5);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...colorGreen);
        doc.text('TOTAL PAYABLE:', labelsX - 10, finalY + 2);
        doc.text(`${sale.total.toFixed(2)} LKR`, statsX, finalY + 2, { align: 'right' });

        finalY += 12;
        doc.setDrawColor(240, 240, 240);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(10, finalY, pageWidth - 20, 15, 2, 2, 'FD');

        doc.setFontSize(8);
        doc.setTextColor(...colorGray);
        doc.setFont(undefined, 'bold');
        doc.text('PAYMENT METHOD:', 15, finalY + 6);
        doc.setTextColor(...colorBlack);
        doc.text(sale.paymentMethod?.toUpperCase() || 'CASH', 45, finalY + 6);

        if (sale.paymentMethod === 'cash') {
            doc.setTextColor(...colorGray);
            doc.text('CASH GIVEN:', 80, finalY + 6);
            doc.setTextColor(...colorBlack);
            doc.text(`${(sale.cashGiven || 0).toFixed(2)} LKR`, 100, finalY + 6);

            doc.setTextColor(...colorGray);
            doc.text('BALANCE:', pageWidth - 60, finalY + 6);
            doc.setTextColor(...colorGreen);
            doc.text(`${(sale.cashBalance || 0).toFixed(2)} LKR`, pageWidth - 15, finalY + 6, { align: 'right' });
        }

        const totalSaving = sale.items.reduce((acc, i) => {
            const mktPrice = i.product.marketPrice || i.product.sellingPrice;
            return acc + ((mktPrice - i.product.sellingPrice) * i.qty) + (i.discount || 0);
        }, 0);

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...colorGreen);
        doc.text(`Total Savings: ${totalSaving.toFixed(2)} LKR`, 10, finalY + 28);

        // Footer
        const footerY = pageHeight - 15;
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...colorGray);
        doc.text('This is a computer generated invoice.', pageWidth / 2, footerY, { align: 'center' });
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...colorBlue);
        doc.text('Thank you for choosing CHEMIGO Products!', pageWidth / 2, footerY + 5, { align: 'center' });

        doc.save(`Chemigo_Invoice_${sale.id}.pdf`);
    },

    shareOnWhatsApp: async (saleId) => {
        const sale = await db.sales.get(saleId);
        if (!sale) return;

        let message = `*CHEMIGO POS INVOICE #${sale.id}*\n`;
        message += `Date: ${new Date(sale.date).toLocaleString()}\n`;
        message += `--------------------------------\n`;

        sale.items.forEach(item => {
            const mktPrice = item.product.marketPrice || item.product.sellingPrice;
            const ourPrice = item.product.sellingPrice - (item.unitDiscount || 0);
            message += `*${item.product.name}*\n`;
            message += `කඩේ මිල: ${mktPrice.toFixed(2)}\n`;
            message += `අපේ මිල: ${ourPrice.toFixed(2)}\n`;
            message += `${item.qty} x ${ourPrice.toFixed(2)} = *${(ourPrice * item.qty).toFixed(2)}*\n\n`;
        });

        message += `--------------------------------\n`;
        message += `Subtotal: ${sale.subtotal.toFixed(2)}\n`;
        if (sale.discount > 0) message += `Item Discount: -${sale.discount.toFixed(2)}\n`;
        if (sale.billDiscount > 0) message += `Bill Discount: -${sale.billDiscount.toFixed(2)}\n`;
        if (sale.delivery > 0) message += `Delivery: ${sale.delivery.toFixed(2)}\n`;
        message += `*TOTAL: ${sale.total.toFixed(2)} LKR*\n`;

        const totalSaving = sale.items.reduce((acc, i) => {
            const mktPrice = i.product.marketPrice || i.product.sellingPrice;
            return acc + ((mktPrice - i.product.sellingPrice) * i.qty) + (i.discount || 0);
        }, 0) + (sale.billDiscount || 0);

        message += `--------------------------------\n`;
        message += `ඔබට ලැබුනු ලාබය: ${totalSaving.toFixed(2)} LKR\n`;
        message += `--------------------------------\n`;
        message += `බුදු සරණයි! 🙏\n`;
        message += `*Thank you for choosing CHEMIGO!*`;

        const encodedMessage = encodeURIComponent(message);
        const rawPhone = sale.customerPhone ? sale.customerPhone.replace(/[^0-9]/g, '') : '';

        let phone = rawPhone;
        // Format to International format for Sri Lanka if starts with 0
        if (phone.length === 10 && phone.startsWith('0')) {
            phone = '94' + phone.substring(1);
        } else if (phone.length === 9 && !phone.startsWith('0')) {
            phone = '94' + phone;
        }

        // Using wa.me as it's the most standard/modern short link
        const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

        console.log("Opening WhatsApp:", whatsappUrl);
        const win = window.open(whatsappUrl, '_blank');

        if (!win || win.closed || typeof win.closed == 'undefined') {
            // Popup blocked - fall back to current tab
            window.location.href = whatsappUrl;
        }
    },

    shareQuotation: async (mode) => {
        if (state.cart.length === 0) return showToast('Cart is empty', 'error');

        const totals = actions.updateCartTotals();
        const customerId = document.getElementById('cart-customer').value;
        const customer = customerId ? await db.customers.get(parseInt(customerId)) : null;

        if (mode === 'whatsapp') {
            let message = `*CHEMIGO PRICE QUOTATION*\n`;
            message += `Generate Date: ${new Date().toLocaleDateString()}\n`;
            message += `--------------------------------\n`;

            state.cart.forEach(item => {
                const mktPrice = item.product.marketPrice || item.product.sellingPrice;
                const ourPrice = item.product.sellingPrice - (item.unitDiscount || 0);
                message += `*${item.product.name}*\n`;
                message += `වෙළඳපල මිල: ${mktPrice.toFixed(2)}\n`;
                message += `අපේ මිල: *${ourPrice.toFixed(2)}*\n`;
                message += `Quantity: ${item.qty}\n`;
                message += `Total: *${(ourPrice * item.qty).toFixed(2)}*\n\n`;
            });

            message += `--------------------------------\n`;
            message += `Subtotal: ${totals.subtotal.toFixed(2)}\n`;
            if (totals.itemDiscounts + totals.billDiscount > 0)
                message += `Total Discount: -${(totals.itemDiscounts + totals.billDiscount).toFixed(2)}\n`;

            if (totals.delivery > 0) {
                message += `Delivery (${totals.totalWeight.toFixed(2)}kg): ${totals.delivery.toFixed(2)}\n`;
                message += `(1kg:350 + extra:80/kg)\n`;
            }

            message += `--------------------------------\n`;
            message += `*ESTIMATED TOTAL: ${totals.total.toFixed(2)} LKR*\n`;
            message += `--------------------------------\n`;
            message += `* Delivery Rates: (1kg:350 + extra:80/kg) *\n`;
            message += `_This is a price quotation. Valid as per current stock & prices._\n\n`;
            message += `ඔබට අවම මිලට Premium brand එකක් සොයා එන්න! 🧴\n`;
            message += `*CHEMIGO Chemicals* - Warakapola\n`;
            message += `Call: 075 88 99 312`;

            const encodedMessage = encodeURIComponent(message);
            const phone = customer ? (customer.phone.startsWith('0') ? '94' + customer.phone.substring(1) : '94' + customer.phone) : '';
            window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');

        } else if (mode === 'print') {
            const win = window.open('', '', 'width=300,height=600');
            const itemsHtml = state.cart.map(i => {
                const mktPrice = i.product.marketPrice || i.product.sellingPrice;
                const ourPrice = i.product.sellingPrice - (i.unitDiscount || 0);
                return `
                    <tr>
                        <td colspan="2" class="bold">${i.product.name}</td>
                    </tr>
                    <tr>
                        <td>${i.qty} x ${ourPrice.toFixed(2)}</td>
                        <td class="right">${(ourPrice * i.qty).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="font-size: 10px; color: #000; font-weight: bold;">
                            වෙළඳපල මිල: ${mktPrice.toFixed(2)} | අපේ මිල: ${ourPrice.toFixed(2)}
                        </td>
                    </tr>
                    <tr><td colspan="2" style="height: 4px;"></td></tr>
                `;
            }).join('');

            win.document.write(`
                <html>
                    <head>
                        <style>
                            body { font-family: 'Arial', sans-serif; width: 72mm; font-size: 12px; margin: 0; padding: 4mm; }
                            .text-center { text-align: center; }
                            .bold { font-weight: bold; }
                            .brand-name { font-size: 24px; font-weight: 900; }
                            .line { border-bottom: 1px solid #000; margin: 5px 0; }
                            table { width: 100%; border-collapse: collapse; }
                            td { padding: 4px 0; }
                            .right { text-align: right; }
                        </style>
                    </head>
                    <body>
                        <div class="text-center">
                            <span class="brand-name">CHEMIGO</span><br>
                            <span class="bold">PRICE QUOTATION</span><br>
                            <span style="font-size: 10px;">Date: ${new Date().toLocaleString()}</span>
                        </div>
                        <div class="line"></div>
                        <table>${itemsHtml}</table>
                        <div class="line"></div>
                        <table>
                            <tr><td>Subtotal</td><td class="right">${totals.subtotal.toFixed(2)}</td></tr>
                            ${(totals.itemDiscounts + totals.billDiscount) > 0 ? `<tr><td>Discount</td><td class="right">-${(totals.itemDiscounts + totals.billDiscount).toFixed(2)}</td></tr>` : ''}
                            ${totals.delivery > 0 ? `
                                <tr>
                                    <td style="font-size: 10px;">Delivery (${totals.totalWeight.toFixed(2)}kg)<br><span style="font-size: 8px;">(1kg:350 + extra:80/kg)</span></td>
                                    <td class="right">${totals.delivery.toFixed(2)}</td>
                                </tr>` : ''}
                            <tr class="bold" style="font-size:14px"><td>EST. TOTAL</td><td class="right">${totals.total.toFixed(2)}</td></tr>
                        </table>
                        <div style="font-size: 9px; margin-top: 10px; color: #555;">
                            * Delivery: 1kg:350 LKR | Each extra 1kg: 80 LKR
                        </div>
                        <div class="line" style="margin-top: 10px;"></div>
                        <div class="text-center" style="font-size: 10px; margin-top: 5px;">
                            This is not a receipt. Only for price reference.<br>
                            * CHEMIGO - 075 88 99 312 *
                        </div>
                    </body>
                </html>
            `);
            win.document.close();
            setTimeout(() => { win.print(); win.close(); }, 500);
        }
    },

    shareFullPriceList: async (mode) => {
        const products = await db.products.toArray();
        if (products.length === 0) return showToast('No products found', 'error');

        // Sort products by name
        products.sort((a, b) => a.name.localeCompare(b.name));

        if (mode === 'whatsapp') {
            let message = `*CHEMIGO PRODUCT PRICE LIST*\n`;
            message += `Updated: ${new Date().toLocaleDateString()}\n`;
            message += `--------------------------------\n\n`;

            products.forEach(p => {
                const mktPrice = p.marketPrice || p.sellingPrice;
                const ourPrice = p.sellingPrice;
                message += `*${p.name}*\n`;
                if (mktPrice > ourPrice) message += `_Market Price: ${mktPrice.toFixed(2)}_\n`;
                message += `Our Price: *${ourPrice.toFixed(2)} LKR*\n`;
                if (p.weight) message += `Weight: ${p.weight.toFixed(3)}kg\n`;
                message += `\n`;
            });

            message += `--------------------------------\n`;
            message += `* Delivery: (1kg:350 + extra:80/kg) *\n`;
            message += `ඔබට අවම මිලට Premium brand එකක් සොයා එන්න! 🧴\n`;
            message += `*CHEMIGO Chemicals* - Warakapola\n`;
            message += `Call: 075 88 99 312 / 035 22 600 92`;

            const encodedMessage = encodeURIComponent(message);
            window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');

        } else if (mode === 'print') {
            const win = window.open('', '', 'width=600,height=800');
            const itemsHtml = products.map(p => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px 0;">
                        <span class="bold">${p.name}</span><br>
                        <span style="font-size: 10px; color: #666;">${p.barcode || ''} ${p.weight ? `| ${p.weight.toFixed(3)}kg` : ''}</span>
                    </td>
                    <td class="right" style="padding: 8px 0;">
                        ${p.marketPrice && p.marketPrice > p.sellingPrice ? `<span style="text-decoration: line-through; font-size: 10px; color: #999;">${p.marketPrice.toFixed(2)}</span><br>` : ''}
                        <span class="bold">${p.sellingPrice.toFixed(2)}</span>
                    </td>
                </tr>
            `).join('');

            win.document.write(`
                <html>
                    <head>
                        <title>Chemigo Price List</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
                            .brand { font-size: 32px; font-weight: 800; color: #6366f1; }
                            table { width: 100%; border-collapse: collapse; }
                            th { text-align: left; border-bottom: 2px solid #eee; padding: 10px 0; }
                            .right { text-align: right; }
                            .bold { font-weight: bold; }
                            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="brand">CHEMIGO</div>
                            <div style="font-weight: bold; font-size: 18px;">OFFICIAL PRICE LIST</div>
                            <div>Date: ${new Date().toLocaleDateString()}</div>
                        </div>
                        <table>
                            <thead><tr><th>Item Description</th><th class="right">Price (LKR)</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                        <div class="footer">
                            <p style="font-weight: bold; color: #333;">Delivery Rates: 1kg = 350 LKR | Extra 1kg = 80 LKR</p>
                            <p>13/3 Temple road Pilanduwa, Warakapola</p>
                            <p>075 88 99 312 / 035 22 600 92</p>
                            <p>&copy; ${new Date().getFullYear()} Chemigo Products. All prices are subject to change.</p>
                        </div>
                    </body>
                </html>
            `);
            win.document.close();
            setTimeout(() => { win.print(); win.close(); }, 500);
        }
    },

    // --- Database Backup/Restore ---
    exportDatabase: async (isAuto = false) => {
        const data = {
            products: await db.products.toArray(),
            expenses: await db.expenses.toArray(),
            customers: await db.customers.toArray(),
            sales: await db.sales.toArray(),
            backupDate: new Date().toISOString(),
            version: 2
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.getHours() + "-" + now.getMinutes();
        a.href = url;
        a.download = `Chemigo_Backup_${dateStr}_${timeStr}${isAuto ? '_AUTO' : ''}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (isAuto) {
            localStorage.setItem('lastAutoBackup', dateStr);
        }
        showToast(`Database Backup ${isAuto ? 'Auto-Generated' : 'Downloaded'}`);
    },

    importDatabase: async (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('Warning: This will clear current data and replace it with backup data. Proceed?')) {
                    await db.transaction('rw', [db.products, db.expenses, db.customers, db.sales], async () => {
                        await db.products.clear();
                        await db.expenses.clear();
                        await db.customers.clear();
                        await db.sales.clear();

                        if (data.products) await db.products.bulkAdd(data.products);
                        if (data.expenses) await db.expenses.bulkAdd(data.expenses);
                        if (data.customers) await db.customers.bulkAdd(data.customers);
                        if (data.sales) await db.sales.bulkAdd(data.sales);
                    });
                    showToast('Data Restored Successfully!');
                    setTimeout(() => location.reload(), 1000);
                }
            } catch (err) {
                console.error(err);
                showToast('Invalid backup file', 'error');
            }
        };
        reader.readAsText(file);
    },

    safeExit: async () => {
        if (confirm('Are you sure you want to Exit? A backup will be downloaded automatically.')) {
            await actions.exportDatabase(true);
            setTimeout(() => {
                window.close();
                // Fallback for browsers
                alert('Backup downloaded. You can now close this tab safely.');
            }, 500);
        }
    },

    checkAutoBackup: () => {
        const now = new Date();
        const currentTime = now.getTime();
        const lastBackupTime = parseInt(localStorage.getItem('lastAutoBackupTime') || 0);

        // 2 hours = 7,200,000 ms
        const interval = 2 * 60 * 60 * 1000;

        if (currentTime - lastBackupTime > interval) {
            actions.exportDatabase(true);
            localStorage.setItem('lastAutoBackupTime', currentTime);
        }
    },
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    router.navigate('pos');

    // Auto backup check on start
    actions.checkAutoBackup();
    // Check every 5 minutes
    setInterval(actions.checkAutoBackup, 5 * 60 * 1000);

    // Reminder when closing browser
    window.addEventListener('beforeunload', (e) => {
        // Browser standard reminder
        e.preventDefault();
        e.returnValue = '';
    });
});
