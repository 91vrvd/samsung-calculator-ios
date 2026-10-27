// Decimal arithmetic uses integers so common amounts such as 0.1 + 0.2 stay exact.
const TEN = 10n;

function decimal(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) throw new Error('请输入有效数字');
  const fraction = match[3] || '';
  if (fraction.length > 12) throw new Error('最多输入 12 位小数');
  return normalize({
    n: BigInt((match[1] || '') + match[2] + fraction),
    scale: fraction.length
  });
}

function normalize(value) {
  let { n, scale } = value;
  while (scale > 0 && n % TEN === 0n) {
    n /= TEN;
    scale--;
  }
  return { n, scale };
}

function align(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return [a.n * TEN ** BigInt(scale - a.scale), b.n * TEN ** BigInt(scale - b.scale), scale];
}

function decimalString(value) {
  const { n, scale } = normalize(value);
  if (scale === 0) return n.toString();
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString().padStart(scale + 1, '0');
  const result = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${result}` : result;
}

function calculate(left, operator, right, divisionDigits = 4) {
  const a = decimal(left);
  const b = decimal(right);
  if (operator === '+' || operator === '-') {
    const [x, y, scale] = align(a, b);
    return decimalString({ n: operator === '+' ? x + y : x - y, scale });
  }
  if (operator === '×') return decimalString({ n: a.n * b.n, scale: a.scale + b.scale });
  if (operator === '÷') {
    if (b.n === 0n) throw new Error('不能除以 0');
    const digits = Math.max(0, Math.min(12, Number(divisionDigits)));
    const numerator = a.n * TEN ** BigInt(digits + b.scale);
    const denominator = b.n * TEN ** BigInt(a.scale);
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const sameSign = (numerator < 0n) === (denominator < 0n);
    const rounded = remainder !== 0n && (remainder < 0n ? -remainder : remainder) * 2n >= (denominator < 0n ? -denominator : denominator)
      ? quotient + (sameSign ? 1n : -1n)
      : quotient;
    return decimalString({ n: rounded, scale: digits });
  }
  throw new Error('不支持的运算符');
}

function sumValues(values) {
  let sum = { n: 0n, scale: 0 };
  for (const value of values) {
    const [a, b, scale] = align(sum, decimal(value));
    sum = normalize({ n: a + b, scale });
  }
  return decimalString(sum);
}

function formatNumber(value, grouping = false) {
  const [whole, fractional] = String(value).split('.');
  const formatted = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  return fractional === undefined ? formatted : `${formatted}.${fractional}`;
}

function appendExpressionOperator(expression, operator) {
  const current = String(expression);
  if (!['+', '−', '×', '÷'].includes(operator)) return current;
  if (!current) return operator === '−' ? '−' : '';
  const last = current.at(-1);
  if (last === '(') return operator === '−' ? `${current}−` : current;
  if (last === '−' && (current.length === 1 || /[+−×÷(]/.test(current.at(-2)))) {
    if (operator === '−') return current;
    if (current.length === 1 || current.at(-2) === '(') return current;
    return `${current.slice(0, -2)}${operator}`;
  }
  if (/[+−×÷]/.test(last)) {
    return operator === '−' ? `${current}−` : `${current.slice(0, -1)}${operator}`;
  }
  return `${current}${operator}`;
}

// Spell out the result before handing it to the system's Mandarin voice.
// This avoids a speech engine reading a long result digit by digit.
function numberToChinese(value) {
  const raw = String(value).replaceAll(',', '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error('请输入有效数字');
  const digitWords = '零一二三四五六七八九';
  const [wholeRaw, fraction] = raw.replace(/^-/, '').split('.');
  const whole = wholeRaw.replace(/^0+/, '') || '0';
  const units = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'];
  const groupWords = group => {
    const padded = group.padStart(4, '0');
    let result = '';
    let skipped = false;
    for (let i = 0; i < 4; i++) {
      const digit = Number(padded[i]);
      if (!digit) { if (result) skipped = true; continue; }
      if (skipped) result += '零';
      result += digitWords[digit] + ['', '十', '百', '千'][3 - i];
      skipped = false;
    }
    return result;
  };
  let spoken = '';
  let previousIndex = -1;
  let previousNumber = 0;
  if (whole === '0') spoken = '零';
  else {
    for (let end = whole.length, index = 0; end > 0; end -= 4, index++) {
      const group = whole.slice(Math.max(0, end - 4), end);
      const number = Number(group);
      if (!number) continue;
      if (index >= units.length) return `${raw.startsWith('-') ? '负' : ''}${[...whole].map(d => digitWords[Number(d)]).join('')}${fraction ? `点${[...fraction].map(d => digitWords[Number(d)]).join('')}` : ''}`;
      const prefix = groupWords(group) + units[index];
      const gap = spoken && (index > previousIndex + 1 || previousNumber < 1000) ? '零' : '';
      spoken = prefix + gap + spoken;
      previousIndex = index;
      previousNumber = number;
    }
  }
  spoken = spoken.replace(/^一十/, '十');
  if (fraction) spoken += `点${[...fraction].map(d => digitWords[Number(d)]).join('')}`;
  return `${raw.startsWith('-') && spoken !== '零' ? '负' : ''}${spoken}`;
}

function evaluateExpression(expression, divisionDigits = 4) {
  const source = String(expression).replace(/\s/g, '').replace(/−/g, '-');
  let position = 0;
  function primary() {
    if (source[position] === '-') {
      position++;
      const operand = primary();
      return { value: calculate('0', '-', operand.value, divisionDigits), percent: operand.percent };
    }
    let value;
    if (source[position] === '(') {
      position++;
      value = addition().value;
      if (source[position++] !== ')') throw new Error('括号没有配对');
    } else {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
      if (!match) throw new Error('算式不完整');
      value = decimalString(decimal(match[0].startsWith('.') ? `0${match[0]}` : match[0].endsWith('.') ? match[0].slice(0, -1) : match[0]));
      position += match[0].length;
    }
    let percent = false;
    while (source[position] === '%') { position++; value = calculate(value, '÷', '100', divisionDigits); percent = true; }
    return { value, percent };
  }
  function multiplication() {
    let value = primary();
    while (source[position] === '×' || source[position] === '÷') {
      const operator = source[position++];
      value = { value: calculate(value.value, operator, primary().value, divisionDigits), percent: false };
    }
    return value;
  }
  function addition() {
    let value = multiplication();
    while (source[position] === '+' || source[position] === '-') {
      const operator = source[position++];
      const right = multiplication();
      const amount = right.percent ? calculate(value.value, '×', right.value, divisionDigits) : right.value;
      value = { value: calculate(value.value, operator, amount, divisionDigits), percent: false };
    }
    return value;
  }
  if (!source) throw new Error('请输入算式');
  const result = addition();
  if (position !== source.length) throw new Error('算式不完整');
  return result.value;
}

function squareRoot(value, digits = 4) {
  const input = decimal(value);
  if (input.n < 0n) throw new Error('负数不能开平方');
  const places = Math.max(0, Math.min(12, Number(digits)));
  const exponent = 2 * places + 2 - input.scale;
  const target = exponent >= 0 ? input.n * TEN ** BigInt(exponent) : input.n / TEN ** BigInt(-exponent);
  if (target === 0n) return '0';
  let root = target;
  let next = (root + 1n) >> 1n;
  while (next < root) { root = next; next = (root + target / root) >> 1n; }
  const rounded = root / 10n + (root % 10n >= 5n ? 1n : 0n);
  return decimalString({ n: rounded, scale: places });
}


const STORAGE_KEY = 'liushui-calculator-v1';
const $ = id => document.getElementById(id);
const defaults = {
  rows: [], archives: [], trash: [], customColors: [],
  settings: { sound: false, voice: 'mandarin', haptic: false, grouping: false, date: false, unit: false, theme: 'samsung', keyboard: 'classic', fontSize: 'normal', precision: 4, samsungPrecision: 10 }
};

function readState() {
  try {
    const parsed = JSON.parse(window.__nativeInitialState || localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      archives: Array.isArray(parsed.archives) ? parsed.archives : [],
      trash: Array.isArray(parsed.trash) ? parsed.trash : [],
      customColors: [...new Set((Array.isArray(parsed.customColors) ? parsed.customColors : []).map(normalizeHexColor).filter(Boolean))],
      currentEntry: parsed.currentEntry && typeof parsed.currentEntry === 'object' ? parsed.currentEntry : null,
      currentSamsung: typeof parsed.currentSamsung === 'string' ? parsed.currentSamsung : '',
      samsungCompleted: !!parsed.samsungCompleted,
      settings: { ...defaults.settings, ...parsed.settings }
    };
  } catch { return structuredClone(defaults); }
}

let state = readState();
let entry = state.currentEntry || { left: '', op: '', right: '', completed: false };
let samsungExpression = state.currentSamsung || '';
let samsungCompleted = !!state.samsungCompleted;
if (!samsungExpression && (entry.left || entry.op || entry.right)) {
  samsungExpression = `${entry.left || '0'}${entry.op}${entry.right}`;
  samsungCompleted = !!entry.completed;
}
let samsungHistory = false;
let collapsed = false;
let selectedId = null;
let audioContext;
let toastTimer;
let nativeThemeSent;
let previousVoice = 'mandarin';
let persistTimer;
let renderedRowCount = -1;
let renderedTheme = '';
let renderedHistoryMode = false;
let pendingFocusRowId = null;
const appearance = window.matchMedia?.('(prefers-color-scheme: dark)');
const themePresets = {
  samsung: { name: '三星经典（跟随系统）', accent: '#21ba72', deep: '#078c5b', dark: '#138d7b', soft: '#e5f7ec', canvas: '#f6f6f6' },
  'samsung-dark': { name: '三星墨黑', accent: '#1ab79c', deep: '#11957f', dark: '#138d7b', soft: '#dff6f0', canvas: '#f6f6f6' },
  mint: { name: '清晨薄荷', accent: '#38c6a2', deep: '#138d76', dark: '#1ba889', soft: '#dcf7ee', canvas: '#f2f9f6' },
  blue: { name: '冰川蓝', accent: '#4a9fe8', deep: '#2776bc', dark: '#286eaa', soft: '#e0f0fc', canvas: '#f2f7fc' },
  orange: { name: '落日橙', accent: '#eaa34a', deep: '#be7627', dark: '#a76720', soft: '#fdf0dd', canvas: '#fcf7f0' },
  pink: { name: '樱花粉', accent: '#dd7da4', deep: '#b64f7a', dark: '#a94872', soft: '#fbe7ef', canvas: '#fbf5f7' },
  violet: { name: '极光紫', accent: '#a280df', deep: '#7654b8', dark: '#7050ad', soft: '#efe8fc', canvas: '#f8f5fc' },
  graphite: { name: '石墨灰', accent: '#677d92', deep: '#445d73', dark: '#60788d', soft: '#e7edf2', canvas: '#f3f5f7' },
  ember: { name: '暮光橙', accent: '#f2a23b', deep: '#c37720', dark: '#b76f1e', soft: '#fff0d8', canvas: '#faf5ed' }
};
const conversionGroups = [
  { id: 'length', label: '长度', units: [['mm', '毫米', .001], ['cm', '厘米', .01], ['m', '米', 1], ['km', '千米', 1000], ['in', '英寸', .0254], ['ft', '英尺', .3048], ['yd', '码', .9144], ['mi', '英里', 1609.344]] },
  { id: 'mass', label: '重量', units: [['mg', '毫克', .000001], ['g', '克', .001], ['kg', '千克', 1], ['t', '吨', 1000], ['oz', '盎司', .028349523125], ['lb', '磅', .45359237]] },
  { id: 'area', label: '面积', units: [['cm²', '平方厘米', .0001], ['m²', '平方米', 1], ['km²', '平方千米', 1000000], ['ft²', '平方英尺', .09290304], ['acre', '英亩', 4046.8564224]] },
  { id: 'volume', label: '体积', units: [['ml', '毫升', .001], ['L', '升', 1], ['m³', '立方米', 1000], ['fl oz', '美制液盎司', .0295735295625], ['gal', '美制加仑', 3.785411784]] },
  { id: 'temperature', label: '温度', units: [['°C', '摄氏度', 1], ['°F', '华氏度', 1], ['K', '开尔文', 1]] },
  { id: 'speed', label: '速度', units: [['m/s', '米/秒', 1], ['km/h', '千米/小时', 1/3.6], ['mph', '英里/小时', .44704], ['kn', '节', .514444444444]] },
  { id: 'time', label: '时间', units: [['s', '秒', 1], ['min', '分钟', 60], ['h', '小时', 3600], ['d', '天', 86400]] },
  { id: 'data', label: '数据', units: [['B', '字节', 1], ['KB', '千字节', 1000], ['MB', '兆字节', 1000000], ['GB', '吉字节', 1000000000], ['TB', '太字节', 1000000000000]] }
];
let converterState = { category: 'length', from: 'cm', to: 'in', input: '0', rawResult: '0' };

function persist() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  const serialized = JSON.stringify({ ...state, currentEntry: entry, currentSamsung: samsungExpression, samsungCompleted });
  let saved = false;
  try { localStorage.setItem(STORAGE_KEY, serialized); saved = true; } catch { /* native storage remains available */ }
  if (window.webkit?.messageHandlers?.saveState) {
    window.webkit.messageHandlers.saveState.postMessage(serialized);
    saved = true;
  }
  if (!saved) toast('存储空间不足，请先复制记录备份');
}

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 140);
}

function freshId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function displayNumber(value) { return formatNumber(value, state.settings.grouping); }
function samsungExpressionText(value) { return String(value).replace(/\d+(?:\.\d+)?/g, part => formatNumber(part, state.settings.grouping)); }
function samsungDigits() { return state.settings.samsungPrecision; }
function isSamsungTheme() { return !!themePresets[state.settings.theme]; }
function advancedTheme() { return isSamsungTheme(); }
function formattedResult(value) { return formatNumber(value, state.settings.grouping); }
function unitSuffix() { return state.settings.unit ? '(万)' : ''; }
function lastResult() { return [...state.rows].reverse().find(row => row.type === 'calc' || row.type === 'sum')?.result || ''; }

function groupedRows(rows) {
  const groups = [];
  for (const row of rows) {
    const previous = groups.at(-1);
    if (row.type === 'note' && previous && previous.row.type !== 'note') {
      previous.rows.push(row);
      previous.notes.push(row.text);
    } else {
      groups.push({ row, rows: [row], notes: row.note ? [row.note] : [] });
    }
  }
  return groups;
}

function groupForId(rows, id) {
  return groupedRows(rows).find(group => group.rows.some(row => row.id === id));
}

function rowMarker(row) {
  const marker = row.marker || {};
  if (marker.kind === 'color') return { color: marker.value };
  if (marker.kind === 'emoji' || marker.kind === 'image') return { sticker: { kind: marker.kind, value: marker.value } };
  return marker;
}

function renderRows() {
  const ledger = $('ledger');
  const atBottom = ledger.scrollHeight - ledger.scrollTop - ledger.clientHeight < 80;
  const previousScrollTop = ledger.scrollTop;
  const forceLatest = renderedRowCount < 0 || state.rows.length > renderedRowCount || renderedTheme !== state.settings.theme || (samsungHistory && !renderedHistoryMode);
  ledger.replaceChildren();
  for (const group of groupedRows(state.rows)) {
    const { row } = group;
    const item = document.createElement('div');
    item.className = `ledger-row ${row.type === 'note' ? 'note' : ''} ${group.rows.some(part => part.id === selectedId) ? 'selected' : ''}`;
    item.dataset.id = row.id;
    const marker = rowMarker(row);
    if (typeof marker.color === 'string' && /^#[0-9a-f]{6}$/i.test(marker.color)) {
      const red = parseInt(marker.color.slice(1, 3), 16);
      const green = parseInt(marker.color.slice(3, 5), 16);
      const blue = parseInt(marker.color.slice(5, 7), 16);
      item.classList.add('marked-color');
      item.style.backgroundColor = `rgba(${red}, ${green}, ${blue}, .25)`;
    }
    const main = document.createElement('span');
    main.className = 'row-main';
    const samsung = isSamsungTheme();
    const inline = samsung && !samsungHistory;
    if (samsung && samsungHistory && row.type !== 'note') {
      const expressionLength = samsungExpressionText(row.expression).length;
      const resultLength = formattedResult(row.result).length;
      if (expressionLength > 21) item.classList.add('long-expression');
      if (expressionLength > 32) item.classList.add('very-long-expression');
      if (resultLength > 16) item.classList.add('long-result');
      if (resultLength > 25) item.classList.add('very-long-result');
    }
    if (row.type === 'note') main.textContent = row.text;
    else if (inline) main.textContent = `${samsungExpressionText(row.expression)}=${formattedResult(row.result)}${unitSuffix()}`;
    else if (samsung) main.textContent = samsungExpressionText(row.expression);
    else main.textContent = `${row.expression}=${displayNumber(row.result)}${unitSuffix()}`;
    const line = document.createElement('div');
    line.className = 'row-line';
    if (marker.sticker?.kind === 'emoji' && typeof marker.sticker.value === 'string') {
      const badge = document.createElement('span');
      badge.className = 'row-marker emoji-marker';
      badge.textContent = marker.sticker.value.slice(0, 8);
      badge.setAttribute('aria-label', `标记 ${badge.textContent}`);
      line.append(badge);
    } else if (marker.sticker?.kind === 'image' && /^data:image\/(?:jpeg|png|webp);base64,/.test(marker.sticker.value || '')) {
      const badge = document.createElement('img');
      badge.className = 'row-marker image-marker';
      badge.src = marker.sticker.value;
      badge.alt = '图片标记';
      line.append(badge);
    }
    if (group.notes.length) {
      const note = document.createElement('span');
      note.className = 'row-note';
      note.textContent = group.notes.join(' · ');
      note.setAttribute('role', 'button');
      note.tabIndex = 0;
      note.setAttribute('aria-label', '查看备注');
      note.addEventListener('click', event => { event.stopPropagation(); showNoteDetails(row.id); });
      note.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); showNoteDetails(row.id); }
      });
      line.append(note);
    }
    line.append(main);
    item.append(line);
    if (samsung && samsungHistory && row.type !== 'note') {
      const result = document.createElement('span');
      result.className = 'row-result';
      result.textContent = `=${formattedResult(row.result)}${unitSuffix()}`;
      item.append(result);
    }
    if (state.settings.date) {
      const date = document.createElement('span');
      date.className = 'row-date';
      date.textContent = new Date(row.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      item.append(date);
    }
    let longTimer;
    let longOpened = false;
    item.addEventListener('pointerdown', () => {
      longOpened = false;
      longTimer = setTimeout(() => { longOpened = true; selectedId = row.id; renderRows(); openRowActions(row.id); }, 450);
    });
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) item.addEventListener(eventName, () => clearTimeout(longTimer));
    item.addEventListener('click', () => {
      if (longOpened) return;
      if (isSamsungTheme() && samsungHistory && row.result !== undefined) {
        samsungExpression = row.result;
        samsungCompleted = false;
        samsungHistory = false;
        selectedId = null;
        persist(); render();
      } else if (isSamsungTheme()) {
        selectedId = row.id;
        renderRows();
        openRowActions(row.id);
      } else {
        selectedId = row.id;
        renderRows();
      }
    });
    item.addEventListener('contextmenu', event => { event.preventDefault(); clearTimeout(longTimer); selectedId = row.id; renderRows(); openRowActions(row.id); });
    ledger.append(item);
  }
  renderedRowCount = state.rows.length;
  renderedTheme = state.settings.theme;
  renderedHistoryMode = samsungHistory;
  const focusId = pendingFocusRowId;
  pendingFocusRowId = null;
  requestAnimationFrame(() => {
    if (focusId) {
      const focusRow = Array.from(ledger.children).find(item => item.dataset.id === focusId);
      focusRow?.scrollIntoView({ block: 'nearest' });
    } else if (forceLatest || atBottom) ledger.scrollTop = ledger.scrollHeight;
    else ledger.scrollTop = previousScrollTop;
  });
}

function renderEntry() {
  const samsung = advancedTheme();
  let text = samsung ? samsungExpression : entry.left || '0';
  if (!samsung && entry.op) text = `${entry.left || '0'}${entry.op}${entry.right}`;
  else if (!samsung && entry.left) text = displayNumber(entry.left);
  const content = $('entryText');
  if (samsung) {
    content.replaceChildren();
    if (samsungCompleted) content.textContent = `${formattedResult(text)}${unitSuffix()}`;
    else {
      for (const token of text.match(/\d+(?:\.\d*)?|\.\d+|[+−×÷()%]/g) || []) {
        const span = document.createElement('span');
        span.textContent = /^\d|^\./.test(token) ? formattedResult(token.startsWith('.') ? `0${token}` : token) : token;
        if (/[+−×÷%]/.test(token)) span.className = 'operator';
        content.append(span);
      }
    }
    let preview = '';
    if (!samsungCompleted && /[\d)%]$/.test(samsungExpression) && /[\d)%][+−×÷]/.test(samsungExpression)) {
      try { preview = `${formattedResult(evaluateExpression(samsungExpression, samsungDigits()))}${unitSuffix()}`; } catch { /* unfinished expression */ }
    }
    $('samsungPreview').textContent = preview;
    $('samsungPreview').hidden = !preview;
  } else {
    content.textContent = text;
    $('samsungPreview').hidden = true;
  }
  $('entry').classList.toggle('empty', samsung && !text);
  $('entry').classList.toggle('completed', samsung && samsungCompleted);
  requestAnimationFrame(() => { $('entry').scrollLeft = $('entry').scrollWidth; });
}

function render() {
  const samsung = isSamsungTheme();
  const ember = false;
  const samsungDark = samsung && (state.settings.theme === 'samsung-dark' || !!appearance?.matches);
  $('app').classList.toggle('samsung', samsung);
  $('app').classList.toggle('samsung-dark', samsungDark);
  $('app').classList.toggle('ember', ember);
  $('app').classList.toggle('history-view', samsung && samsungHistory);
  renderRows(); renderEntry();
  $('samsungToolbar').hidden = !samsung;
  $('samsungKeyboard').hidden = !samsung || samsungHistory;
  $('samsungHistoryPanel').hidden = !samsung || !samsungHistory;
  $('emberKeyboard').hidden = !ember;
  $('emberTabbar').hidden = !ember;
  $('emberMenu').hidden = !ember;
  $('emberSpeaker').textContent = state.settings.voice === 'none' ? '◖×' : '◖)))';
  $('samsungHistoryToggle').setAttribute('aria-label', samsungHistory ? '返回计算器' : '历史记录');
  if (nativeThemeSent !== state.settings.theme && window.webkit?.messageHandlers?.themeChanged) {
    window.webkit.messageHandlers.themeChanged.postMessage(state.settings.theme);
    nativeThemeSent = state.settings.theme;
  }
  $('app').classList.toggle('collapsed', collapsed);
  $('keyboard').hidden = collapsed;
  $('archiveBar').hidden = !collapsed;
  $('collapseButton').setAttribute('aria-label', collapsed ? '展开键盘' : '收起键盘');
  const preset = themePresets[state.settings.theme] || themePresets.samsung;
  document.documentElement.style.setProperty('--accent', preset.accent);
  document.documentElement.style.setProperty('--theme-accent', preset.accent);
  document.documentElement.style.setProperty('--theme-deep', preset.deep);
  document.documentElement.style.setProperty('--theme-dark-accent', preset.dark);
  document.documentElement.style.setProperty('--theme-soft', preset.soft);
  document.documentElement.style.setProperty('--theme-canvas', preset.canvas);
  $('settings').classList.toggle('samsung-settings', samsung);
  $('settings').classList.toggle('samsung-dark-settings', samsungDark);
  $('sheet').classList.toggle('samsung-sheet', samsung);
  $('sheet').classList.toggle('samsung-dark-sheet', samsungDark);
  $('soundPage').classList.toggle('samsung-sound-page', samsung);
  $('soundPage').classList.toggle('samsung-dark-sound-page', samsungDark);
  $('converter').classList.toggle('samsung-dark-converter', samsungDark);
  document.body.classList.toggle('samsung-dark-body', samsungDark);
  document.documentElement.style.setProperty('--font-multiplier', { small: .85, normal: 1, large: 1.18 }[state.settings.fontSize] || 1);
  $('keyboard').classList.toggle('compact', state.settings.keyboard === 'compact');
  $('samsungKeyboard').classList.toggle('compact', state.settings.keyboard === 'compact');
  $('emberKeyboard').classList.toggle('compact', state.settings.keyboard === 'compact');
  $('hapticSetting').checked = !!state.settings.haptic;
  $('groupingSetting').checked = !!state.settings.grouping;
  $('dateSetting').checked = !!state.settings.date;
  $('unitSetting').checked = !!state.settings.unit;
  $('themeValue').textContent = `${preset.name} ›`;
  $('voiceValue').textContent = { none: '无', default: '默认语音', mandarin: '普通话物理计算器', male: '普通话男声', female: '普通话女声', click: '点击声' }[state.settings.voice] + ' ›';
  $('keyboardValue').textContent = state.settings.keyboard === 'compact' ? '紧凑 ›' : '经典 ›';
  $('fontSizeValue').textContent = { small: '小', normal: '标准', large: '大' }[state.settings.fontSize] + ' ›';
  $('precisionValue').textContent = `${advancedTheme() ? samsungDigits() : state.settings.precision} 位 ›`;
  document.querySelectorAll('[data-voice]').forEach(button => { button.querySelector('span').textContent = button.dataset.voice === state.settings.voice ? '✓' : ''; });
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200);
}

function feedback() {
  if (state.settings.haptic) {
    if (window.webkit?.messageHandlers?.haptic) window.webkit.messageHandlers.haptic.postMessage('light');
    else navigator.vibrate?.(10);
  }
  if (state.settings.sound || state.settings.voice === 'click') {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 620;
      gain.gain.setValueAtTime(.025, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .045);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + .05);
    } catch { /* sound is optional */ }
  }
}

function speak(text) {
  if (['none', 'click'].includes(state.settings.voice) || !text) return;
  const mode = state.settings.voice;
  if (window.webkit?.messageHandlers?.speakText) {
    window.webkit.messageHandlers.speakText.postMessage({ text, mode });
    return;
  }
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = mode === 'male' ? .88 : mode === 'female' ? 1.08 : mode === 'mandarin' ? 1.18 : 1;
    utterance.pitch = mode === 'male' ? .72 : mode === 'female' ? 1.25 : 1;
    const chineseVoices = speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('zh'));
    if (mode === 'female' && chineseVoices.length > 1) utterance.voice = chineseVoices.at(-1);
    else if (chineseVoices.length) utterance.voice = chineseVoices[0];
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  }
}

function speakKey(key) {
  const names = { '.': '点', '+': '加', '−': '减', '×': '乘以', '÷': '除以', '%': '百分比', 'C': '清除', 'back': '退位', '(': '左括号', ')': '右括号', '()': '括号', sign: '正负切换' };
  if (key !== '=') speak(/^[0-9]$/.test(key) ? '零一二三四五六七八九'[Number(key)] : names[key]);
}

function speakResult(result) {
  if (result) speak(`等于${numberToChinese(result)}`);
}

function appendDigit(key) {
  if (entry.completed) entry = { left: '', op: '', right: '', completed: false };
  const side = entry.op ? 'right' : 'left';
  let value = entry[side];
  if (key === '.') {
    if (value.includes('.')) return;
    value = value ? `${value}.` : '0.';
  } else {
    if (value.replace(/\D/g, '').length >= 64) { toast('最多输入 64 位数字'); return; }
    value = value === '0' ? key : value + key;
  }
  entry[side] = value;
}

function pushCalculation() {
  if (!entry.op || !entry.right || entry.right.endsWith('.')) return;
  const operator = entry.op === '−' ? '-' : entry.op;
  try {
    const result = calculate(entry.left || '0', operator, entry.right, state.settings.precision);
    const expression = `${entry.left || '0'}${entry.op}${entry.right}`;
    state.rows.push({ id: freshId(), type: 'calc', expression, result, at: Date.now() });
    entry = { left: result, op: '', right: '', completed: true };
    selectedId = null;
    persist();
  } catch (error) { toast(error.message); }
}

function pressKey(key) {
  feedback(); speakKey(key);
  if (/^[0-9.]$/.test(key)) appendDigit(key);
  else if (key === 'C') entry = { left: '', op: '', right: '', completed: false };
  else if (key === 'back') {
    if (entry.completed) entry.completed = false;
    else if (entry.op && entry.right) entry.right = entry.right.slice(0, -1);
    else if (entry.op) entry.op = '';
    else entry.left = entry.left.slice(0, -1);
  } else if (['+', '−', '×', '÷'].includes(key)) {
    if (entry.op && entry.right) pushCalculation();
    if (!entry.left) entry.left = lastResult() || '0';
    entry.op = key; entry.completed = false;
  } else if (key === '=') { pushCalculation(); if (entry.completed) speakResult(entry.left); }
  persist(); render();
}

function pressSamsungKey(key) {
  feedback(); speakKey(key);
  const wasInHistory = samsungHistory;
  const oldRowCount = state.rows.length;
  if (samsungHistory) samsungHistory = false;
  if (key === 'C') { samsungExpression = ''; samsungCompleted = false; }
  else if (key === 'back') { samsungExpression = samsungExpression.slice(0, -1); samsungCompleted = false; }
  else if (/^[0-9.]$/.test(key)) {
    if (samsungCompleted) samsungExpression = '';
    samsungCompleted = false;
    if (samsungExpression.replace(/\D/g, '').length >= 64) { toast('最多输入 64 位数字'); return; }
    const segment = samsungExpression.split(/[+−×÷()%]/).pop();
    if (key === '.' && segment.includes('.')) return;
    if (/[)%]$/.test(samsungExpression)) samsungExpression += '×';
    if (key === '.' && !segment) samsungExpression += '0';
    samsungExpression += key;
  } else if (key === '()' || key === '(' || key === ')') {
    if (samsungCompleted) samsungExpression = '';
    const open = [...samsungExpression].filter(char => char === '(').length;
    const close = [...samsungExpression].filter(char => char === ')').length;
    const previous = samsungExpression.slice(-1);
    const shouldClose = key === ')' || (key === '()' && open > close && /[\d)%]/.test(previous));
    if (shouldClose) {
      if (open > close && /[\d)%]/.test(previous)) samsungExpression += ')';
    } else samsungExpression += /[\d)%]/.test(previous) ? '×(' : '(';
    samsungCompleted = false;
  } else if (key === 'sign') {
    const wrappedNegative = /\(−(\d+(?:\.\d*)?)\)$/.exec(samsungExpression);
    const match = /\d+(?:\.\d*)?$/.exec(samsungExpression);
    if (samsungCompleted && /^-?\d/.test(samsungExpression)) {
      samsungExpression = calculate('0', '-', samsungExpression, samsungDigits());
      samsungCompleted = true;
    } else if (wrappedNegative) {
      samsungExpression = samsungExpression.slice(0, wrappedNegative.index) + wrappedNegative[1];
    } else if (match) {
      const start = match.index;
      const before = samsungExpression.slice(0, start);
      samsungExpression = `${before}(−${match[0]})`;
    }
  } else if (key === '%') {
    if (/[\d)]$/.test(samsungExpression)) samsungExpression += '%';
    samsungCompleted = false;
  } else if (['+', '−', '×', '÷'].includes(key)) {
    samsungExpression = appendExpressionOperator(samsungExpression, key);
    samsungCompleted = false;
  } else if (key === '=') {
    try {
      const result = evaluateExpression(samsungExpression, samsungDigits());
      state.rows.push({ id: freshId(), type: 'calc', expression: samsungExpression, result, at: Date.now() });
      samsungExpression = result;
      samsungCompleted = true;
      selectedId = null;
      speakResult(result);
    } catch (error) { toast(error.message); }
  }
  if (state.rows.length !== oldRowCount || wasInHistory) persist();
  else persistSoon();
  if (wasInHistory || state.rows.length !== oldRowCount) render();
  else renderEntry();
}

function pressSamsungRoot() {
  try {
    const original = samsungExpression || lastResult() || '0';
    const value = evaluateExpression(original, samsungDigits());
    const result = squareRoot(value, samsungDigits());
    state.rows.push({ id: freshId(), type: 'calc', expression: `√(${original})`, result, at: Date.now() });
    samsungExpression = result; samsungCompleted = true; selectedId = null;
    speakResult(result);
    persist(); render();
  } catch (error) { toast(error.message); }
}

function convertSamsung() {
  const source = samsungExpression || lastResult();
  if (/^-?\d+(?:\.\d*)?$/.test(source)) converterState.input = source.replace(/\.$/, '') || '0';
  $('converter').hidden = false;
  renderConverter();
}

function conversionCategory() { return conversionGroups.find(group => group.id === converterState.category) || conversionGroups[0]; }

function fillConverterUnits() {
  for (const [element, selected] of [[$('converterFrom'), converterState.from], [$('converterTo'), converterState.to]]) {
    element.replaceChildren();
    for (const [id, label] of conversionCategory().units) {
      const option = document.createElement('option');
      option.value = id; option.textContent = `${label} (${id})`;
      element.append(option);
    }
    element.value = selected;
  }
}

function convertValue(value, from, to) {
  if (converterState.category === 'temperature') {
    const celsius = from === '°F' ? (value - 32) * 5 / 9 : from === 'K' ? value - 273.15 : value;
    return to === '°F' ? celsius * 9 / 5 + 32 : to === 'K' ? celsius + 273.15 : celsius;
  }
  const units = conversionCategory().units;
  return value * units.find(unit => unit[0] === from)[2] / units.find(unit => unit[0] === to)[2];
}

function renderConverter() {
  const categories = $('converterCategories');
  categories.replaceChildren();
  for (const group of conversionGroups) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = group.label;
    button.className = group.id === converterState.category ? 'active' : '';
    button.addEventListener('click', () => {
      converterState.category = group.id;
      converterState.from = group.units[0][0];
      converterState.to = group.units[1][0];
      renderConverter();
    });
    categories.append(button);
  }
  categories.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  fillConverterUnits();
  $('converterInput').textContent = formatNumber(converterState.input, true);
  const value = Number(converterState.input);
  const result = convertValue(value, converterState.from, converterState.to);
  if (!Number.isFinite(result) || Math.abs(result) >= 1e21) {
    converterState.rawResult = '';
    $('converterOutput').textContent = '数值过大';
  } else {
    const places = result && Math.abs(result) < .000001 ? Math.min(12, Math.ceil(-Math.log10(Math.abs(result))) + 5) : 6;
    converterState.rawResult = result.toFixed(places).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    $('converterOutput').textContent = formatNumber(converterState.rawResult, true);
  }
}

function pressConverterKey(key) {
  let input = converterState.input;
  if (key === 'copy') { if (converterState.rawResult) copyText(converterState.rawResult); return; }
  if (key === 'clear') input = '0';
  else if (key === 'back') input = input.length <= 1 || input === '-0' ? '0' : input.slice(0, -1);
  else if (key === 'sign') input = input.startsWith('-') ? input.slice(1) : `-${input}`;
  else if (key === '.') { if (!input.includes('.')) input += '.'; }
  else if (input.replace(/\D/g, '').length < 15) input = input === '0' ? key.replace(/^0+/, '') || '0' : input === '-0' ? `-${key.replace(/^0+/, '') || '0'}` : input + key;
  converterState.input = input;
  renderConverter();
}

function closeSheet() { $('overlay').hidden = true; $('sheet').hidden = true; $('sheet').classList.remove('marker-picker', 'color-picker'); $('sheet').replaceChildren(); }
function showSheet(title, actions, input = null, body = null) {
  closeSheet();
  $('overlay').hidden = false;
  $('sheet').hidden = false;
  const titleNode = document.createElement('div');
  titleNode.className = 'sheet-title'; titleNode.textContent = title;
  $('sheet').append(titleNode);
  if (body !== null) {
    const message = document.createElement('div');
    message.className = 'sheet-message';
    message.textContent = body;
    $('sheet').append(message);
  }
  let field;
  if (input !== null) {
    field = document.createElement(input.multiline ? 'textarea' : 'input');
    if (!input.multiline) field.type = 'text';
    field.maxLength = input.multiline ? 500 : 80;
    if (input.multiline) field.rows = 4;
    field.placeholder = input.placeholder || '';
    field.value = input.value || '';
    $('sheet').append(field);
    setTimeout(() => field.focus(), 80);
  }
  for (const action of [...actions, { label: '取消', cancel: true }]) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = action.label;
    if (action.danger) button.classList.add('danger');
    if (action.cancel) button.classList.add('cancel');
    button.addEventListener('click', () => {
      const value = field?.value.trim();
      closeSheet();
      if (!action.cancel) action.run?.(value);
    });
    $('sheet').append(button);
  }
}

function insertSum(id, sectionOnly) {
  const index = state.rows.findIndex(row => row.id === id);
  if (index < 0) return;
  const group = groupForId(state.rows, id);
  const afterGroup = state.rows.findIndex(row => row.id === group.rows.at(-1).id) + 1;
  let start = 0;
  if (sectionOnly) {
    for (let i = index - 1; i >= 0; i--) if (state.rows[i].type === 'sum' || state.rows[i].type === 'note') { start = i + 1; break; }
  }
  const values = state.rows.slice(start, index + 1).filter(row => row.type === 'calc').map(row => row.result);
  if (!values.length) { toast('这一段没有可求和的算式'); return; }
  const result = sumValues(values);
  state.rows.splice(afterGroup, 0, { id: freshId(), type: 'sum', expression: sectionOnly ? '分段合计' : '合计', result, at: Date.now() });
  persist(); render();
}

async function copyText(text) {
  if (window.webkit?.messageHandlers?.copyText) {
    window.webkit.messageHandlers.copyText.postMessage(text);
    toast('已复制');
    return;
  }
  try { await navigator.clipboard.writeText(text); toast('已复制'); }
  catch { toast('复制失败，请在 Safari 中重试'); }
}

function rowText(group) {
  const { row, notes } = group;
  return row.type === 'note' ? row.text : `${row.expression}=${row.result}${notes.length ? `  ${notes.join(' · ')}` : ''}`;
}

function rowsText(rows) { return groupedRows(rows).map(rowText).join('\n'); }

function showNoteDetails(id) {
  const group = groupForId(state.rows, id);
  if (!group?.notes.length) return;
  const fullText = group.notes.join('\n');
  showSheet('完整备注', [
    { label: '编辑备注', run: () => editNotes(id) },
    { label: '复制备注', run: () => copyText(fullText) }
  ], null, fullText);
}

function editNotes(id) {
  const group = groupForId(state.rows, id);
  if (!group) return;
  const sources = [
    ...(group.row.note ? [{ row: group.row, key: 'note' }] : []),
    ...group.rows.filter(row => row.type === 'note').map(row => ({ row, key: 'text' }))
  ];
  const edit = source => showSheet('编辑备注', [{ label: '保存修改', run: value => {
    if (value) source.row[source.key] = value;
    else if (source.key === 'note') delete source.row.note;
    else state.rows = state.rows.filter(row => row.id !== source.row.id);
    pendingFocusRowId = group.row.id;
    persist(); render(); toast(value ? '备注已修改' : '备注已删除');
  } }], { placeholder: '修改这条备注', value: source.row[source.key], multiline: true }, '留空后点“保存修改”会删除这条备注。');
  if (sources.length === 1) edit(sources[0]);
  else if (sources.length > 1) showSheet('选择要修改的备注', sources.map((source, index) => ({
    label: `${index + 1}. ${source.row[source.key].slice(0, 20)}`,
    run: () => edit(source)
  })));
}

const markerColors = [
  ['珊瑚红', '#ff6675'], ['蜜桃橙', '#ffad70'], ['柠檬黄', '#f4d958'], ['草木绿', '#a8df61'],
  ['薄荷绿', '#62d5af'], ['海洋蓝', '#78bdfa'], ['薰衣草', '#ba9af2'], ['樱花粉', '#f79dcd']
];

function normalizeHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function rememberCustomColor(value) {
  const color = normalizeHexColor(value);
  if (!color || markerColors.some(([, preset]) => preset === color)) return;
  state.customColors = [color, ...state.customColors.filter(saved => saved !== color)];
}

function recoverUsedColors() {
  const existing = new Set(state.customColors);
  const rows = [...state.rows].reverse();
  for (const archive of state.archives) if (Array.isArray(archive.rows)) rows.push(...[...archive.rows].reverse());
  rows.push(...state.trash);
  for (const row of rows) {
    const color = normalizeHexColor(rowMarker(row).color);
    if (color && !existing.has(color) && !markerColors.some(([, preset]) => preset === color)) {
      state.customColors.push(color);
      existing.add(color);
    }
  }
}
recoverUsedColors();

function hsvToHex(hue, saturation, brightness) {
  const chroma = brightness * saturation;
  const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const base = brightness - chroma;
  const parts = hue < 60 ? [chroma, second, 0] : hue < 120 ? [second, chroma, 0] : hue < 180 ? [0, chroma, second] : hue < 240 ? [0, second, chroma] : hue < 300 ? [second, 0, chroma] : [chroma, 0, second];
  return `#${parts.map(part => Math.round((part + base) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsv(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels;
  const max = Math.max(...channels), min = Math.min(...channels), spread = max - min;
  let hue = 0;
  if (spread) {
    if (max === red) hue = 60 * (((green - blue) / spread) % 6);
    else if (max === green) hue = 60 * ((blue - red) / spread + 2);
    else hue = 60 * ((red - green) / spread + 4);
  }
  return { hue: (hue + 360) % 360, saturation: max ? spread / max : 0, brightness: max };
}

function saveRowMarker(id, marker) {
  const row = groupForId(state.rows, id)?.row;
  if (!row) return;
  if (marker) {
    if (marker.color) rememberCustomColor(marker.color);
    const next = { ...rowMarker(row), ...marker };
    if (!next.color) delete next.color;
    if (!next.sticker) delete next.sticker;
    if (Object.keys(next).length) row.marker = next;
    else delete row.marker;
  } else delete row.marker;
  selectedId = null;
  pendingFocusRowId = row.id;
  persist();
  render();
  closeSheet();
  toast(marker ? '标注已保存' : '已清除标注');
}

function showCustomColorPicker(id, initial) {
  closeSheet();
  const sheet = $('sheet');
  sheet.classList.add('color-picker');
  $('overlay').hidden = false;
  sheet.hidden = false;
  const title = document.createElement('div');
  title.className = 'sheet-title'; title.textContent = '自选颜色';
  sheet.append(title);
  let { hue, saturation, brightness } = hexToHsv(initial);
  let current = initial;
  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('aria-label', '拖动选择颜色');
  const cursor = document.createElement('span');
  cursor.className = 'color-palette-cursor';
  palette.append(cursor);
  sheet.append(palette);
  const hueSlider = document.createElement('input');
  hueSlider.className = 'color-hue';
  hueSlider.type = 'range'; hueSlider.min = '0'; hueSlider.max = '359'; hueSlider.value = String(Math.round(hue));
  hueSlider.setAttribute('aria-label', '色相');
  sheet.append(hueSlider);
  const details = document.createElement('div');
  details.className = 'color-details';
  const preview = document.createElement('span');
  preview.className = 'color-preview';
  const hexInput = document.createElement('input');
  hexInput.type = 'text'; hexInput.maxLength = 7; hexInput.value = current;
  hexInput.setAttribute('aria-label', '十六进制颜色');
  details.append(preview, hexInput);
  sheet.append(details);
  const update = () => {
    palette.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
    cursor.style.left = `${saturation * 100}%`;
    cursor.style.top = `${(1 - brightness) * 100}%`;
    preview.style.backgroundColor = current;
    hexInput.value = current;
  };
  const pick = event => {
    const rect = palette.getBoundingClientRect();
    saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    brightness = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    current = hsvToHex(hue, saturation, brightness);
    update();
  };
  palette.addEventListener('pointerdown', event => { palette.setPointerCapture(event.pointerId); pick(event); });
  palette.addEventListener('pointermove', event => { if (event.buttons) pick(event); });
  hueSlider.addEventListener('input', () => { hue = Number(hueSlider.value); current = hsvToHex(hue, saturation, brightness); update(); });
  hexInput.addEventListener('change', () => {
    const value = hexInput.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) { toast('请输入 #RRGGBB 格式'); update(); return; }
    current = value.toLowerCase();
    ({ hue, saturation, brightness } = hexToHsv(current));
    hueSlider.value = String(Math.round(hue));
    update();
  });
  const apply = document.createElement('button');
  apply.type = 'button'; apply.textContent = '使用此颜色';
  apply.addEventListener('click', () => {
    const value = hexInput.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) { toast('请输入 #RRGGBB 格式'); return; }
    saveRowMarker(id, { color: value.toLowerCase() });
  });
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'cancel'; back.textContent = '返回颜色标注';
  back.addEventListener('click', () => showMarkerPicker(id));
  sheet.append(apply, back);
  update();
}

function showMarkerPicker(id) {
  const row = groupForId(state.rows, id)?.row;
  if (!row) return;
  const current = rowMarker(row);
  closeSheet();
  const sheet = $('sheet');
  sheet.classList.add('marker-picker');
  $('overlay').hidden = false;
  sheet.hidden = false;
  const title = document.createElement('div');
  title.className = 'sheet-title';
  title.textContent = '颜色标注';
  sheet.append(title);
  const caption = document.createElement('p');
  caption.className = 'marker-caption';
  caption.textContent = '半透明颜色可与表情或图片同时使用';
  sheet.append(caption);
  const colors = document.createElement('div');
  colors.className = 'marker-swatches';
  for (const [name, value] of markerColors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'marker-swatch';
    button.style.backgroundColor = value;
    button.setAttribute('aria-label', name);
    button.title = name;
    if (current.color === value) button.classList.add('current');
    button.addEventListener('click', () => saveRowMarker(id, { color: value }));
    colors.append(button);
  }
  sheet.append(colors);
  if (state.customColors.length) {
    const savedCaption = document.createElement('p');
    savedCaption.className = 'marker-caption marker-subtitle';
    savedCaption.textContent = '我的颜色 · 点选后可重复使用';
    sheet.append(savedCaption);
    const savedColors = document.createElement('div');
    savedColors.className = 'marker-saved-colors';
    for (const value of state.customColors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `使用我的颜色 ${value}`);
      if (current.color?.toLowerCase() === value) button.classList.add('current');
      const swatch = document.createElement('span');
      swatch.className = 'marker-saved-swatch';
      swatch.style.backgroundColor = value;
      const code = document.createElement('span');
      code.textContent = value.toUpperCase();
      button.append(swatch, code);
      button.addEventListener('click', () => saveRowMarker(id, { color: value }));
      savedColors.append(button);
    }
    sheet.append(savedColors);
  }
  const custom = document.createElement('div');
  custom.className = 'marker-custom';
  const colorLabel = document.createElement('span');
  colorLabel.textContent = '自选颜色';
  const openPalette = document.createElement('button');
  openPalette.type = 'button';
  openPalette.textContent = '打开调色盘 ›';
  openPalette.addEventListener('click', () => showCustomColorPicker(id, current.color || '#ff6675'));
  custom.append(colorLabel, openPalette);
  sheet.append(custom);
  const emojiCaption = document.createElement('p');
  emojiCaption.className = 'marker-caption marker-subtitle';
  emojiCaption.textContent = '或者用表情标记';
  sheet.append(emojiCaption);
  const emojis = document.createElement('div');
  emojis.className = 'marker-emojis';
  for (const value of ['📌', '💰', '🛒', '🏠', '🎁', '📅', '⭐', '⚠️']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = value;
    button.setAttribute('aria-label', `使用${value}标记`);
    if (current.sticker?.kind === 'emoji' && current.sticker.value === value) button.classList.add('current');
    button.addEventListener('click', () => saveRowMarker(id, { sticker: { kind: 'emoji', value } }));
    emojis.append(button);
  }
  sheet.append(emojis);
  const photoLabel = document.createElement('label');
  photoLabel.className = 'marker-photo';
  photoLabel.textContent = '从图片取色或使用图片标记';
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.setAttribute('aria-label', '选择用于取色或标记的图片');
  photoLabel.append(photoInput);
  sheet.append(photoLabel);
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10_000_000) { toast('请选择小于 10 MB 的图片'); return; }
    try {
      let bitmap;
      try { bitmap = await createImageBitmap(file); }
      catch {
        const url = URL.createObjectURL(file);
        try {
          bitmap = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = url;
          });
        } finally { URL.revokeObjectURL(url); }
      }
      const canvas = document.createElement('canvas');
      canvas.width = 96; canvas.height = 96;
      const context = canvas.getContext('2d');
      const side = Math.min(bitmap.width, bitmap.height);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 96, 96);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 96, 96);
      bitmap.close?.();
      const pixels = context.getImageData(0, 0, 96, 96).data;
      const totals = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 16) {
        totals[0] += pixels[i]; totals[1] += pixels[i + 1]; totals[2] += pixels[i + 2];
      }
      const count = pixels.length / 16;
      const pickedColor = `#${totals.map(total => Math.round(total / count).toString(16).padStart(2, '0')).join('')}`;
      const imageData = canvas.toDataURL('image/jpeg', .72);
      showSheet('使用这张图片', [
        { label: '提取颜色作半透明底色', run: () => saveRowMarker(id, { color: pickedColor }) },
        { label: '图片作小标记', run: () => saveRowMarker(id, { sticker: { kind: 'image', value: imageData } }) }
      ], null, '可用图片的平均颜色标注整行，也可把缩小的图片放在算式旁边。');
    } catch { toast('图片读取失败，请换一张重试'); }
  });
  if (current.color) {
    const clearColor = document.createElement('button');
    clearColor.type = 'button'; clearColor.className = 'marker-clear'; clearColor.textContent = '清除底色';
    clearColor.addEventListener('click', () => saveRowMarker(id, { color: null }));
    sheet.append(clearColor);
  }
  if (current.sticker) {
    const clearSticker = document.createElement('button');
    clearSticker.type = 'button'; clearSticker.className = 'marker-clear'; clearSticker.textContent = '清除表情／图片';
    clearSticker.addEventListener('click', () => saveRowMarker(id, { sticker: null }));
    sheet.append(clearSticker);
  }
  if (current.color || current.sticker) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'marker-clear';
    clear.textContent = '清除全部标注';
    clear.addEventListener('click', () => saveRowMarker(id, null));
    sheet.append(clear);
  }
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'cancel'; cancel.textContent = '取消';
  cancel.addEventListener('click', closeSheet);
  sheet.append(cancel);
}

function openRowActions(id) {
  const row = state.rows.find(item => item.id === id);
  if (!row) return;
  showSheet('这条记录', [
    ...(groupForId(state.rows, id)?.notes.length ? [{ label: '查看备注', run: () => showNoteDetails(id) }] : []),
    ...(groupForId(state.rows, id)?.notes.length ? [{ label: '编辑备注', run: () => editNotes(id) }] : []),
    { label: '插入备注', run: () => showSheet('写备注', [{ label: '保存备注', run: text => {
      if (!text) return;
      const group = groupForId(state.rows, id);
      if (!group) return;
      const index = state.rows.findIndex(item => item.id === group.rows.at(-1).id);
      state.rows.splice(index + 1, 0, { id: freshId(), type: 'note', text, at: Date.now() });
      pendingFocusRowId = group.row.id;
      persist(); render();
    } }], { placeholder: '输入备注', multiline: true }) },
    { label: '颜色标注', run: () => showMarkerPicker(id) },
    { label: '分段求和', run: () => insertSum(id, true) },
    { label: '求和', run: () => insertSum(id, false) },
    ...(row.result !== undefined ? [{ label: '复制答案', run: () => copyText(row.result) }] : []),
    { label: '复制该行', run: () => copyText(rowText(groupForId(state.rows, id))) },
    { label: '复制全部', run: () => copyText(rowsText(state.rows)) },
    { label: '删除该行', danger: true, run: () => {
      const group = groupForId(state.rows, id);
      if (!group) return;
      state.trash.unshift(...rowsForTrash(group.rows));
      const ids = new Set(group.rows.map(part => part.id));
      state.rows = state.rows.filter(item => !ids.has(item.id));
      selectedId = null; persist(); render();
    } },
    { label: '清空', danger: true, run: confirmClear }
  ]);
}

function rowsForTrash(rows) {
  const deletedAt = Date.now();
  const deletedBatchId = freshId();
  return rows.map((row, deletedOrder) => ({ ...structuredClone(row), deletedAt, deletedBatchId, deletedOrder }));
}

function restoredTrashRow(row) {
  const restored = structuredClone(row);
  delete restored.deletedAt;
  delete restored.deletedBatchId;
  delete restored.deletedOrder;
  delete restored.deletedGroupId;
  return restored;
}

function recentTrashBatch() {
  const first = state.trash[0];
  if (!first) return [];
  if (first.deletedBatchId) return state.trash.filter(row => row.deletedBatchId === first.deletedBatchId);
  if (first.deletedGroupId) return state.trash.filter(row => row.deletedGroupId === first.deletedGroupId && row.deletedAt === first.deletedAt);
  // Older versions stamped each row in a cleared ledger separately, sometimes
  // crossing a millisecond boundary. Those rows remain adjacent in the trash.
  const batch = [];
  for (const row of state.trash) {
    if (row.deletedBatchId || row.deletedGroupId || Math.abs((row.deletedAt ?? 0) - (first.deletedAt ?? 0)) > 1000) break;
    batch.push(row);
  }
  return batch;
}

function confirmClear() {
  if (!state.rows.length) { toast('当前没有记录'); return; }
  showSheet('清除历史记录？可在回收站恢复', [{ label: '清除历史记录', danger: true, run: () => { state.trash.unshift(...rowsForTrash(state.rows)); state.rows = []; entry = { left: '', op: '', right: '', completed: false }; samsungExpression = ''; samsungCompleted = false; samsungHistory = false; selectedId = null; persist(); render(); toast('已清空'); } }]);
}

function saveArchive() {
  if (!state.rows.length) { toast('先计算几笔再存档'); return; }
  showSheet('存档当前流水', [{ label: '保存', run: title => { state.archives.unshift({ id: freshId(), title: title || `流水 ${new Date().toLocaleString('zh-CN')}`, rows: structuredClone(state.rows), at: Date.now() }); persist(); toast('已存档'); } }], { placeholder: '存档名称（可留空）' });
}

function listArchives() {
  if (!state.archives.length) { toast('还没有存档'); return; }
  showSheet('存档', state.archives.map(archive => ({ label: `${archive.title} · ${archive.rows.length} 行`, run: () => showSheet(archive.title, [
    { label: '打开存档', run: () => {
      if (state.rows.length && JSON.stringify(state.rows) !== JSON.stringify(archive.rows)) {
        state.archives.unshift({ id: freshId(), title: `自动备份 ${new Date().toLocaleString('zh-CN')}`, rows: structuredClone(state.rows), at: Date.now() });
      }
      state.rows = structuredClone(archive.rows);
      selectedId = null; collapsed = false; samsungHistory = false; entry = { left: '', op: '', right: '', completed: false }; samsungExpression = '';
      $('settings').hidden = true; persist(); render();
    } },
    { label: '复制内容', run: () => copyText(rowsText(archive.rows)) },
    { label: '删除存档', danger: true, run: () => showSheet('确定删除这个存档？', [{ label: '删除存档', danger: true, run: () => { state.archives = state.archives.filter(item => item.id !== archive.id); persist(); toast('已删除存档'); } }]) }
  ]) })));
}

function listTrash() {
  if (!state.trash.length) { toast('回收站是空的'); return; }
  showSheet('回收站', [
    { label: '恢复最近删除的记录', run: () => {
      const batch = recentTrashBatch();
      const batchRows = new Set(batch);
      state.trash = state.trash.filter(row => !batchRows.has(row));
      state.rows.push(...batch.sort((a, b) => (a.deletedOrder ?? 0) - (b.deletedOrder ?? 0)).map(restoredTrashRow));
      persist(); render(); toast(`已恢复 ${batch.length} 条记录`);
    } },
    { label: `恢复全部 ${state.trash.length} 行`, run: () => {
      const restored = [...state.trash].sort((a, b) => (a.deletedAt ?? 0) - (b.deletedAt ?? 0) || (a.deletedOrder ?? 0) - (b.deletedOrder ?? 0));
      state.rows.push(...restored.map(restoredTrashRow));
      state.trash = [];
      persist(); render(); toast(`已恢复 ${restored.length} 条记录`);
    } },
    { label: '永久清空回收站', danger: true, run: () => confirmPurgeTrash(1) }
  ]);
}

function confirmPurgeTrash(step) {
  if (!state.trash.length) { toast('回收站是空的'); return; }
  showSheet(`永久清空回收站 · 第 ${step}/3 次确认`, [{
    label: step === 3 ? '确认永久删除' : '继续确认',
    danger: true,
    run: () => {
      if (step < 3) confirmPurgeTrash(step + 1);
      else { state.trash = []; persist(); toast('回收站已永久清空'); }
    }
  }], null, `${state.trash.length} 条记录及其备注、颜色和标记将无法恢复。`);
}

function settingOptions(kind) {
  const options = {
    theme: Object.entries(themePresets).map(([value, preset]) => [preset.name, value]),
    keyboard: [['经典键盘', 'classic'], ['紧凑键盘', 'compact']],
    fontSize: [['小', 'small'], ['标准', 'normal'], ['大', 'large']],
    precision: [['0 位', 0], ['2 位', 2], ['4 位', 4], ['6 位', 6], ['8 位', 8], ['10 位', 10], ['12 位', 12]]
  }[kind];
  if (!options) return;
  showSheet('选择' + ({ theme: '主题', keyboard: '键盘', fontSize: '字体大小', precision: '小数位数' }[kind]), options.map(([label, value]) => ({ label, run: () => { const name = kind === 'precision' && advancedTheme() ? 'samsungPrecision' : kind; state.settings[name] = value; if (kind === 'theme') { collapsed = false; samsungHistory = false; } persist(); render(); } })));
}

function toggleSpeaker() {
  if (state.settings.voice === 'none') state.settings.voice = previousVoice;
  else { previousVoice = state.settings.voice; state.settings.voice = 'none'; }
  if (state.settings.voice === 'none') {
    window.webkit?.messageHandlers?.stopSpeech?.postMessage('stop');
    window.speechSynthesis?.cancel();
  }
  persist(); render(); toast(state.settings.voice === 'none' ? '已静音' : '声音已开启');
}

function showEmberMore() {
  showSheet('更多', [
    { label: '清空历史', danger: true, run: confirmClear },
    { label: state.settings.voice === 'none' ? '开启声音' : '静音', run: toggleSpeaker },
    { label: '选择声音', run: () => { $('soundPage').hidden = false; } },
    { label: '选择主题', run: () => settingOptions('theme') }
  ]);
}

$('keyboard').addEventListener('click', event => { const key = event.target.closest('[data-key]')?.dataset.key; if (key) pressKey(key); });
let clearLongTimer;
let ignoreClearClickUntil = 0;
const samsungKeyboard = $('samsungKeyboard');
samsungKeyboard.addEventListener('pointerdown', event => {
  const button = event.target.closest('[data-samsung-key]');
  if (!button) return;
  button.classList.add('is-pressed');
  if (button.dataset.samsungKey === 'C') {
    clearTimeout(clearLongTimer);
    clearLongTimer = setTimeout(() => {
      ignoreClearClickUntil = Date.now() + 700;
      toggleSpeaker();
      button.classList.add('long-pressed');
    }, 520);
  }
});
for (const name of ['pointerup', 'pointercancel', 'pointerleave']) samsungKeyboard.addEventListener(name, event => {
  clearTimeout(clearLongTimer);
  const button = event.target.closest('[data-samsung-key]');
  if (button) setTimeout(() => button.classList.remove('is-pressed', 'long-pressed'), 45);
});
samsungKeyboard.addEventListener('click', event => {
  const key = event.target.closest('[data-samsung-key]')?.dataset.samsungKey;
  if (!key) return;
  if (key === 'C' && Date.now() < ignoreClearClickUntil) { ignoreClearClickUntil = 0; return; }
  pressSamsungKey(key);
});
for (const keyboard of [$('keyboard'), samsungKeyboard, $('samsungHistoryPanel'), $('emberKeyboard'), $('converterKeyboard')]) {
  keyboard.addEventListener('contextmenu', event => event.preventDefault());
  keyboard.addEventListener('selectstart', event => event.preventDefault());
}
$('samsungHistoryPanel').addEventListener('click', event => { const key = event.target.closest('[data-samsung-key]')?.dataset.samsungKey; if (key) pressSamsungKey(key); });
$('emberKeyboard').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.samsungKey) pressSamsungKey(button.dataset.samsungKey);
  else if (button.dataset.emberAction === 'speaker') toggleSpeaker();
  else if (button.dataset.emberAction === 'copy') copyText(samsungExpression || lastResult());
});
$('emberMenu').addEventListener('click', showEmberMore);
$('emberTabbar').addEventListener('click', event => {
  const tab = event.target.closest('[data-ember-tab]')?.dataset.emberTab;
  if (tab === 'settings') { $('settings').hidden = false; render(); }
  else if (tab === 'more') showEmberMore();
});
$('samsungHistoryToggle').addEventListener('click', () => { samsungHistory = !samsungHistory; render(); });
$('samsungClearHistory').addEventListener('click', confirmClear);
$('samsungRoot').addEventListener('click', pressSamsungRoot);
$('samsungConvert').addEventListener('click', convertSamsung);
$('converterBack').addEventListener('click', () => { $('converter').hidden = true; });
$('converterFrom').addEventListener('change', event => { converterState.from = event.target.value; renderConverter(); });
$('converterTo').addEventListener('change', event => { converterState.to = event.target.value; renderConverter(); });
$('converterSwap').addEventListener('click', () => { [converterState.from, converterState.to] = [converterState.to, converterState.from]; renderConverter(); });
$('converterOutput').addEventListener('click', () => { if (converterState.rawResult) copyText(converterState.rawResult); });
$('converterKeyboard').addEventListener('click', event => { const key = event.target.closest('[data-converter-key]')?.dataset.converterKey; if (key) pressConverterKey(key); });
$('samsungSettings').addEventListener('click', () => { $('settings').hidden = false; render(); });
$('collapseButton').addEventListener('click', () => { collapsed = !collapsed; render(); });
$('settingsButton').addEventListener('click', () => { $('settings').hidden = false; render(); });
$('settingsBack').addEventListener('click', () => { $('settings').hidden = true; });
$('soundBack').addEventListener('click', () => { $('soundPage').hidden = true; });
$('soundPage').addEventListener('click', event => {
  const button = event.target.closest('[data-voice]');
  if (!button) return;
  state.settings.voice = button.dataset.voice;
  if (!['none', 'click'].includes(state.settings.voice)) previousVoice = state.settings.voice;
  state.settings.sound = false;
  persist(); render();
  if (!['none', 'click'].includes(state.settings.voice)) speak('一二三等于六');
  else if (state.settings.voice === 'click') feedback();
});
$('overlay').addEventListener('click', closeSheet);
$('archiveButton').addEventListener('click', saveArchive);
$('clearButton').addEventListener('click', confirmClear);
for (const [id, name] of [['hapticSetting', 'haptic'], ['groupingSetting', 'grouping'], ['dateSetting', 'date'], ['unitSetting', 'unit']]) {
  $(id).addEventListener('change', event => { state.settings[name] = event.target.checked; persist(); render(); });
}
document.querySelectorAll('[data-setting]').forEach(button => button.addEventListener('click', () => {
  const kind = button.dataset.setting;
  if (kind === 'archive') listArchives();
  else if (kind === 'trash') listTrash();
  else if (kind === 'voice') $('soundPage').hidden = false;
  else settingOptions(kind);
}));
document.addEventListener('keydown', event => {
  if (!$('converter').hidden) {
    if (event.key === 'Escape') { $('converter').hidden = true; return; }
    const key = event.key === 'Backspace' ? 'back' : event.key;
    if (/^[0-9.]$/.test(key) || key === 'back') { event.preventDefault(); pressConverterKey(key); }
    return;
  }
  if (!$('settings').hidden || !$('sheet').hidden || !$('soundPage').hidden) { if (event.key === 'Escape') { closeSheet(); $('soundPage').hidden = true; $('settings').hidden = true; } return; }
  const key = event.key === '*' ? '×' : event.key === '/' ? '÷' : event.key === '-' ? '−' : event.key === 'Enter' ? '=' : event.key === 'Backspace' ? 'back' : event.key === 'Escape' ? 'C' : event.key;
  if (/^[0-9.]$/.test(key) || ['+', '−', '×', '÷', '=', 'back', 'C', '%', '(', ')'].includes(key)) {
    event.preventDefault();
    if (advancedTheme()) pressSamsungKey(isSamsungTheme() && (key === '(' || key === ')') ? '()' : key);
    else pressKey(key);
  }
});

appearance?.addEventListener?.('change', () => render());
document.addEventListener('visibilitychange', () => { if (document.hidden && persistTimer) persist(); });
render();
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
