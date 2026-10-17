let config = null;
let selectedProductId = null;
let selectedOptionId = null;
let selectedColorId = null;
const values = {};
let currentStep = 1;
let lastActivity = Date.now();
let wakeLockSentinel = null;
let doneTimer = null;

let activeSteps = [];

const STEP_DEFS = {
  step1: { validate: () => validateStep1() },
  stepProduct: { validate: () => validateStepProduct(), onEnter: () => renderProductOptions() },
  step2: { validate: () => validateStep2(), onEnter: () => { renderOptions(); renderColorOptions(); } },
  step3: { validate: () => validateStep3() },
};

function getActiveSteps() {
  const seq = [];
  if (config.enabledSteps.customerInfo) seq.push('step1');
  if (config.enabledSteps.itemOptions) seq.push('stepProduct');
  if (config.enabledSteps.fontStyle) seq.push('step2');
  if (config.enabledSteps.nameInitials) seq.push('step3');
  seq.push('stepDone');
  seq.push('stepComplete');
  return seq;
}

const THREAD_COLORS = [
  { id: 'red', label: 'Red', hex: '#c0392b' },
  { id: 'blue', label: 'Blue', hex: '#1f5fa8' },
  { id: 'gold', label: 'Gold', hex: '#c9a227' },
  { id: 'pink', label: 'Pink', hex: '#e0599e' },
  { id: 'orange', label: 'Orange', hex: '#d9731e' },
  { id: 'yellow', label: 'Yellow', hex: '#e8c93b' },
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'green', label: 'Green', hex: '#2f7d4f' },
];

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
    const stepId = activeSteps[currentStep - 1];
    if (currentStep === 1 || stepId === 'stepDone' || stepId === 'stepComplete') return; // welcome / print / complete handle themselves
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

const ALL_STEP_IDS = ['step1', 'stepProduct', 'step2', 'step3', 'stepDone', 'stepComplete'];

function showStep(n) {
  currentStep = n;
  const activeId = activeSteps[n - 1];
  ALL_STEP_IDS.forEach((id) => {
    document.getElementById(id).classList.toggle('hidden', id !== activeId);
  });
  renderDots();
}

function renderDots() {
  const dots = document.getElementById('stepsDots');
  dots.innerHTML = '';
  const dotSteps = activeSteps.length - 2; // exclude stepDone, stepComplete
  if (currentStep > dotSteps) return;
  for (let i = 1; i <= dotSteps; i++) {
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

function renderProductOptions() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '';
  config.productOptions.forEach((opt) => {
    const card = document.createElement('div');
    card.className = 'option-card' + (opt.id === selectedProductId ? ' selected' : '');
    card.addEventListener('click', () => {
      selectedProductId = opt.id;
      renderProductOptions();
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

function renderColorOptions() {
  const grid = document.getElementById('colorGrid');
  grid.innerHTML = '';
  THREAD_COLORS.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'color-swatch' + (c.id === selectedColorId ? ' selected' : '');
    item.addEventListener('click', () => {
      selectedColorId = c.id;
      renderColorOptions();
    });
    const circle = document.createElement('div');
    circle.className = 'swatch-circle';
    circle.style.background = c.hex;
    const lbl = document.createElement('div');
    lbl.className = 'swatch-label';
    lbl.textContent = c.label;
    item.appendChild(circle);
    item.appendChild(lbl);
    grid.appendChild(item);
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

function validateStepProduct() {
  const err = document.getElementById('stepProductError');
  if (!selectedProductId) {
    err.textContent = 'Please choose one option to continue.';
    return false;
  }
  err.textContent = '';
  return true;
}

function validateStep2() {
  const err = document.getElementById('step2Error');
  if (!selectedOptionId) {
    err.textContent = 'Please choose a font style to continue.';
    return false;
  }
  if (!selectedColorId) {
    err.textContent = 'Please choose a thread color to continue.';
    return false;
  }
  err.textContent = '';
  return true;
}

function validateStep3() {
  const err = document.getElementById('step3Error');
  const val = document.getElementById('initialsInput').value.trim();
  if (!val) {
    err.textContent = 'Please enter a name or initials.';
    return false;
  }
  err.textContent = '';
  return true;
}

function getInitialsMax() {
  const v = config.initialsMaxLength;
  return v === 0 ? Infinity : (v || 3);
}

function adjustInitialsFontSize() {
  const el = document.getElementById('initialsInput');
  const len = el.value.length;
  let size = 48, spacing = 10;
  if (len > 14) { size = 22; spacing = 2; }
  else if (len > 10) { size = 28; spacing = 4; }
  else if (len > 6) { size = 36; spacing = 6; }
  el.style.fontSize = size + 'px';
  el.style.letterSpacing = spacing + 'px';
}

async function submitOrder() {
  const fieldLabels = {};
  config.fields.forEach((f) => { fieldLabels[f.id] = f.label; });
  const chosenProduct = config.productOptions.find((o) => o.id === selectedProductId);
  const chosenStyle = config.fontOptions.find((o) => o.id === selectedOptionId);
  const chosenColor = THREAD_COLORS.find((c) => c.id === selectedColorId);
  const orderNumber = await getNextOrderNumber();

  const submission = {
    orderNumber,
    timestamp: new Date().toISOString(),
    values: { ...values },
    fieldLabels,
    productOptionLabel: chosenProduct ? chosenProduct.label : '',
    fontOptionLabel: chosenStyle ? chosenStyle.label : '',
    threadColorLabel: chosenColor ? chosenColor.label : '',
    initials: document.getElementById('initialsInput').value.trim().toUpperCase(),
    synced: false,
  };

  await addSubmission(submission);
  syncSubmission(config, submission); // fire-and-forget: never block the kiosk flow on network
  document.getElementById('orderNumberDisplay').textContent = orderNumber;
  renderOrderSummary(values.firstName || '', values.lastName || '', submission);
  showStep(activeSteps.indexOf('stepDone') + 1);
}

function renderOrderSummary(firstName, lastName, submission) {
  const el = document.getElementById('orderSummary');
  el.innerHTML = '';
  const rows = [
    ['Name', `${firstName} ${lastName}`.trim()],
    ['Item', submission.productOptionLabel],
    ['Style', submission.fontOptionLabel],
    ['Color', submission.threadColorLabel],
    ['Embroidered Text', submission.initials],
  ].filter(([, value]) => value);
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

function restartDoneTimer() {
  clearTimeout(doneTimer);
  doneTimer = setTimeout(() => window.location.reload(), 30000);
}

function goNext() {
  const curId = activeSteps[currentStep - 1];
  const def = STEP_DEFS[curId];
  if (def && def.validate && !def.validate()) return;

  const nextId = activeSteps[currentStep]; // currentStep is 1-based, so this is index of the next step
  if (nextId === 'stepDone') {
    submitOrder();
    return;
  }
  showStep(currentStep + 1);
  const nextDef = STEP_DEFS[nextId];
  if (nextDef && nextDef.onEnter) nextDef.onEnter();
}

function goBack() {
  showStep(currentStep - 1);
}

function wireNav() {
  ['toProduct', 'toStep2', 'toStep3', 'submitBtn'].forEach((id) => {
    document.getElementById(id).addEventListener('click', goNext);
  });
  ['toStep1', 'toProductBack', 'toStep2b'].forEach((id) => {
    document.getElementById(id).addEventListener('click', goBack);
  });

  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
    document.getElementById('nextFromPrintBtn').classList.remove('hidden');
    restartDoneTimer();
  });
  document.getElementById('nextFromPrintBtn').addEventListener('click', () => showStep(activeSteps.indexOf('stepComplete') + 1));
  document.getElementById('backToPrintBtn').addEventListener('click', () => showStep(activeSteps.indexOf('stepDone') + 1));
  document.getElementById('completeBtn').addEventListener('click', () => {
    clearTimeout(doneTimer);
    window.location.reload();
  });

  const initialsInput = document.getElementById('initialsInput');
  initialsInput.addEventListener('input', () => {
    let v = initialsInput.value.toUpperCase().replace(/[^A-Z ]/g, '');
    const max = getInitialsMax();
    if (isFinite(max) && v.length > max) v = v.slice(0, max);
    initialsInput.value = v;
    adjustInitialsFontSize();
  });
}

async function init() {
  config = await getConfigOrDefault();
  activeSteps = getActiveSteps();
  const max = getInitialsMax();
  document.getElementById('initialsHint').textContent = isFinite(max)
    ? `Enter up to ${max} letters to be embroidered.`
    : 'Enter the name or initials to be embroidered.';
  // No native maxlength: it would truncate raw keystrokes (incl. stray symbols)
  // before our letters-only filter runs, which could drop a valid trailing letter.
  renderLogo();
  renderFields();
  wireNav();
  showStep(1);
  const firstDef = STEP_DEFS[activeSteps[0]];
  if (firstDef && firstDef.onEnter) firstDef.onEnter();
  startIdleWatcher();
  requestWakeLock();
  retryPendingSyncs(config); // fire-and-forget: catches up any orders missed while offline
  retryPendingDeletes(config); // fire-and-forget: catches up any deletes missed while offline
}

init();
