let config = null;
let cartQuantities = {}; // productId -> quantity chosen on the item-selection page
let lineItems = []; // one entry per unit purchased, each personalized independently
let currentPersonalizingIndex = null; // which lineItems[] entry step2/step3 currently show
let selectedPaymentMethod = null;
const values = {};
let currentStep = 1;
let lastActivity = Date.now();
let wakeLockSentinel = null;

let activeSteps = []; // array of { id, itemIndex? } descriptors

const PAYMENT_METHODS = [
  { id: 'venmo', label: 'Venmo', icon: '📲' },
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'check', label: 'Check', icon: '🧾' },
];

// Order matters: the first 6 render on row 1, the remaining 7 on row 2.
const THREAD_COLORS = [
  { id: 'red', label: 'Red', hex: '#c0392b' },
  { id: 'blue', label: 'Blue', hex: '#1f5fa8' },
  { id: 'orange', label: 'Orange', hex: '#d9731e' },
  { id: 'gold', label: 'Gold', hex: '#c9a227' },
  { id: 'green', label: 'Green', hex: '#2f7d4f' },
  { id: 'beige', label: 'Beige', hex: '#d8c3a5' },
  { id: 'hot-pink', label: 'Hot Pink', hex: '#e6007e' },
  { id: 'light-pink', label: 'Light Pink', hex: '#f4b6c2' },
  { id: 'brown', label: 'Brown', hex: '#6f4e37' },
  { id: 'maroon', label: 'Maroon', hex: '#800020' },
  { id: 'copper', label: 'Copper', hex: '#b87333' },
  { id: 'olive', label: 'Olive', hex: '#71772e' },
  { id: 'brass', label: 'Brass', hex: '#b5a642' },
];
const THREAD_COLORS_ROW1_COUNT = 6;

const ALL_STEP_IDS = ['step1', 'stepProduct', 'step2', 'step3', 'stepPayment', 'stepReview', 'stepDone', 'stepComplete'];

// step2/step3 repeat once per entry in lineItems, so they carry onEnter hooks
// that point currentPersonalizingIndex at the right item before rendering.
const STEP_DEFS = {
  step1: { validate: () => validateStep1() },
  stepProduct: {
    validate: () => validateStepProduct(),
    onEnter: () => renderProductOptions(),
    onLeave: () => buildLineItemsFromCart(),
  },
  step2: {
    validate: () => validateStep2(),
    onEnter: (d) => {
      currentPersonalizingIndex = d.itemIndex;
      renderOptions();
      renderColorOptions();
      updateItemProgressLabels();
    },
  },
  step3: {
    validate: () => validateStep3(),
    onEnter: (d) => {
      currentPersonalizingIndex = d.itemIndex;
      loadInitialsForCurrentItem();
      updateItemProgressLabels();
    },
  },
  stepPayment: { validate: () => validateStepPayment(), onEnter: () => renderPaymentOptions() },
  stepReview: { onEnter: () => renderReviewSummary() },
};

function buildActiveSteps() {
  const seq = [];
  if (config.enabledSteps.customerInfo) seq.push({ id: 'step1' });
  if (config.enabledSteps.itemOptions) seq.push({ id: 'stepProduct' });
  if (config.enabledSteps.fontStyle || config.enabledSteps.nameInitials) {
    lineItems.forEach((item, i) => {
      if (config.enabledSteps.fontStyle) seq.push({ id: 'step2', itemIndex: i });
      if (config.enabledSteps.nameInitials) seq.push({ id: 'step3', itemIndex: i });
    });
  }
  if (config.enabledSteps.payment) seq.push({ id: 'stepPayment' });
  seq.push({ id: 'stepReview' });
  seq.push({ id: 'stepDone' });
  seq.push({ id: 'stepComplete' });
  return seq;
}

function findStepIndex(id) {
  return activeSteps.findIndex((d) => d.id === id);
}

function buildLineItemsFromCart() {
  lineItems = [];
  config.productOptions.forEach((opt) => {
    const qty = cartQuantities[opt.id] || 0;
    for (let i = 0; i < qty; i++) {
      lineItems.push({ productId: opt.id, fontOptionId: null, colorId: null, initials: '' });
    }
  });
  activeSteps = buildActiveSteps();
}

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
    const stepId = activeSteps[currentStep - 1] && activeSteps[currentStep - 1].id;
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

function showStep(n) {
  currentStep = n;
  const activeId = activeSteps[n - 1] && activeSteps[n - 1].id;
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
    const qty = cartQuantities[opt.id] || 0;
    const card = document.createElement('div');
    card.className = 'option-card qty-card' + (qty > 0 ? ' selected' : '');

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

    const stepper = document.createElement('div');
    stepper.className = 'qty-stepper';
    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'qty-btn';
    decBtn.textContent = '−';
    decBtn.addEventListener('click', () => {
      cartQuantities[opt.id] = Math.max(0, (cartQuantities[opt.id] || 0) - 1);
      renderProductOptions();
    });
    const qtyValue = document.createElement('span');
    qtyValue.className = 'qty-value';
    qtyValue.textContent = String(qty);
    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'qty-btn';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', () => {
      cartQuantities[opt.id] = (cartQuantities[opt.id] || 0) + 1;
      renderProductOptions();
    });
    stepper.appendChild(decBtn);
    stepper.appendChild(qtyValue);
    stepper.appendChild(incBtn);
    card.appendChild(stepper);

    grid.appendChild(card);
  });
}

function renderOptions() {
  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  const item = lineItems[currentPersonalizingIndex];
  config.fontOptions.forEach((opt) => {
    const card = document.createElement('div');
    card.className = 'option-card' + (item && opt.id === item.fontOptionId ? ' selected' : '');
    card.addEventListener('click', () => {
      lineItems[currentPersonalizingIndex].fontOptionId = opt.id;
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
  const top = document.getElementById('colorGridTop');
  const bottom = document.getElementById('colorGridBottom');
  top.innerHTML = '';
  bottom.innerHTML = '';
  const item = lineItems[currentPersonalizingIndex];
  THREAD_COLORS.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'color-swatch' + (item && c.id === item.colorId ? ' selected' : '');
    el.addEventListener('click', () => {
      lineItems[currentPersonalizingIndex].colorId = c.id;
      renderColorOptions();
    });
    const circle = document.createElement('div');
    circle.className = 'swatch-circle';
    circle.style.background = c.hex;
    const lbl = document.createElement('div');
    lbl.className = 'swatch-label';
    lbl.textContent = c.label;
    el.appendChild(circle);
    el.appendChild(lbl);
    (i < THREAD_COLORS_ROW1_COUNT ? top : bottom).appendChild(el);
  });
}

function updateItemProgressLabels() {
  const item = lineItems[currentPersonalizingIndex];
  let text = '';
  if (item) {
    const product = config.productOptions.find((o) => o.id === item.productId);
    text = lineItems.length > 1
      ? `Item ${currentPersonalizingIndex + 1} of ${lineItems.length}${product ? ': ' + product.label : ''}`
      : (product ? product.label : '');
  }
  const el2 = document.getElementById('step2ItemProgress');
  const el3 = document.getElementById('step3ItemProgress');
  if (el2) el2.textContent = text;
  if (el3) el3.textContent = text;
}

function loadInitialsForCurrentItem() {
  const item = lineItems[currentPersonalizingIndex];
  const input = document.getElementById('initialsInput');
  input.value = item ? item.initials : '';
  adjustInitialsFontSize();
}

function renderPaymentOptions() {
  const grid = document.getElementById('paymentGrid');
  grid.innerHTML = '';
  PAYMENT_METHODS.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'payment-card' + (m.id === selectedPaymentMethod ? ' selected' : '');
    card.addEventListener('click', () => {
      selectedPaymentMethod = m.id;
      renderPaymentOptions();
    });
    const icon = document.createElement('div');
    icon.className = 'payment-icon';
    icon.textContent = m.icon;
    const lbl = document.createElement('div');
    lbl.className = 'payment-label';
    lbl.textContent = m.label;
    card.appendChild(icon);
    card.appendChild(lbl);
    grid.appendChild(card);
  });
  updateVenmoQrVisibility();
}

function updateVenmoQrVisibility() {
  const box = document.getElementById('venmoQrBox');
  const img = document.getElementById('venmoQrImage');
  const fallback = document.getElementById('venmoQrFallback');
  if (selectedPaymentMethod !== 'venmo') {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  if (config.venmoQrImage) {
    img.src = config.venmoQrImage;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    fallback.classList.remove('hidden');
  }
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
  const total = Object.values(cartQuantities).reduce((a, b) => a + b, 0);
  if (total === 0) {
    err.textContent = 'Please select at least one item to continue.';
    return false;
  }
  err.textContent = '';
  return true;
}

function validateStep2() {
  const err = document.getElementById('step2Error');
  const item = lineItems[currentPersonalizingIndex];
  if (!item || !item.fontOptionId) {
    err.textContent = 'Please choose a font style to continue.';
    return false;
  }
  if (!item.colorId) {
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

function validateStepPayment() {
  const err = document.getElementById('stepPaymentError');
  if (!selectedPaymentMethod) {
    err.textContent = 'Please choose a payment method to continue.';
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

function buildItemsSummaryFromLineItems() {
  return lineItems.map((li) => {
    const product = config.productOptions.find((o) => o.id === li.productId);
    const style = config.fontOptions.find((o) => o.id === li.fontOptionId);
    const color = THREAD_COLORS.find((c) => c.id === li.colorId);
    return {
      productLabel: product ? product.label : '',
      fontOptionLabel: style ? style.label : '',
      threadColorLabel: color ? color.label : '',
      initials: li.initials || '',
    };
  });
}

async function submitOrder() {
  const fieldLabels = {};
  config.fields.forEach((f) => { fieldLabels[f.id] = f.label; });
  const chosenPayment = PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethod);
  const orderNumber = await getNextOrderNumber();
  const items = buildItemsSummaryFromLineItems();

  const submission = {
    orderNumber,
    timestamp: new Date().toISOString(),
    values: { ...values },
    fieldLabels,
    items,
    paymentMethodLabel: chosenPayment ? chosenPayment.label : '',
    synced: false,
  };

  await addSubmission(submission);
  syncSubmission(config, submission); // fire-and-forget: never block the kiosk flow on network
  document.getElementById('orderNumberDisplay').textContent = orderNumber;
  renderOrderSummary(values.firstName || '', values.lastName || '', submission);
  showStep(findStepIndex('stepDone') + 1);
}

function buildSummaryRow(label, value) {
  if (!value) return null;
  const row = document.createElement('div');
  row.className = 'summary-row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('strong');
  v.textContent = value;
  row.appendChild(l);
  row.appendChild(v);
  return row;
}

function renderGroupedSummary(el, firstName, lastName, items, paymentMethodLabel) {
  el.innerHTML = '';

  const nameRow = buildSummaryRow('Name', `${firstName} ${lastName}`.trim());
  if (nameRow) el.appendChild(nameRow);

  const multiple = items.length > 1;
  items.forEach((item, i) => {
    if (multiple) {
      const heading = document.createElement('div');
      heading.className = 'summary-item-heading';
      heading.textContent = `Item ${i + 1}${item.productLabel ? ': ' + item.productLabel : ''}`;
      el.appendChild(heading);
    } else {
      const itemRow = buildSummaryRow('Item', item.productLabel);
      if (itemRow) el.appendChild(itemRow);
    }
    const styleRow = buildSummaryRow('Font Style', item.fontOptionLabel);
    if (styleRow) el.appendChild(styleRow);
    const colorRow = buildSummaryRow('Thread Color', item.threadColorLabel);
    if (colorRow) el.appendChild(colorRow);
    const textRow = buildSummaryRow('Embroidered Text', item.initials);
    if (textRow) el.appendChild(textRow);
  });

  const paymentRow = buildSummaryRow('Payment', paymentMethodLabel);
  if (paymentRow) el.appendChild(paymentRow);
}

function renderOrderSummary(firstName, lastName, submission) {
  const items = submission.items || [];
  // A fixed-size receipt can't use single-item sizing once there are
  // several items to list — shrink proportionally so it still fits one page.
  const card = document.querySelector('.card');
  card.classList.toggle('receipt-compact', items.length >= 2);
  card.classList.toggle('receipt-tight', items.length >= 4);

  renderGroupedSummary(document.getElementById('orderSummary'), firstName, lastName, items, submission.paymentMethodLabel);
}

function renderReviewSummary() {
  const chosenPayment = PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethod);
  renderGroupedSummary(
    document.getElementById('reviewSummary'),
    values.firstName || '',
    values.lastName || '',
    buildItemsSummaryFromLineItems(),
    chosenPayment ? chosenPayment.label : ''
  );
}

function goNext() {
  const curDescriptor = activeSteps[currentStep - 1];
  const def = STEP_DEFS[curDescriptor.id];
  if (def && def.validate && !def.validate(curDescriptor)) return;
  if (def && def.onLeave) def.onLeave(curDescriptor);

  const nextDescriptor = activeSteps[currentStep]; // currentStep is 1-based, so this is the next entry
  if (nextDescriptor.id === 'stepDone') {
    submitOrder();
    return;
  }
  showStep(currentStep + 1);
  const nextDef = STEP_DEFS[nextDescriptor.id];
  if (nextDef && nextDef.onEnter) nextDef.onEnter(nextDescriptor);
}

function goBack() {
  showStep(currentStep - 1);
  const descriptor = activeSteps[currentStep - 1];
  const def = STEP_DEFS[descriptor.id];
  if (def && def.onEnter) def.onEnter(descriptor);
}

function wireNav() {
  ['toProduct', 'toStep2', 'toStep3', 'submitBtn', 'paymentNextBtn', 'reviewNextBtn'].forEach((id) => {
    document.getElementById(id).addEventListener('click', goNext);
  });
  ['toStep1', 'toProductBack', 'toStep2b', 'paymentBackBtn', 'reviewBackBtn'].forEach((id) => {
    document.getElementById(id).addEventListener('click', goBack);
  });

  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
    document.getElementById('nextFromPrintBtn').classList.remove('hidden');
  });
  document.getElementById('nextFromPrintBtn').addEventListener('click', () => showStep(findStepIndex('stepComplete') + 1));
  document.getElementById('backToPrintBtn').addEventListener('click', () => showStep(findStepIndex('stepDone') + 1));
  document.getElementById('completeBtn').addEventListener('click', () => {
    window.location.reload();
  });

  const initialsInput = document.getElementById('initialsInput');
  let isComposing = false;

  function applyInitialsTransform() {
    // Open to any character (letters from any keyboard/script, numbers,
    // symbols) and any case — only the length limit is enforced here.
    let v = initialsInput.value;
    const max = getInitialsMax();
    if (isFinite(max) && v.length > max) v = v.slice(0, max);
    initialsInput.value = v;
    if (lineItems[currentPersonalizingIndex]) lineItems[currentPersonalizingIndex].initials = v;
    adjustInitialsFontSize();
  }

  initialsInput.addEventListener('compositionstart', () => { isComposing = true; });
  initialsInput.addEventListener('compositionend', () => {
    isComposing = false;
    applyInitialsTransform();
  });
  initialsInput.addEventListener('input', (e) => {
    // Many non-Latin keyboards (incl. common Armenian layouts) build a
    // character over multiple keystrokes via IME composition. Rewriting the
    // field's value mid-composition can silently cancel that in-progress
    // input, so skip the transform until composition finishes.
    if (isComposing || e.isComposing) return;
    applyInitialsTransform();
  });
}

async function init() {
  config = await getConfigOrDefault();
  if (!config.enabledSteps.itemOptions) {
    // No item-selection page means there's implicitly exactly one item to personalize.
    lineItems = [{ productId: null, fontOptionId: null, colorId: null, initials: '' }];
  }
  activeSteps = buildActiveSteps();
  const max = getInitialsMax();
  document.getElementById('initialsHint').textContent = isFinite(max)
    ? `Enter up to ${max} characters to be embroidered.`
    : 'Enter the name or initials to be embroidered.';
  // No native maxlength: it would truncate raw keystrokes before our
  // JS-based length limit runs, which could drop a valid trailing character.
  renderLogo();
  renderFields();
  wireNav();
  showStep(1);
  const firstDescriptor = activeSteps[0];
  const firstDef = STEP_DEFS[firstDescriptor.id];
  if (firstDef && firstDef.onEnter) firstDef.onEnter(firstDescriptor);
  startIdleWatcher();
  requestWakeLock();
  retryPendingSyncs(config); // fire-and-forget: catches up any orders missed while offline
  retryPendingDeletes(config); // fire-and-forget: catches up any deletes missed while offline
}

init();
