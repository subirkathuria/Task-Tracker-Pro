let state = { tasks: [], categories: [], filter: 'open', settings: {} };
let calendar = null;
let pendingFiles = []; 
let shopProductsList = []; 

const DEFAULT_TABS = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Gen: Open' },
    { id: 'order_received', label: 'Order Recv' },
    { id: 'sent_to_karigar', label: 'At Karigar' },
    { id: 'received_from_karigar', label: 'From Karigar' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'reply_sent', label: 'Reply Sent' },
    { id: 'waiting_for_reply', label: 'Waiting Reply' },
    { id: 'reply_received', label: 'Reply Received' },
    { id: 'meeting_set', label: 'Meeting Set' },
    { id: 'meeting_done', label: 'Meeting Done' },
    { id: 'on_hold', label: 'On Hold' },
    { id: 'closed', label: 'Closed' }
];

let visibleTabs = DEFAULT_TABS.map(t => t.id);

// --- CUSTOM IN-APP DIALOG SYSTEM ---
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

        if (title.includes("DANGER") || title.includes("CRITICAL")) {
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

// --- UTILITIES ---
function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes(' ')) {
        let [d, t] = dateStr.split(' ');
        let p = d.split('-');
        if (p.length === 3) return `${p[1]}-${p[2]}-${p[0]} ${t}`;
    } else {
        let p = dateStr.split('-');
        if (p.length === 3) return `${p[1]}-${p[2]}-${p[0]}`;
    }
    return dateStr;
}

// CHECK IF FILE IS AN IMAGE
function isImage(fileName) {
    if (!fileName) return false;
    const ext = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
}

// OPEN IMAGE IN LIGHTBOX
function openImagePreview(url, fileName) {
    document.getElementById('previewImage').src = url;
    document.getElementById('downloadPreviewBtn').href = url;
    document.getElementById('downloadPreviewBtn').download = fileName;
    document.getElementById('imagePreviewModal').classList.remove('hidden');
}


async function api(action, data = null, isForm = false) {
    let options = { method: data ? 'POST' : 'GET' };
    if(data && !isForm) options.body = JSON.stringify(data);
    if(data && isForm) options.body = data; 
    const res = await fetch(`api.php?action=${action}`, options);
    if(res.status === 403) return location.reload();
    return res.json();
}

document.getElementById('catSelect').addEventListener('change', handleCatChange);

document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('api.php?action=login', {
        method: 'POST',
        body: JSON.stringify({username: document.getElementById('loginUser').value, password: document.getElementById('loginPass').value})
    });
    if(res.ok) { document.getElementById('loginOverlay').remove(); document.getElementById('app').classList.remove('hidden'); refresh(); }
    else customAlert("Invalid Login credentials.", "Access Denied");
};

async function refresh() {
    const data = await api('get_data');
    state = { ...state, ...data };
    
    if (state.settings && state.settings.visible_tabs) {
        try {
            visibleTabs = JSON.parse(state.settings.visible_tabs);
        } catch(e) { console.error("Failed to parse settings"); }
    }

    renderTabs();
    render();
    renderCategoryDropdown();
    initCalendar();
}

function openTabSettings() {
    const container = document.getElementById('tabChecklist');
    container.innerHTML = DEFAULT_TABS.map(t => `
        <label class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200 transition">
            <input type="checkbox" value="${t.id}" class="w-4 h-4 text-indigo-600 rounded border-gray-300" ${visibleTabs.includes(t.id) ? 'checked' : ''}>
            <span class="text-sm font-bold text-slate-700">${t.label}</span>
        </label>
    `).join('');
    document.getElementById('tabSettingsModal').classList.remove('hidden');
}

async function saveTabSettings() {
    const checkboxes = document.querySelectorAll('#tabChecklist input[type="checkbox"]:checked');
    visibleTabs = Array.from(checkboxes).map(cb => cb.value);
    
    if(visibleTabs.length === 0) visibleTabs = ['all']; 
    
    await api('save_settings', { key: 'visible_tabs', value: JSON.stringify(visibleTabs) });
    
    if (!visibleTabs.includes(state.filter)) state.filter = visibleTabs[0];
    
    closeModal('tabSettingsModal');
    renderTabs();
    render();
}

function renderTabs() {
    const container = document.getElementById('tabContainer');
    container.innerHTML = DEFAULT_TABS.filter(t => visibleTabs.includes(t.id)).map(t => {
        const isSelected = state.filter === t.id;
        const classes = isSelected ? `border-b-2 border-indigo-600 text-indigo-600` : '';
        return `<button onclick="setFilter('${t.id}')" class="pb-1.5 uppercase shrink-0 ${classes}">${t.label}</button>`;
    }).join('');
}

function render() {
    const searchEl = document.getElementById('search');
    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    
    let filtered = state.tasks.filter(t => {
        const statusMatch = (state.filter === 'all' || t.status === state.filter);
        if (!statusMatch) return false;
        if (!query) return true; 

        const titleMatch = (t.title || '').toLowerCase().includes(query);
        const descMatch = (t.description || '').toLowerCase().includes(query);
        const customMatch = (t.custom_data || '').toLowerCase().includes(query);
        const catMatch = (t.cat_name || '').toLowerCase().includes(query);

        return titleMatch || descMatch || customMatch || catMatch;
    });
    
    if (state.filter === 'all') {
        filtered.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    }
    
    document.getElementById('taskGrid').innerHTML = filtered.map(t => {
        let borderColor = 'border-indigo-500'; 
        if(t.status === 'on_hold') borderColor = 'border-orange-400';
        if(['meeting_set', 'meeting_done', 'delivered'].includes(t.status)) borderColor = 'border-emerald-400';
        if(t.status.includes('karigar') || t.status === 'order_received') borderColor = 'border-yellow-400'; 

        let isOrder = false;
        try { if (t.custom_data && t.custom_data.includes('"task_type":"shop_order"')) isOrder = true; } catch(e){}

        return `
        <div onclick="openTaskView(${t.id})" class="bg-white p-4 md:p-5 rounded-xl shadow-sm border-l-8 ${borderColor} cursor-pointer border hover:shadow-md transition">
            <div class="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                <span>${isOrder ? '🛍️ Shop Order' : (t.cat_name || 'General')}</span><span>${formatDate(t.due_date) || ''}</span>
            </div>
            <h3 class="font-bold text-slate-800 leading-tight mb-1 text-sm md:text-base line-clamp-2">${t.title || 'Untitled'}</h3>
            ${t.recurrence && t.recurrence !== 'none' ? `<span class="text-[9px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded font-bold uppercase inline-block mb-1">🔁 ${t.recurrence}</span>` : ''}
            ${t.mini_due_date ? `<div class="mt-1.5"><span class="text-[9px] bg-yellow-50 text-yellow-700 px-2 py-1 rounded font-bold uppercase border border-yellow-200">🗓️ Next: ${formatDate(t.mini_due_date)}</span></div>` : ''}
            ${state.filter === 'all' ? `<span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold uppercase mt-2 inline-block block w-max">${t.status.replace(/_/g, ' ')}</span>` : ''}
        </div>
    `}).join('');
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

function toggleTaskMode(mode) {
    try {
        const genBtn = document.getElementById('btnToggleGeneral');
        const shopBtn = document.getElementById('btnToggleShop');
        const flag = document.getElementById('taskTypeFlag');
        
        if (mode === 'shop') {
            genBtn.className = "flex-1 text-center py-2 text-slate-500 rounded-md text-sm font-bold hover:text-indigo-600 transition cursor-pointer select-none";
            shopBtn.className = "flex-1 text-center py-2 bg-white shadow-sm rounded-md text-sm font-bold text-indigo-700 transition cursor-pointer select-none";
            
            document.getElementById('generalTitleBlock').classList.add('hidden');
            document.getElementById('generalOptionsBlock').classList.add('hidden'); 
            document.getElementById('shopOrderBlock').classList.remove('hidden');
            
            document.getElementById('gen_title').required = false;
            document.getElementById('so_customer').required = true;
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
                document.getElementById('so_order_date').value = new Date().toISOString().split('T')[0];
            }
            
            document.getElementById('catSelect').value = "";
            document.getElementById('taskForm').elements['recurrence'].value = "none";
            document.getElementById('customFields').innerHTML = ""; 
            
        } else {
            shopBtn.className = "flex-1 text-center py-2 text-slate-500 rounded-md text-sm font-bold hover:text-indigo-600 transition cursor-pointer select-none";
            genBtn.className = "flex-1 text-center py-2 bg-white shadow-sm rounded-md text-sm font-bold text-indigo-700 transition cursor-pointer select-none";
            
            document.getElementById('generalTitleBlock').classList.remove('hidden');
            document.getElementById('generalOptionsBlock').classList.remove('hidden'); 
            document.getElementById('shopOrderBlock').classList.add('hidden');
            
            document.getElementById('gen_title').required = true;
            document.getElementById('so_customer').required = false;
            flag.value = 'general';
        }
    } catch(err) {
        console.error(err);
    }
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
    shopProductsList.splice(index, 1);
    renderProductUI();
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

async function openTaskView(id) {
    try {
        const data = await api(`get_task_details&id=${id}`);
        const t = data.task;
        if(!t) return customAlert("Task not found in database.", "Error");
        
        pendingFiles = []; renderFileQueue('update');

        document.getElementById('updateId').value = t.id; 
        document.getElementById('viewTitle').innerText = t.title || 'Untitled'; 
        document.getElementById('viewDesc').innerText = t.description || 'No notes provided.'; 
        document.getElementById('updateMiniDueDate').value = t.mini_due_date || ''; 

        let isOrder = false;
        let custom = {};
        try { if(t.custom_data && t.custom_data !== 'null') custom = JSON.parse(t.custom_data); } catch(e) {}
        if(custom.task_type === 'shop_order') isOrder = true;

        const statusSelect = document.getElementById('statusSelect');
        let optionsHtml = '';
        if (t.status === 'closed') optionsHtml += `<option value="open">🔄 Reopen Task</option>`;
        
        if(isOrder) {
            optionsHtml += `
                <option value="order_received">Order Received</option>
                <option value="sent_to_karigar">Sent to Karigar</option>
                <option value="received_from_karigar">Received from Karigar</option>
                <option value="delivered">Delivered / Sent to Customer</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">✅ Closed / Completed</option>
            `;
        } else {
            optionsHtml += `
                <option value="reply_sent">Reply Sent</option>
                <option value="waiting_for_reply">Waiting for Reply</option>
                <option value="reply_received">Reply Received</option>
                <option value="meeting_set">Meeting Set</option>
                <option value="meeting_done">Meeting Done</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">✅ Completed / Closed</option>
            `;
        }
        statusSelect.innerHTML = optionsHtml;
        statusSelect.value = t.status !== 'open' ? t.status : (isOrder ? 'order_received' : 'reply_sent'); 
        
        statusSelect.onchange = function() {
            const block = document.getElementById('deliveryMethodBlock');
            const input = document.getElementById('deliveryMethodInput');
            if(this.value === 'delivered') { block.classList.remove('hidden'); input.required = true; }
            else { block.classList.add('hidden'); input.required = false; }
        };
        statusSelect.onchange(); 

        let metaHtml = `<span class="text-[9px] bg-slate-100 px-2 py-1 rounded font-black uppercase text-slate-500">${isOrder ? '🛍️ Shop Order' : (t.cat_name || 'General')}</span>`;
        if(t.recurrence && t.recurrence !== 'none') { metaHtml += `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-black uppercase tracking-wider">🔁 ${t.recurrence}</span>`; }
        document.getElementById('viewMeta').innerHTML = metaHtml;
        
        document.getElementById('viewCustomData').innerHTML = Object.entries(custom).map(([k,v]) => {
            if(k === 'task_type' || !v) return '';
            if(k === 'Products') {
                const prodHtml = v.split(' | ').map(x => `<li class="ml-3 list-disc">${x}</li>`).join('');
                return `<div class="col-span-full"><b class="block text-[8px] uppercase text-slate-400 font-black">${k}</b><ul class="text-xs sm:text-sm font-semibold text-slate-700 mt-1">${prodHtml}</ul></div>`;
            }
            return `<div><b class="block text-[8px] uppercase text-slate-400 font-black">${k}</b><span class="text-xs sm:text-sm font-semibold text-slate-700 break-words">${v}</span></div>`;
        }).join('');
        
        // --- INLINE IMAGE LOGIC RENDERER ---
        document.getElementById('historyTimeline').innerHTML = data.history.map(h => {
            let badgeColor = 'bg-indigo-50 text-indigo-600';
            if(h.status === 'on_hold') badgeColor = 'bg-orange-100 text-orange-600';
            if(['meeting_set', 'meeting_done', 'delivered', 'received_from_karigar'].includes(h.status)) badgeColor = 'bg-emerald-100 text-emerald-700';
            if(['sent_to_karigar', 'order_received'].includes(h.status)) badgeColor = 'bg-yellow-100 text-yellow-800';

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
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 ${badgeColor} rounded">${(h.status || '').replace(/_/g,' ')}</span>
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
            data.status = 'open';
        }
    }

    fd.forEach((v, k) => { 
        if(k.startsWith('custom_') && v.trim() !== '') {
            data.custom_fields[k.replace('custom_','')] = v; 
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

    await api(apiAction, payload, true);
    pendingFiles = []; 
    closeModal(formEl.closest('div[id$="Modal"]').id);
    document.getElementById('search').value = "";
    formEl.reset();
    refresh();
}

document.getElementById('taskForm').onsubmit = (e) => {
    e.preventDefault();
    handleFormSubmit(e.target, 'add_task');
};

document.getElementById('updateForm').onsubmit = async (e) => {
    e.preventDefault();
    const currentTaskId = document.getElementById('updateId').value;
    const currentTask = state.tasks.find(x => x.id == currentTaskId);
    const newStatus = document.getElementById('statusSelect').value;

    if (newStatus === 'closed' && currentTask.status !== 'closed') {
        const confirmed = await customConfirm("✅ Are you sure you want to mark this task as Completed/Closed?", "Confirm Completion");
        if (!confirmed) return;
    }
    if (newStatus === 'open' && currentTask.status === 'closed') {
        const confirmed = await customConfirm("🔄 Are you sure you want to Reopen this task?", "Reopen Task");
        if (!confirmed) return;
    }

    handleFormSubmit(e.target, 'update_status');
};

async function secureDeleteTask() {
    const pass = await customPrompt("This will permanently erase this task and all attached files.\n\nEnter your login password to confirm:", true, "DANGER: Authentication Required");
    if (!pass) return; 
    
    const id = document.getElementById('updateId').value;
    const res = await fetch('api.php?action=delete_task', { method: 'POST', body: JSON.stringify({ id, password: pass }) });
    if (res.ok) {
        const data = await res.json();
        if(data.error) { await customAlert("ERROR: " + data.error, "Failed"); return; }
        closeModal('updateModal'); refresh();
    } else { 
        await customAlert("Incorrect password. Task deletion aborted.", "Verification Failed"); 
    }
}

async function saveNewCategory() {
    const name = document.getElementById('newCatName').value;
    if(!name) return await customAlert("Please enter a category name.", "Input Required");
    
    const fields = document.getElementById('newCatFields').value.split(',').map(f => f.trim()).filter(f => f);
    const res = await api('add_category', { name, fields });
    if(res.id) { 
        closeModal('newCatModal'); 
        document.getElementById('newCatName').value = ""; document.getElementById('newCatFields').value = "";
        await refresh(); 
        document.getElementById('catSelect').value = res.id;
        renderCustomFields();
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

function renderCategoryDropdown() {
    const select = document.getElementById('catSelect');
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Choose Category --</option>' + 
        state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
        '<option value="NEW" class="text-indigo-600 font-bold">+ CREATE NEW...</option>';
    if(currentValue) select.value = currentValue;
}

function setFilter(f) { 
    document.getElementById('search').value = "";
    state.filter = f; 
    renderTabs(); 
    render(); 
}

function openNewTask() { 
    document.getElementById('taskForm').reset(); 
    document.getElementById('customFields').innerHTML = ""; 
    document.getElementById('dueDateInput').value = new Date().toISOString().split('T')[0]; 
    pendingFiles = []; shopProductsList = [];
    renderFileQueue('new'); renderProductUI();
    toggleTaskMode('general'); 
    document.getElementById('taskModal').classList.remove('hidden'); 
}

function openPurge() { document.getElementById('purgeModal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showView(v) { document.getElementById('boardView').classList.toggle('hidden', v !== 'board'); document.getElementById('calendarView').classList.toggle('hidden', v !== 'calendar'); if(v==='calendar' && calendar) calendar.render(); }

function initCalendar() {
    let events = [];
    state.tasks.forEach(t => {
        let color = '#4f46e5'; 
        if (t.status === 'on_hold') color = '#fb923c'; 
        if (['meeting_set', 'meeting_done', 'delivered'].includes(t.status)) color = '#34d399'; 
        if (t.status.includes('karigar') || t.status === 'order_received') color = '#facc15';

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

// Allows closing modals (including the lightbox) by clicking the dark overlay
window.onclick = (e) => { 
    if(e.target.classList.contains('fixed') && e.target.id !== 'customDialogOverlay') {
        e.target.classList.add('hidden'); 
    }
}

function logout() { fetch('api.php?action=logout'); location.reload(); }
setInterval(async () => { const res = await fetch('api.php?action=get_data'); if(res.status === 403) location.reload(); }, 60000);
