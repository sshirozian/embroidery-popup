let config = null;

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- PIN gate ----------

async function initAuthGate() {
  config = await getConfigOrDefault();

  if (!config.pinHash) {
    document.getElementById('pinSetupScreen').style.display = 'block';
    wirePinSetup();
    return;
  }

  document.getElementById('pinEntryScreen').style.display = 'block';
  wirePinEntry();
}

function wirePinSetup() {
  document.getElementById('pinSetupBtn').addEventListener('click', async () => {
    const p1 = document.getElementById('pinSetup1').value.trim();
    const p2 = document.getElementById('pinSetup2').value.trim();
    const err = document.getElementById('pinSetupError');
    if (p1.length < 4) { err.textContent = 'PIN must be at least 4 digits.'; return; }
    if (p1 !== p2) { err.textContent = 'PINs do not match.'; return; }
    config.pinHash = await sha256Hex(p1);
    await setConfig(config);
    document.getElementById('pinSetupScreen').style.display = 'none';
    showAdminPanel();
  });
}

function wirePinEntry() {
  const btn = document.getElementById('pinEntryBtn');
  const input = document.getElementById('pinEntryInput');
  const attempt = async () => {
    const err = document.getElementById('pinEntryError');
    const val = input.value.trim();
    const hash = await sha256Hex(val);
    if (hash === config.pinHash) {
      document.getElementById('pinEntryScreen').style.display = 'none';
      showAdminPanel();
    } else {
      err.textContent = 'Incorrect PIN.';
    }
  };
  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

function wireChangePin() {
  document.getElementById('changePinBtn').addEventListener('click', async () => {
    const current = prompt('Enter current PIN:');
    if (current === null) return;
    const hash = await sha256Hex(current.trim());
    if (hash !== config.pinHash) { alert('Incorrect current PIN.'); return; }
    const next = prompt('Enter new PIN (min 4 digits):');
    if (next === null) return;
    if (next.trim().length < 4) { alert('PIN must be at least 4 digits.'); return; }
    config.pinHash = await sha256Hex(next.trim());
    await setConfig(config);
    toast('PIN updated.');
  });

  document.getElementById('lockBtn').addEventListener('click', () => {
    window.location.reload();
  });
}

// ---------- Admin panel ----------

function showAdminPanel() {
  document.getElementById('adminPanel').style.display = 'block';
  wireTabs();
  wireChangePin();
  wireConfigActions();
  loadSubmissions();
  wireSubmissionsActions();
  retryPendingSyncs(config); // fire-and-forget: catches up any orders missed while offline
  retryPendingDeletes(config); // fire-and-forget: catches up any deletes missed while offline
}

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'subsTab') loadSubmissions();
    });
  });
}

// ---- Config: logo ----

function renderLogoPreview() {
  const img = document.getElementById('logoPreview');
  if (config.logo) {
    img.src = config.logo;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
  }
}

// ---- Config: fields ----

function renderFieldsEditor() {
  const container = document.getElementById('fieldsEditor');
  container.innerHTML = '';
  config.fields.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = 'field-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = f.label;
    labelInput.placeholder = 'Field label';
    labelInput.addEventListener('input', () => { f.label = labelInput.value; });

    const typeSelect = document.createElement('select');
    ['text', 'tel', 'email', 'number'].forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (f.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => { f.type = typeSelect.value; });

    const reqLabel = document.createElement('label');
    reqLabel.className = 'inline-check';
    const reqCheckbox = document.createElement('input');
    reqCheckbox.type = 'checkbox';
    reqCheckbox.checked = !!f.required;
    reqCheckbox.addEventListener('change', () => { f.required = reqCheckbox.checked; });
    reqLabel.appendChild(reqCheckbox);
    reqLabel.appendChild(document.createTextNode('Required'));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove field';
    removeBtn.addEventListener('click', () => {
      config.fields.splice(idx, 1);
      renderFieldsEditor();
    });

    row.appendChild(labelInput);
    row.appendChild(typeSelect);
    row.appendChild(reqLabel);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addFieldBtn').addEventListener('click', () => {
    config.fields.push({ id: makeId(), label: 'New Field', type: 'text', required: false });
    renderFieldsEditor();
  });
});

// ---- Config: font options ----

function renderOptionsEditor() {
  const container = document.getElementById('optionsEditor');
  container.innerHTML = '';
  config.fontOptions.forEach((opt, idx) => {
    const row = document.createElement('div');
    row.className = 'option-row';

    if (opt.image) {
      const img = document.createElement('img');
      img.src = opt.image;
      row.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'thumb-placeholder';
      ph.textContent = 'no image';
      row.appendChild(ph);
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', async () => {
      if (fileInput.files[0]) {
        opt.image = await readFileAsDataURL(fileInput.files[0]);
        renderOptionsEditor();
      }
    });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = opt.label;
    labelInput.placeholder = 'Option label';
    labelInput.addEventListener('input', () => { opt.label = labelInput.value; });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove option';
    removeBtn.addEventListener('click', () => {
      config.fontOptions.splice(idx, 1);
      renderOptionsEditor();
    });

    row.appendChild(fileInput);
    row.appendChild(labelInput);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function wireConfigActions() {
  renderLogoPreview();
  renderFieldsEditor();
  renderOptionsEditor();
  document.getElementById('initialsMaxInput').value = config.initialsMaxLength || 3;
  document.getElementById('idleResetInput').value =
    config.idleResetSeconds === 0 ? 0 : (config.idleResetSeconds || 60);
  document.getElementById('sheetWebAppUrlInput').value = config.sheetWebAppUrl || '';

  document.getElementById('logoInput').addEventListener('change', async (e) => {
    if (e.target.files[0]) {
      config.logo = await readFileAsDataURL(e.target.files[0]);
      renderLogoPreview();
    }
  });

  document.getElementById('removeLogoBtn').addEventListener('click', () => {
    config.logo = null;
    document.getElementById('logoInput').value = '';
    renderLogoPreview();
  });

  document.getElementById('addOptionBtn').addEventListener('click', () => {
    config.fontOptions.push({ id: makeId(), label: 'New Option', image: null });
    renderOptionsEditor();
  });

  document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const max = parseInt(document.getElementById('initialsMaxInput').value, 10);
    config.initialsMaxLength = Number.isFinite(max) && max > 0 ? max : 3;
    const idle = parseInt(document.getElementById('idleResetInput').value, 10);
    config.idleResetSeconds = Number.isFinite(idle) && idle >= 0 ? idle : 60;
    config.sheetWebAppUrl = document.getElementById('sheetWebAppUrlInput').value.trim() || null;
    await setConfig(config);
    toast('Configuration saved.');
  });
}

// ---- Submissions ----

async function loadSubmissions() {
  const subs = await getAllSubmissions();
  renderSubsTable(subs);
}

function buildColumns(subs) {
  const cols = [{ key: '__order', label: 'Order #' }];
  const seen = new Set();
  subs.forEach((s) => {
    Object.keys(s.fieldLabels || {}).forEach((fid) => {
      if (!seen.has(fid)) { seen.add(fid); cols.push({ key: fid, label: s.fieldLabels[fid] }); }
    });
  });
  cols.push({ key: '__font', label: 'Style Chosen' });
  cols.push({ key: '__initials', label: 'Initials' });
  cols.push({ key: '__time', label: 'Submitted At' });
  if (config.sheetWebAppUrl) cols.push({ key: '__synced', label: 'Synced' });
  return cols;
}

function renderSubsTable(subs) {
  const table = document.getElementById('subsTable');
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  const emptyMsg = document.getElementById('subsEmptyMsg');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!subs.length) {
    table.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }
  table.style.display = 'table';
  emptyMsg.style.display = 'none';

  const cols = buildColumns(subs);
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c.label;
    thead.appendChild(th);
  });
  thead.appendChild(document.createElement('th'));

  subs.slice().reverse().forEach((s) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      if (c.key === '__order') td.textContent = s.orderNumber ?? '';
      else if (c.key === '__font') td.textContent = s.fontOptionLabel || '';
      else if (c.key === '__initials') td.textContent = s.initials || '';
      else if (c.key === '__time') td.textContent = new Date(s.timestamp).toLocaleString();
      else if (c.key === '__synced') td.textContent = s.synced ? '✓' : '—';
      else td.textContent = (s.values && s.values[c.key]) || '';
      tr.appendChild(td);
    });

    const actionTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete this order';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete order #${s.orderNumber}? This cannot be undone.`)) return;
      await deleteSubmissionLocal(s.id);
      syncDeleteSubmission(config, s); // fire-and-forget: removes the matching row from the Google Sheet too
      loadSubmissions();
      toast('Order deleted.');
    });
    actionTd.appendChild(deleteBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

function csvEscape(val) {
  const str = String(val ?? '');
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

async function exportCsv() {
  const subs = await getAllSubmissions();
  if (!subs.length) { toast('No submissions to export.'); return; }
  const cols = buildColumns(subs);
  const lines = [cols.map((c) => csvEscape(c.label)).join(',')];
  subs.forEach((s) => {
    const row = cols.map((c) => {
      if (c.key === '__order') return csvEscape(s.orderNumber);
      if (c.key === '__font') return csvEscape(s.fontOptionLabel);
      if (c.key === '__initials') return csvEscape(s.initials);
      if (c.key === '__time') return csvEscape(new Date(s.timestamp).toLocaleString());
      return csvEscape(s.values && s.values[c.key]);
    });
    lines.push(row.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `embroidery-submissions-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireSubmissionsActions() {
  document.getElementById('refreshSubsBtn').addEventListener('click', loadSubmissions);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('retrySyncBtn').addEventListener('click', async () => {
    if (!config.sheetWebAppUrl) { toast('No Google Sheet URL configured.'); return; }
    toast('Retrying sync...');
    await retryPendingSyncs(config);
    await retryPendingDeletes(config);
    loadSubmissions();
    toast('Sync retry complete.');
  });
  document.getElementById('clearSubsBtn').addEventListener('click', async () => {
    const confirmText = prompt('This will permanently delete all saved submissions. Type DELETE to confirm:');
    if (confirmText !== 'DELETE') return;
    await clearSubmissions();
    loadSubmissions();
    toast('All submissions cleared.');
  });
}

initAuthGate();
