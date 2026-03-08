const ENABLE_SHOP_FEATURE = true;

let state = { tasks: [], categories: [], filterCategory: 'all', filterStatus: 'all', settings: {} };
let calendar = null;
let pendingFiles = []; 
let shopProductsList = []; 
let appStatuses = [];

const CORE_STATUSES = [
    { id: 'task_created', label: 'Task Created', type: 'general', active: true },
    { id: 'order_received', label: 'Order Received', type: 'shop', active: true },
    { id: 'closed_tasks', label: 'Closed Tasks', type: 'general', active: true },
    { id: 'completed_orders', label: 'Completed Orders', type: 'shop', active: true }
];

const CLOSED_STATUSES = ['closed', 'closed_tasks', 'completed_orders'];

function showDialog(mode, message, title = "Attention") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const titleEl = document.getElementById('dialogTitle');
        const msgEl = document.getElementById('dialogMessage');
        const inputEl = document.getElementById('dialogInput');
        const btnCancel = document.getElementById('dialogBtnCancel');
        const btnConfirm = document.getElementById('dialogBtnConfirm');

        titleEl.innerText = title;
        msgEl.innerText = message;
        inputEl.value = '';

        inputEl.classList.add('hidden');
        btnCancel.classList.remove('hidden');
        btnConfirm.innerText = "Confirm";
        btnConfirm.className = "flex-1 py-3.5 text-indigo-600 font-bold text-sm hover:bg-slate-100 transition active:bg-slate-200";

        if (mode === 'alert') {
            btnCancel.classList.add('hidden');
            btnConfirm.innerText = "OK";
        } else if (mode === 'prompt' || mode === 'password') {
            inputEl.type = mode === 'password' ? 'password' : 'text';
            inputEl.classList.remove('hidden');
            btnConfirm.innerText = "Submit";
        }

        if (title.includes("DANGER") || title.includes("CRITICAL") || title.includes("Error")) {
            btnConfirm.className = "flex-1 py-3.5 text-red-600 font-bold text-sm hover:bg-red-50 transition active:bg-red-100";
        }

        overlay.classList.remove('hidden');
        if (mode === 'prompt' || mode === 'password') setTimeout(() => inputEl.focus(), 100);

        const closeDialog = (val) => {
            overlay.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            resolve(val);
        };

        btnConfirm.onclick = () => {
            if (mode === 'prompt' || mode === 'password') closeDialog(inputEl.value);
            else closeDialog(true);
        };
        btnCancel.onclick = () => closeDialog(false);
    });
}

const customAlert = (msg, title="Notice") => showDialog('alert', msg, title);
const customConfirm = (msg, title="Confirm Action") => showDialog('confirm', msg, title);
const customPrompt = (msg, isPassword=false, title="Input Required") => showDialog(isPassword ? 'password' : 'prompt', msg, title);

function getLocalISODate() {
    const d = new Date();
    const localIso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
    return localIso.toISOString().split('T')[0];
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes(' ')) {
        let [d, t] = dateStr.split(' ');
        let p = d.split('-');
        if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]} ${t}`;
    } else {
        let p = dateStr.split('-');
        if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
    }
    return dateStr;
}

function isImage(fileName) {
    if (!fileName) return false;
    const ext = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
}

function openImagePreview(url, fileName) {
    document.getElementById('previewImage').src = url;
    document.getElementById('downloadPreviewBtn').href = url;
    document.getElementById('downloadPreviewBtn').download = fileName;
    document.getElementById('imagePreviewModal').classList.remove('hidden');
}

function isShopOrder(t) {
    try { 
        if(t.custom_data && t.custom_data !== 'null') {
            const custom = JSON.parse(t.custom_data); 
            return custom.task_type === 'shop_order';
        }
    } catch(e) {}
    return false;
}

async function api(action, data = null, isForm = false) {
    let options = { 
        method: data ? 'POST' : 'GET',
        credentials: 'same-origin' 
    };
    if(data && !isForm) options.body = JSON.stringify(data);
    if(data && isForm) options.body = data; 
    
    try {
        const res = await fetch(`api.php?action=${action}`, options);
        if(res.status === 403) { location.reload(); return null; }
        const text = await res.text();
        try { return JSON.parse(text); } catch(err) {
            console.error("JSON Parse Error:", text);
            customAlert("The server returned corrupted data. See console for details.", "Server Error");
            return null;
        }
    } catch (networkErr) {
        console.error("Network Error:", networkErr);
        customAlert("Failed to communicate with the server. Please check your connection.", "Network Error");
        return null;
    }
}

document.getElementById('catSelect').addEventListener('change', handleCatChange);

document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('api.php?action=login', {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({username: document.getElementById('loginUser').value, password: document.getElementById('loginPass').value})
    });
    if(res.ok) { 
        document.getElementById('loginOverlay').remove(); 
        document.getElementById('app').classList.remove('hidden'); 
        initApp(); 
    } else {
        customAlert("Invalid Login credentials.", "Access Denied");
    }
};

function initApp() {
    refresh();
}

async function refresh() {
    const data = await api('get_data');
    if(!data) return; 
    
    state = { ...state, ...data };
    
    state.categories.forEach(c => { if(c.active === undefined || c.active === null) c.active = 1; });
    
    if (state.settings && state.settings.custom_statuses) {
        try { 
            appStatuses = JSON.parse(state.settings.custom_statuses); 
            if(!appStatuses.find(s => s.id === 'task_created')) appStatuses.unshift({ id: 'task_created', label: 'Task Created', type: 'general', active: true });
            if(!appStatuses.find(s => s.id === 'order_received')) appStatuses.unshift({ id: 'order_received', label: 'Order Received', type: 'shop', active: true });
            if(!appStatuses.find(s => s.id === 'closed_tasks')) appStatuses.push({ id: 'closed_tasks', label: 'Closed Tasks', type: 'general', active: true });
            if(!appStatuses.find(s => s.id === 'completed_orders')) appStatuses.push({ id: 'completed_orders', label: 'Completed Orders', type: 'shop', active: true });
        } catch(e) { appStatuses = [...CORE_STATUSES]; }
    } else {
        appStatuses = [...CORE_STATUSES];
    }

    renderFilterDropdowns();
    render();
    renderCategoryDropdown();
    initCalendar();
    checkAutoBackup();
}

function setFilters() {
    state.filterCategory = document.getElementById('filterCategory').value;
    state.filterStatus = document.getElementById('filterStatus').value;
    renderFilterDropdowns(); 
    render();
}

function renderFilterDropdowns() {
    const catSelect = document.getElementById('filterCategory');
    const statusSelect = document.getElementById('filterStatus');

    let catOptions = `<option value="all">All Categories</option>`;
    
    if (ENABLE_SHOP_FEATURE) {
        const shopCount = state.tasks.filter(t => {
            if(!isShopOrder(t)) return false;
            let statusMatch = false;
            if(state.filterStatus === 'all') { statusMatch = !CLOSED_STATUSES.includes(t.status); }
            else if (state.filterStatus === 'completed_orders') { statusMatch = (t.status === 'completed_orders' || t.status === 'closed'); }
            else { statusMatch = (t.status === state.filterStatus); }
            return statusMatch;
        }).length;
        catOptions += `<option value="shop_order">🛍️ Shop Orders (${shopCount})</option>`;
    }
    
    state.categories.forEach(c => {
        if(c.active == 1 || state.filterCategory == c.id) {
            const count = state.tasks.filter(t => {
                if(isShopOrder(t) || t.category_id != c.id) return false;
                let statusMatch = false;
                if(state.filterStatus === 'all') { statusMatch = !CLOSED_STATUSES.includes(t.status); }
                else if (state.filterStatus === 'closed_tasks') { statusMatch = (t.status === 'closed_tasks' || t.status === 'closed'); }
                else { statusMatch = (t.status === state.filterStatus); }
                return statusMatch;
            }).length;
            catOptions += `<option value="${c.id}">${c.name} (${count})</option>`;
        }
    });
    
    if(catSelect) {
        catSelect.innerHTML = catOptions;
        catSelect.value = state.filterCategory;
    }

    let statusOptions = `<option value="all">All Statuses (Active)</option>`;
    appStatuses.forEach(s => {
        if(s.active || state.filterStatus == s.id) {
            if (!ENABLE_SHOP_FEATURE && s.type === 'shop') return;

            const count = state.tasks.filter(t => {
                const isOrder = isShopOrder(t);
                let catMatch = (state.filterCategory === 'all') || 
                               (state.filterCategory === 'shop_order' && isOrder) || 
                               (state.filterCategory == t.category_id && !isOrder);
                
                let statusMatch = (t.status === s.id);
                
                if (s.id === 'closed_tasks' && t.status === 'closed' && !isOrder) statusMatch = true;
                if (s.id === 'completed_orders' && t.status === 'closed' && isOrder) statusMatch = true;

                return statusMatch && catMatch;
            }).length;
            statusOptions += `<option value="${s.id}">${s.label} (${count})</option>`;
        }
    });
    
    if(statusSelect) {
        statusSelect.innerHTML = statusOptions;
        statusSelect.value = state.filterStatus;
    }
}

function openCategoryManager() {
    renderCategoryManagerList();
    document.getElementById('categoryManagerModal').classList.remove('hidden');
}

function renderCategoryManagerList() {
    const container = document.getElementById('categoryManagerList');
    if (state.categories.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-sm text-center p-4 font-bold">No categories created yet.</p>';
        return;
    }
    container.innerHTML = state.categories.map((c) => `
        <div class="flex justify-between items-center p-3 border-b border-slate-100 bg-white hover:bg-slate-50 transition">
            <span class="text-sm font-bold text-slate-700">${c.name}</span>
            <button onclick="toggleCategoryActive(${c.id})" class="text-[10px] uppercase font-black px-2 py-1 rounded shadow-sm transition ${c.active == 1 ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}">
                ${c.active == 1 ? 'Active' : 'Retired'}
            </button>
        </div>
    `).join('');
}

async function toggleCategoryActive(id) {
    const cat = state.categories.find(c => c.id == id);
    const newActive = cat.active == 1 ? 0 : 1;
    cat.active = newActive;
    await api('toggle_category', { id: id, active: newActive });
    renderCategoryManagerList();
    renderFilterDropdowns();
    render(); 
}

function openNewCatModal() {
    closeModal('categoryManagerModal');
    document.getElementById('newCatModal').classList.remove('hidden');
}

function openStatusManager() {
    renderStatusManagerList();
    document.getElementById('statusManagerModal').classList.remove('hidden');
}

function renderStatusManagerList() {
    const container = document.getElementById('statusManagerList');
    container.innerHTML = appStatuses.map((s) => {
        if (!ENABLE_SHOP_FEATURE && s.type === 'shop') return ''; 
        return `
        <div class="flex justify-between items-center p-3 border-b border-slate-100 bg-white hover:bg-slate-50 transition">
            <span class="text-sm font-bold text-slate-700">${s.label} <small class="text-slate-400 font-normal">(${s.type})</small></span>
            <button onclick="toggleStatusActive('${s.id}')" class="text-[10px] uppercase font-black px-2 py-1 rounded shadow-sm transition ${s.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}">
                ${s.active ? 'Active' : 'Retired'}
            </button>
        </div>
    `}).join('');
}

async function toggleStatusActive(statusId) {
    const idx = appStatuses.findIndex(s => s.id === statusId);
    if (idx > -1) {
        appStatuses[idx].active = !appStatuses[idx].active;
        await api('save_settings', { key: 'custom_statuses', value: JSON.stringify(appStatuses) });
        renderStatusManagerList();
        renderFilterDropdowns();
        render(); 
    }
}

async function addNewStatus() {
    const label = document.getElementById('newStatusLabel').value.trim();
    const type = document.getElementById('newStatusType').value;
    if (!label) return customAlert("Please enter a name for the new status.", "Name Required");
    
    const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.floor(Math.random() * 1000);
    appStatuses.push({ id, label, type, active: true });
    
    await api('save_settings', { key: 'custom_statuses', value: JSON.stringify(appStatuses) });
    document.getElementById('newStatusLabel').value = '';
    renderStatusManagerList();
    refresh();
}

function renderTaskCard(t, isBannerChild = false) {
    let borderColor = 'border-indigo-500'; 
    if(t.status === 'on_hold') borderColor = 'border-orange-400';
    if(['meeting_set', 'meeting_done', 'delivered'].includes(t.status)) borderColor = 'border-emerald-400';
    if(t.status.includes('karigar') || t.status === 'order_received') borderColor = 'border-yellow-400'; 
    if(CLOSED_STATUSES.includes(t.status)) borderColor = 'border-slate-300'; 

    let isOrder = isShopOrder(t);
    let displayId = `TSK-${String(t.id).padStart(4, '0')}`;
    if (isOrder) {
        try { const custom = JSON.parse(t.custom_data); if(custom['Order No']) displayId = custom['Order No']; } catch(e){}
    }
    
    let displayLabel = t.status.replace(/_/g, ' ');
    if (t.status === 'closed') displayLabel = isOrder ? 'Completed Orders' : 'Closed Tasks';
    
    const sObj = appStatuses.find(s => s.id === t.status);
    if(sObj) displayLabel = sObj.label;

    const catLabel = isOrder ? '🛍️ Shop' : (t.cat_name || 'General');
    const opacityClass = isBannerChild ? 'opacity-70 hover:opacity-100' : '';
    const bgClass = CLOSED_STATUSES.includes(t.status) ? 'bg-slate-50' : 'bg-white';

    return `
    <div onclick="openTaskView(${t.id})" class="${bgClass} p-4 md:p-5 rounded-xl shadow-sm ${borderColor} cursor-pointer border hover:shadow-md transition ${opacityClass}" style="border-left-width: 8px;">
        <div class="flex justify-between items-center mb-2.5">
            <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded tracking-wider">${displayId}</span>
                <span class="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[100px]">${catLabel}</span>
            </div>
            <span class="text-[9px] font-black text-slate-300 uppercase">${formatDate(t.due_date) || ''}</span>
        </div>
        <h3 class="font-bold text-slate-800 leading-tight mb-1 text-sm md:text-base line-clamp-2">${t.title || 'Untitled'}</h3>
        ${t.recurrence && t.recurrence !== 'none' ? `<span class="text-[9px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded font-bold uppercase inline-block mb-1 mt-1">🔁 ${t.recurrence}</span>` : ''}
        ${t.mini_due_date ? `<div class="mt-1.5"><span class="text-[9px] bg-yellow-50 text-yellow-700 px-2 py-1 rounded font-bold uppercase border border-yellow-200">🗓️ Next: ${formatDate(t.mini_due_date)}</span></div>` : ''}
        ${state.filterStatus === 'all' || isBannerChild ? `<span class="text-[9px] bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold uppercase mt-2 inline-block w-max">${displayLabel}</span>` : ''}
    </div>`;
}

function render() {
    const searchEl = document.getElementById('search');
    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    
    let activeMatches = [];
    let closedMatches = [];
    
    state.tasks.forEach(t => {
        const isOrder = isShopOrder(t);
        const isClosed = CLOSED_STATUSES.includes(t.status);
        
        let catMatch = false;
        if (state.filterCategory === 'all') { catMatch = true; } 
        else if (state.filterCategory === 'shop_order') { catMatch = isOrder; } 
        else { catMatch = (t.category_id == state.filterCategory && !isOrder); }

        let statusMatch = false;
        if (state.filterStatus === 'all') {
            if (query) { statusMatch = true; } 
            else { statusMatch = !isClosed; }  
        } else {
            statusMatch = (t.status === state.filterStatus);
            if (state.filterStatus === 'closed_tasks' && t.status === 'closed' && !isOrder) statusMatch = true;
            if (state.filterStatus === 'completed_orders' && t.status === 'closed' && isOrder) statusMatch = true;
        }
        
        if (!catMatch || !statusMatch) return;
        
        let textMatch = true;
        if (query) {
            const titleMatch = (t.title || '').toLowerCase().includes(query);
            const descMatch = (t.description || '').toLowerCase().includes(query);
            const customMatch = (t.custom_data || '').toLowerCase().includes(query);
            const catTextMatch = (t.cat_name || '').toLowerCase().includes(query);
            
            let searchId = `tsk-${t.id}`;
            if(isOrder) {
                try { const cd = JSON.parse(t.custom_data); if(cd['Order No']) searchId = cd['Order No'].toLowerCase(); } catch(e){}
            }
            textMatch = titleMatch || descMatch || customMatch || catTextMatch || searchId.includes(query);
        }

        if (textMatch) {
            if (isClosed) closedMatches.push(t);
            else activeMatches.push(t);
        }
    });
    
    const sortFn = (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    activeMatches.sort(sortFn);
    closedMatches.sort(sortFn);
    
    let html = activeMatches.map(t => renderTaskCard(t, false)).join('');
    
    if (query && closedMatches.length > 0) {
        html += `<div class="col-span-full mt-4 mb-2 border-t-2 border-slate-200 pt-5"><h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><span>📦</span> Closed / Completed Matches (${closedMatches.length})</h3></div>`;
        html += closedMatches.map(t => renderTaskCard(t, true)).join('');
    } else if (state.filterStatus !== 'all' && closedMatches.length > 0) {
        html += closedMatches.map(t => renderTaskCard(t, false)).join('');
    }
    
    document.getElementById('taskGrid').innerHTML = html || '<div class="col-span-full p-10 text-center text-slate-400 font-bold">No entries found.</div>';
}

function addFilesToQueue(inputElement, type) {
    for(let i = 0; i < inputElement.files.length; i++) { pendingFiles.push(inputElement.files[i]); }
    inputElement.value = ""; 
    renderFileQueue(type);
}
function removeQueuedFile(index, type) {
    pendingFiles.splice(index, 1); renderFileQueue(type);
}
function renderFileQueue(type) {
    const containerId = type === 'new' ? 'newTaskFileList' : 'updateTaskFileList';
    const container = document.getElementById(containerId);
    if(pendingFiles.length === 0) { container.innerHTML = ""; return; }
    container.innerHTML = pendingFiles.map((file, idx) => `
        <div class="flex justify-between items-center bg-white p-1 px-2 border rounded shadow-sm text-[10px] text-slate-600">
            <span class="truncate pr-2 max-w-[180px]">${file.name}</span>
            <button type="button" onclick="removeQueuedFile(${idx}, '${type}')" class="text-red-500 font-black text-xs hover:text-red-700">&times;</button>
        </div>
    `).join('');
}

function openBackupModal() {
    const s = state.settings || {};
    if(s.last_backup_time) { document.getElementById('lblBackupDate').innerText = new Date(parseInt(s.last_backup_time) * 1000).toLocaleString(); } 
    else { document.getElementById('lblBackupDate').innerText = "Never"; }
    
    const statusEl = document.getElementById('lblBackupStatus');
    statusEl.innerText = s.last_backup_status || 'N/A';
    statusEl.className = (s.last_backup_status === 'Success') ? 'text-[10px] font-bold text-emerald-500' : 'text-[10px] font-bold text-red-500 max-w-[150px] truncate';

    document.getElementById('cfg_backup_email').value = s.backup_email || '';
    document.getElementById('cfg_backup_pass').value = s.backup_password || '';
    document.getElementById('cfg_backup_recv').value = s.backup_receiver || '';
    document.getElementById('backupModal').classList.remove('hidden');
}

document.getElementById('backupConfigForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        backup_email: document.getElementById('cfg_backup_email').value,
        backup_password: document.getElementById('cfg_backup_pass').value,
        backup_receiver: document.getElementById('cfg_backup_recv').value
    };
    await api('save_backup_settings', data);
    customAlert("Your email configurations have been securely saved.", "Saved Successfully");
    refresh();
};

async function triggerManualEmail() {
    const btn = document.getElementById('btnManualEmail');
    btn.innerText = "⏳ Sending..."; btn.disabled = true;
    const res = await api('trigger_backup');
    if (res && res.status === 'success') await customAlert("Your database has been successfully emailed to you.", "Backup Sent");
    else await customAlert((res && res.message) ? res.message : "Failed to send email.", "Backup Error");
    
    btn.innerText = "📧 Email Backup Now"; btn.disabled = false;
    refresh(); openBackupModal(); 
}

function checkAutoBackup() {
    const s = state.settings;
    if (!s || !s.backup_email || !s.backup_receiver) return;
    const lastTime = parseInt(s.last_backup_time || 0);
    const now = Math.floor(Date.now() / 1000);
    if (now - lastTime >= 86400) {
        state.settings.last_backup_time = now; 
        api('trigger_backup').then(res => console.log("Auto-backup result:", res?.status));
    }
}

// --- NEW ADD SELECTION MODAL LOGIC ---
function openAddTypeModal() {
    if (!ENABLE_SHOP_FEATURE) {
        openNewTask('general');
    } else {
        document.getElementById('addTypeModal').classList.remove('hidden');
    }
}

function openNewTask(mode = 'general') { 
    closeModal('addTypeModal');
    document.getElementById('taskForm').reset(); 
    document.getElementById('customFields').innerHTML = ""; 
    document.getElementById('dueDateInput').value = getLocalISODate(); 
    pendingFiles = []; shopProductsList = [];
    renderFileQueue('new'); renderProductUI();
    renderCategoryDropdown();
    toggleTaskMode(mode); 
    document.getElementById('taskModal').classList.remove('hidden'); 
}

function toggleTaskMode(mode) {
    try {
        const flag = document.getElementById('taskTypeFlag');
        
        if (mode === 'shop') {
            document.getElementById('generalTitleBlock').classList.add('hidden');
            document.getElementById('generalOptionsBlock').classList.add('hidden'); 
            document.getElementById('shopOrderBlock').classList.remove('hidden');
            
            document.getElementById('gen_title').required = false;
            document.getElementById('so_customer').required = true;
            document.getElementById('entryModalTitle').innerText = "Create Shop Order";
            flag.value = 'shop_order';
            
            let maxOrd = 0;
            state.tasks.forEach(t => {
                if (t.custom_data) {
                    try {
                        const custom = JSON.parse(t.custom_data);
                        if (custom['Order No']) {
                            const match = custom['Order No'].match(/ORD-(\d+)/);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > maxOrd) maxOrd = num;
                            }
                        }
                    } catch(e){}
                }
            });
            
            const nextOrd = maxOrd + 1;
            document.getElementById('so_order_no').value = `ORD-${String(nextOrd).padStart(3, '0')}`;
            
            if(!document.getElementById('so_order_date').value) {
                document.getElementById('so_order_date').value = getLocalISODate();
            }
            
            document.getElementById('catSelect').value = "";
            document.getElementById('taskForm').elements['recurrence'].value = "none";
            document.getElementById('customFields').innerHTML = ""; 
            
        } else {
            document.getElementById('generalTitleBlock').classList.remove('hidden');
            document.getElementById('generalOptionsBlock').classList.remove('hidden'); 
            document.getElementById('shopOrderBlock').classList.add('hidden');
            
            document.getElementById('gen_title').required = true;
            document.getElementById('so_customer').required = false;
            document.getElementById('entryModalTitle').innerText = "Create General Task";
            flag.value = 'general';
        }
    } catch(err) { console.error(err); }
}

function addProductRow() {
    const name = document.getElementById('prodName').value.trim();
    const qtyStr = document.getElementById('prodQty').value.trim();
    const priceStr = document.getElementById('prodPrice').value.trim();
    if(!name) return;

    const qty = parseFloat(qtyStr) || 1;
    const price = parseFloat(priceStr) || 0;
    const total = qty * price;

    shopProductsList.push({ name, qty, price, total });
    document.getElementById('prodName').value = '';
    document.getElementById('prodQty').value = '';
    document.getElementById('prodPrice').value = '';
    renderProductUI();
}

function removeProductRow(index) {
    shopProductsList.splice(index, 1); renderProductUI();
}

function renderProductUI() {
    const container = document.getElementById('prodListUI');
    let grandTotal = 0;

    container.innerHTML = shopProductsList.map((p, i) => {
        grandTotal += p.total;
        let displayStr = `${p.name} x ${p.qty}`;
        if (p.price > 0) displayStr += ` @ ₹${p.price} = ₹${p.total}`;

        return `
        <div class="flex justify-between items-center text-xs bg-white border p-1 px-2 rounded text-slate-700 font-medium shadow-sm">
            <span>${displayStr}</span>
            <button type="button" class="text-red-500 font-bold hover:text-red-700" onclick="removeProductRow(${i})">&times;</button>
        </div>
        `;
    }).join('');

    const strList = shopProductsList.map(p => {
        let s = `${p.name} x ${p.qty}`;
        if (p.price > 0) s += ` @ ₹${p.price} = ₹${p.total}`;
        return s;
    });
    document.getElementById('hiddenProductsStr').value = strList.join(' | ');

    const totalInput = document.getElementById('so_total');
    if (totalInput) {
        if (shopProductsList.length > 0) totalInput.value = grandTotal;
        else totalInput.value = '';
        calcBal();
    }
}

function calcBal() {
    const t = parseFloat(document.getElementById('so_total').value) || 0;
    const p = parseFloat(document.getElementById('so_paid').value) || 0;
    document.getElementById('so_bal').value = t - p;
}

async function processTaskUpdate(formEl, overrideStatus = null) {
    const currentTaskId = document.getElementById('updateId').value;
    const currentTask = state.tasks.find(x => x.id == currentTaskId);
    const statusSelect = document.getElementById('statusSelect');
    
    let newStatus = overrideStatus || statusSelect.value;

    if (overrideStatus) {
        const isClosing = CLOSED_STATUSES.includes(overrideStatus);
        let msg = isClosing ? "✅ Are you sure you want to mark this as completed/closed?" : "🔄 Are you sure you want to Reopen this?";
        const confirmed = await customConfirm(msg, isClosing ? "Confirm Action" : "Confirm Reopen");
        if(!confirmed) return;
        
        if(!Array.from(statusSelect.options).some(o => o.value === overrideStatus)) {
            statusSelect.add(new Option(overrideStatus, overrideStatus));
        }
        statusSelect.value = overrideStatus;
        
        const commentBox = formEl.querySelector('textarea[name="comment"]');
        if(!commentBox.value.trim()) {
            commentBox.value = isClosing ? "Task Closed." : "Task Reopened.";
        }
    } else {
        const isClosing = CLOSED_STATUSES.includes(newStatus);
        const wasClosed = CLOSED_STATUSES.includes(currentTask.status);
        
        if (isClosing && !wasClosed) {
            const confirmed = await customConfirm("✅ Are you sure you want to mark this as Completed/Closed?", "Confirm Completion");
            if (!confirmed) return;
        }
        if (!isClosing && wasClosed) {
            const confirmed = await customConfirm("🔄 Are you sure you want to Reopen this task?", "Reopen Task");
            if (!confirmed) return;
        }
    }
    
    handleFormSubmit(formEl, 'update_status');
}

function toggleTaskCloseStatus() {
    const currentTaskId = document.getElementById('updateId').value;
    const currentTask = state.tasks.find(x => x.id == currentTaskId);
    if(!currentTask) return;
    
    const isOrder = isShopOrder(currentTask);
    const isClosed = CLOSED_STATUSES.includes(currentTask.status);
    const targetStatus = isClosed ? (isOrder ? 'order_received' : 'task_created') : (isOrder ? 'completed_orders' : 'closed_tasks');
    
    processTaskUpdate(document.getElementById('updateForm'), targetStatus);
}

document.getElementById('updateForm').onsubmit = (e) => {
    e.preventDefault();
    try {
        processTaskUpdate(e.target, null);
    } catch (err) {
        customAlert("Update Logic Error: " + err.message, "System Error");
    }
    return false; 
};


async function openTaskView(id) {
    try {
        const data = await api(`get_task_details&id=${id}`);
        if (!data || !data.task) return customAlert("Task not found in database.", "Error");
        
        const t = data.task;
        pendingFiles = []; renderFileQueue('update');

        document.getElementById('updateId').value = t.id; 
        document.getElementById('viewTitle').innerText = t.title || 'Untitled'; 
        document.getElementById('viewDesc').innerText = t.description || 'No notes provided.'; 
        document.getElementById('updateMiniDueDate').value = t.mini_due_date || ''; 

        const isOrder = isShopOrder(t);
        let custom = {};
        let displayId = `TSK-${String(t.id).padStart(4, '0')}`;
        
        try { 
            if(t.custom_data && t.custom_data !== 'null') {
                custom = JSON.parse(t.custom_data); 
                if(custom.task_type === 'shop_order' && custom['Order No']) {
                    displayId = custom['Order No'];
                }
            }
        } catch(e) {}

        const statusSelect = document.getElementById('statusSelect');
        let optionsHtml = '';
        
        const isClosed = CLOSED_STATUSES.includes(t.status);
        
        if (isClosed) {
            optionsHtml += `<option value="${isOrder ? 'order_received' : 'task_created'}">🔄 Reopen Task</option>`;
        }
        
        const currentStatusObj = appStatuses.find(s => s.id === t.status);
        if (currentStatusObj && !currentStatusObj.active) {
            optionsHtml += `<option value="${currentStatusObj.id}">${currentStatusObj.label} (Retired)</option>`;
        } else if (!currentStatusObj && !CORE_STATUSES.some(s=>s.id === t.status) && t.status !== 'open') {
            optionsHtml += `<option value="${t.status}">${t.status.replace(/_/g, ' ').toUpperCase()} (System)</option>`;
        }

        const activeStatuses = appStatuses.filter(s => s.active && (s.type === 'both' || (isOrder ? s.type === 'shop' : s.type === 'general')));
        activeStatuses.forEach(s => {
            optionsHtml += `<option value="${s.id}">${s.label}</option>`;
        });

        statusSelect.innerHTML = optionsHtml;
        
        let visualDropdownStatus = t.status;
        if (t.status === 'closed') {
            visualDropdownStatus = isOrder ? 'completed_orders' : 'closed_tasks';
        }
        statusSelect.value = visualDropdownStatus; 
        
        statusSelect.onchange = function() {
            const block = document.getElementById('deliveryMethodBlock');
            const input = document.getElementById('deliveryMethodInput');
            if(this.value === 'delivered') { block.classList.remove('hidden'); input.required = true; }
            else { block.classList.add('hidden'); input.required = false; }
        };
        statusSelect.onchange(); 

        const btnToggleClose = document.getElementById('btnToggleClose');
        if (isClosed) {
            btnToggleClose.innerHTML = "🔄 Reopen Task";
            btnToggleClose.className = "w-full bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold shadow hover:bg-orange-600 transition";
        } else {
            btnToggleClose.innerHTML = "✅ " + (isOrder ? "Complete Order" : "Close Task");
            btnToggleClose.className = "w-full bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold shadow hover:bg-emerald-700 transition";
        }

        const catLabel = isOrder ? '🛍️ Shop Order' : (t.cat_name || 'General');
        
        let metaHtml = `<span class="text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded font-black uppercase tracking-wider shadow-sm">${displayId}</span>`;
        metaHtml += `<span class="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-black uppercase text-slate-500">${catLabel}</span>`;
        
        if (t.due_date) {
            metaHtml += `<span class="text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded font-black uppercase tracking-wider shadow-sm">📅 Due: ${formatDate(t.due_date)}</span>`;
        }

        if(t.recurrence && t.recurrence !== 'none') { 
            metaHtml += `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-black uppercase tracking-wider">🔁 ${t.recurrence}</span>`; 
        }
        document.getElementById('viewMeta').innerHTML = metaHtml;
        
        document.getElementById('viewCustomData').innerHTML = Object.entries(custom).map(([k,v]) => {
            if(k === 'task_type' || !v) return '';
            if(k === 'Products') {
                const prodHtml = v.split(' | ').map(x => `<li class="ml-3 list-disc">${x}</li>`).join('');
                return `<div class="col-span-full"><b class="block text-[8px] uppercase text-slate-400 font-black">${k}</b><ul class="text-xs sm:text-sm font-semibold text-slate-700 mt-1">${prodHtml}</ul></div>`;
            }
            return `<div><b class="block text-[8px] uppercase text-slate-400 font-black">${k}</b><span class="text-xs sm:text-sm font-semibold text-slate-700 break-words">${v}</span></div>`;
        }).join('');
        
        document.getElementById('historyTimeline').innerHTML = data.history.map(h => {
            let badgeColor = 'bg-indigo-50 text-indigo-600';
            if(h.status === 'on_hold') badgeColor = 'bg-orange-100 text-orange-600';
            if(['meeting_set', 'meeting_done', 'delivered', 'received_from_karigar'].includes(h.status)) badgeColor = 'bg-emerald-100 text-emerald-700';
            if(['sent_to_karigar', 'order_received'].includes(h.status)) badgeColor = 'bg-yellow-100 text-yellow-800';
            if(CLOSED_STATUSES.includes(h.status)) badgeColor = 'bg-slate-200 text-slate-600';

            let dynamicLabel = h.status.replace(/_/g, ' ');
            const sObj = appStatuses.find(s => s.id === h.status);
            if(sObj) dynamicLabel = sObj.label;

            let filesLinks = '';
            if (h.file_name && h.file_name !== '[]') {
                try {
                    const files = JSON.parse(h.file_name);
                    if(Array.isArray(files)) {
                        files.forEach(f => { 
                            const fileUrl = `uploads_x9kLp7_2026/${f}`;
                            if(isImage(f)) {
                                filesLinks += `<button type="button" onclick="openImagePreview('${fileUrl}', '${f}')" class="text-[9px] text-indigo-600 font-bold underline mt-1.5 block w-max bg-indigo-50 px-2 py-1 rounded transition hover:bg-indigo-100">🖼️ View Image</button>`;
                            } else {
                                filesLinks += `<a href="${fileUrl}" target="_blank" download class="text-[9px] text-indigo-600 font-bold underline mt-1.5 block w-max bg-indigo-50 px-2 py-1 rounded transition hover:bg-indigo-100">📎 Download File</a>`;
                            }
                        });
                    }
                } catch(e) {
                    const f = h.file_name;
                    const fileUrl = `uploads_x9kLp7_2026/${f}`;
                    if(isImage(f)) {
                        filesLinks = `<button type="button" onclick="openImagePreview('${fileUrl}', '${f}')" class="text-[9px] text-indigo-600 font-bold underline mt-1.5 block w-max bg-indigo-50 px-2 py-1 rounded transition hover:bg-indigo-100">🖼️ View Image</button>`;
                    } else {
                        filesLinks = `<a href="${fileUrl}" target="_blank" download class="text-[9px] text-indigo-600 font-bold underline mt-1.5 block w-max bg-indigo-50 px-2 py-1 rounded transition hover:bg-indigo-100">📎 Download File</a>`;
                    }
                }
            }

            return `
            <div class="relative">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 ${badgeColor} rounded">${dynamicLabel}</span>
                    <span class="text-[9px] text-slate-400 font-bold">${formatDate(h.created_at)}</span>
                </div>
                <p class="text-sm text-slate-600 leading-snug">${h.comment}</p>
                ${filesLinks}
            </div>
        `}).join('') || '<p class="text-slate-300 italic text-sm">No lifecycle steps recorded.</p>';
        
        document.getElementById('updateModal').classList.remove('hidden');
    } catch (err) {
        console.error(err); customAlert("Failed to load task from server.", "Connection Error");
    }
}

async function handleFormSubmit(formEl, apiAction) {
    try {
        const fd = new FormData(formEl);
        const data = { custom_fields: {} };
        
        const flag = document.getElementById('taskTypeFlag') ? document.getElementById('taskTypeFlag').value : '';
        const isShop = (flag === 'shop_order');

        if(apiAction === 'add_task') {
            if(isShop) {
                const customer = document.getElementById('so_customer').value;
                const orderNo = document.getElementById('so_order_no').value;
                data.title = `Order: ${customer} (${orderNo})`;
                data.status = 'order_received'; 
            } else {
                data.title = document.getElementById('gen_title').value;
                data.status = 'task_created'; 
            }
        }

        fd.forEach((v, k) => { 
            if(k.startsWith('custom_') && v.trim() !== '') {
                const customKey = k.replace('custom_','');
                const shopFields = ['Order No', 'Order Date', 'Phone 1', 'Phone 2', 'Address', 'Products', 'Total Amount', 'Paid Amount', 'Balance', 'Reference'];
                if (!isShop && shopFields.includes(customKey)) return;
                data.custom_fields[customKey] = v; 
            } else if(k !== 'files[]' && !k.startsWith('custom_')) {
                if(k === 'title' && apiAction === 'add_task' && isShop) return; 
                data[k] = v; 
            }
        });

        if (apiAction === 'update_status' && data.status === 'delivered') {
            const method = document.getElementById('deliveryMethodInput').value;
            data.comment = `[Delivery: ${method}] \n${data.comment}`;
        }

        const payload = new FormData(); 
        payload.append('data', JSON.stringify(data));
        pendingFiles.forEach(file => { payload.append('files[]', file); });

        const resData = await api(apiAction, payload, true);
        
        if (resData && resData.status === 'success') {
            pendingFiles = []; 
            closeModal(formEl.closest('div[id$="Modal"]').id);
            document.getElementById('search').value = "";
            if (formEl.id === 'taskForm') formEl.reset(); 
            refresh();
        } else {
            customAlert("Data was saved but server reported an error.", "Warning");
            refresh();
        }
    } catch (err) {
        console.error(err);
        customAlert("Failed to Process: " + err.message, "System Error");
    }
}

document.getElementById('taskForm').onsubmit = (e) => {
    e.preventDefault();
    try { handleFormSubmit(e.target, 'add_task'); } catch(err) { customAlert("Error: " + err.message); }
    return false;
};

async function secureDeleteTask() {
    const pass = await customPrompt("This will permanently erase this task and all attached files.\n\nEnter your login password to confirm:", true, "DANGER: Authentication Required");
    if (!pass) return; 
    
    const id = document.getElementById('updateId').value;
    const res = await fetch('api.php?action=delete_task', { 
        method: 'POST', 
        credentials: 'same-origin',
        body: JSON.stringify({ id, password: pass }) 
    });
    
    if (res.ok) {
        try {
            const data = await res.json();
            if(data.error) { await customAlert("ERROR: " + data.error, "Failed"); return; }
            closeModal('updateModal'); refresh();
        } catch (e) { customAlert("Server connection broke during deletion.", "Network Error"); }
    } else { 
        await customAlert("Incorrect password or Session expired. Task deletion aborted.", "Verification Failed"); 
    }
}

async function saveNewCategory() {
    try {
        const nameEl = document.getElementById('newCatName');
        const fieldsEl = document.getElementById('newCatFields');
        
        const name = nameEl.value.trim();
        if(!name) { return await customAlert("Please enter a category name.", "Input Required"); }
        
        const fieldsValue = fieldsEl.value;
        const fields = fieldsValue ? fieldsValue.split(',').map(f => f.trim()).filter(f => f) : [];
        
        const res = await api('add_category', { name, fields });
        
        if(res && res.id) { 
            closeModal('newCatModal'); 
            nameEl.value = ""; 
            fieldsEl.value = "";
            await refresh(); 
            
            const selectEl = document.getElementById('catSelect');
            if (selectEl) selectEl.value = res.id;
            renderCustomFields();
        } else {
            await customAlert("Server did not return a valid Category ID.", "Error");
        }
    } catch (err) {
        console.error("Save Category Error:", err);
        await customAlert("A network or server error occurred.", "Error");
    }
}

async function runPurge() {
    const d = document.getElementById('purgeDate').value;
    if(!d) return await customAlert("Please select a date first.", "Date Required");
    
    const confirmed = await customConfirm(`Are you sure you want to PERMANENTLY DELETE all tasks and files older than ${formatDate(d)}?`, "CRITICAL: Permanent Deletion");
    if(!confirmed) return;
    
    await api(`purge&date=${d}`);
    closeModal('purgeModal'); refresh();
}

function handleCatChange() {
    const select = document.getElementById('catSelect');
    if(select.value === 'NEW') { select.value = ""; document.getElementById('newCatModal').classList.remove('hidden'); }
    else renderCustomFields();
}

function renderCustomFields() {
    const select = document.getElementById('catSelect');
    const cat = state.categories.find(c => c.id == select.value);
    const container = document.getElementById('customFields');
    container.innerHTML = "";
    if(cat && cat.custom_fields) {
        JSON.parse(cat.custom_fields).forEach(f => {
            container.innerHTML += `<div><label class="text-[9px] font-bold text-slate-400 uppercase block mb-1">${f}</label><input type="text" name="custom_${f}" class="w-full border p-2 rounded-lg bg-slate-50 text-sm outline-indigo-500"></div>`;
        });
    }
}

function renderCategoryDropdown(currentCategoryId = null) {
    const select = document.getElementById('catSelect');
    const currentValue = currentCategoryId || select.value;
    
    let optionsHtml = '<option value="">-- Choose Category --</option>';
    state.categories.forEach(c => {
        if (c.active == 1 || c.id == currentValue) {
            optionsHtml += `<option value="${c.id}">${c.name}</option>`;
        }
    });
    optionsHtml += '<option value="NEW" class="text-indigo-600 font-bold">+ CREATE NEW...</option>';
    
    select.innerHTML = optionsHtml;
    if(currentValue) select.value = currentValue;
}

function openPurge() { document.getElementById('purgeModal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showView(v) { document.getElementById('boardView').classList.toggle('hidden', v !== 'board'); document.getElementById('calendarView').classList.toggle('hidden', v !== 'calendar'); if(v==='calendar' && calendar) calendar.render(); }

function initCalendar() {
    let events = [];
    state.tasks.forEach(t => {
        if(CLOSED_STATUSES.includes(t.status) && state.filterStatus !== t.status) return;

        let color = '#4f46e5'; 
        if (t.status === 'on_hold') color = '#fb923c'; 
        if (['meeting_set', 'meeting_done', 'delivered'].includes(t.status)) color = '#34d399'; 
        if (t.status.includes('karigar') || t.status === 'order_received') color = '#facc15';
        if (CLOSED_STATUSES.includes(t.status)) color = '#cbd5e1';

        if (t.due_date) events.push({ id: t.id, title: t.title, start: t.due_date, color: color }); 
        if (t.mini_due_date) events.push({ id: t.id, title: '🗓️ ' + t.title, start: t.mini_due_date, color: '#eab308' });
    });

    const isMobile = window.innerWidth < 768; 
    if (calendar) calendar.destroy();

    calendar = new FullCalendar.Calendar(document.getElementById('calendarView'), {
        initialView: isMobile ? 'listMonth' : 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        contentHeight: 'auto',
        events: events,
        eventClick: (info) => { openTaskView(info.event.id); },
        windowResize: function(arg) {
            if (window.innerWidth < 768) calendar.changeView('listMonth');
            else calendar.changeView('dayGridMonth');
        }
    });
}

window.onclick = (e) => { 
    if(e.target.classList.contains('fixed') && e.target.id !== 'customDialogOverlay') {
        e.target.classList.add('hidden'); 
    }
}
function logout() { fetch('api.php?action=logout'); location.reload(); }
setInterval(async () => { const res = await fetch('api.php?action=get_data', {credentials: 'same-origin'}); if(res.status === 403) location.reload(); }, 60000);

window.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length > 0 && (state.filterCategory !== 'all' || state.filterStatus !== 'all')) {
                state.filterCategory = 'all';
                state.filterStatus = 'all';
                renderFilterDropdowns();
            }
            render();
        });
    }

    try {
        const res = await fetch('api.php?action=check_auth', {credentials: 'same-origin'});
        if (res.ok) {
            const loginOverlay = document.getElementById('loginOverlay');
            if(loginOverlay) loginOverlay.remove();
            document.getElementById('app').classList.remove('hidden');
            initApp();
        }
    } catch(err) { console.log("Not logged in or network error"); }
});