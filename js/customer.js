let config = null;
let selectedOptionId = null;
const values = {};
let currentStep = 1;
let lastActivity = Date.now();
let wakeLockSentinel = null;

const steps = ['step1', 'step2', 'step3', 'stepDone'];

function markActivity() {
  lastActivity = Date.now();
}

function startIdleWatcher() {
  ['touchstart', 'mousedown', 'keydown', 'input'].forEach((evt) => {
    document.addEventListener(evt, markActivity, { passive: true });
  });
  setInterval(() => {
    const idleSeconds = config.idleResetSeconds;
    if (!idleSeconds || idleSeconds <= 0) return;
    if (currentStep === 1 || currentStep === 4) return; // welcome / thank-you handle themselves
    if (Date.now() - lastActivity > idleSeconds * 1000) {
      window.location.reload();
    }
  }, 2000);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    }
  } catch (e) {
    // Wake Lock not available/granted — safe to ignore, screen may dim normally.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

function showStep(n) {
  currentStep = n;
  steps.forEach((id, i) => {
    document.getElementById(id).classList.toggle('hidden', i !== n - 1);
  });
  renderDots();
}

function renderDots() {
  const dots = document.getElementById('stepsDots');
  dots.innerHTML = '';
  if (currentStep > 3) return;
  for (let i = 1; i <= 3; i++) {
    const d = document.createElement('div');
    d.className = 'step-dot' + (i === currentStep ? ' active' : i < currentStep ? ' done' : '');
    dots.appendChild(d);
  }
}

function renderLogo() {
  const wrap = document.getElementById('logoWrap');
  wrap.innerHTML = '';
  if (config.logo) {
    const img = document.createElement('img');
    img.src = config.logo;
    wrap.appendChild(img);
  }
}

function renderFields() {
  const container = document.getElementById('fieldsContainer');
  container.innerHTML = '';
  config.fields.forEach((f) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = f.label + (f.required ? ' *' : '');
    label.setAttribute('for', 'f_' + f.id);
    const input = document.createElement('input');
    input.type = f.type || 'text';
    input.id = 'f_' + f.id;
    input.value = values[f.id] || '';
    input.addEventListener('input', () => { values[f.id] = input.value; });
    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
  });
}

function renderOptions() {
  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  config.fontOptions.forEach((opt) => {
    const card = document.createElement('div');
    card.className = 'option-card' + (opt.id === selectedOptionId ? ' selected' : '');
    card.addEventListener('click', () => {
      selectedOptionId = opt.id;
      renderOptions();
    });
    if (opt.image) {
      const img = document.createElement('img');
      img.src = opt.image;
      card.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'option-placeholder';
      ph.textContent = 'No image';
      card.appendChild(ph);
    }
    const lbl = document.createElement('div');
    lbl.className = 'opt-label';
    lbl.textContent = opt.label;
    card.appendChild(lbl);
    grid.appendChild(card);
  });
}

function validateStep1() {
  const err = document.getElementById('step1Error');
  for (const f of config.fields) {
    const v = (values[f.id] || '').trim();
    if (f.required && !v) {
      err.textContent = `Please fill in "${f.label}".`;
      return false;
    }
    if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      err.textContent = 'Please enter a valid email address.';
      return false;
    }
  }
  err.textContent = '';
  return true;
}

function validateStep2() {
  const err = document.getElementById('step2Error');
  if (!selectedOptionId) {
    err.textContent = 'Please choose one option to continue.';
    return false;
  }
  err.textContent = '';
  return true;
}

function validateStep3() {
  const err = document.getElementById('step3Error');
  const val = document.getElementById('initialsInput').value.trim();
  if (!val) {
    err.textContent = 'Please enter your initials.';
    return false;
  }
  err.textContent = '';
  return true;
}

async function submitOrder() {
  const fieldLabels = {};
  config.fields.forEach((f) => { fieldLabels[f.id] = f.label; });
  const chosen = config.fontOptions.find((o) => o.id === selectedOptionId);
  const orderNumber = await getNextOrderNumber();

  const submission = {
    orderNumber,
    timestamp: new Date().toISOString(),
    values: { ...values },
    fieldLabels,
    fontOptionLabel: chosen ? chosen.label : '',
    initials: document.getElementById('initialsInput').value.trim().toUpperCase(),
    synced: false,
  };

  await addSubmission(submission);
  syncSubmission(config, submission); // fire-and-forget: never block the kiosk flow on network
  document.getElementById('orderNumberDisplay').textContent = orderNumber;
  renderOrderSummary(values.firstName || '', values.lastName || '', submission.fontOptionLabel, submission.initials);
  showStep(4);

  const completeBtn = document.getElementById('completeBtn');
  completeBtn.classList.add('hidden');
  let doneTimer = null;

  completeBtn.addEventListener('click', () => {
    clearTimeout(doneTimer);
    window.location.reload();
  }, { once: true });

  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
    completeBtn.classList.remove('hidden');
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => window.location.reload(), 30000);
  });
}

function renderOrderSummary(firstName, lastName, styleLabel, initials) {
  const el = document.getElementById('orderSummary');
  el.innerHTML = '';
  const rows = [
    ['Name', `${firstName} ${lastName}`.trim()],
    ['Style', styleLabel],
    ['Initials', initials],
  ];
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    el.appendChild(row);
  });
}

function wireNav() {
  document.getElementById('toStep2').addEventListener('click', () => {
    if (validateStep1()) { showStep(2); renderOptions(); }
  });
  document.getElementById('toStep1').addEventListener('click', () => showStep(1));
  document.getElementById('toStep3').addEventListener('click', () => {
    if (validateStep2()) showStep(3);
  });
  document.getElementById('toStep2b').addEventListener('click', () => showStep(2));
  document.getElementById('submitBtn').addEventListener('click', () => {
    if (validateStep3()) submitOrder();
  });

  const initialsInput = document.getElementById('initialsInput');
  initialsInput.addEventListener('input', () => {
    let v = initialsInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    const max = config.initialsMaxLength || 3;
    if (v.length > max) v = v.slice(0, max);
    initialsInput.value = v;
  });
}

async function init() {
  config = await getConfigOrDefault();
  document.getElementById('initialsHint').textContent =
    `Enter up to ${config.initialsMaxLength || 3} letters to be embroidered.`;
  // No native maxlength: it would truncate raw keystrokes (incl. stray symbols)
  // before our letters-only filter runs, which could drop a valid trailing letter.
  renderLogo();
  renderFields();
  wireNav();
  showStep(1);
  startIdleWatcher();
  requestWakeLock();
  retryPendingSyncs(config); // fire-and-forget: catches up any orders missed while offline
  retryPendingDeletes(config); // fire-and-forget: catches up any deletes missed while offline
}

init();
