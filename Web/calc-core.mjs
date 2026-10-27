// Decimal arithmetic uses integers so common amounts such as 0.1 + 0.2 stay exact.
const TEN = 10n;

export function decimal(value) {
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

export function decimalString(value) {
  const { n, scale } = normalize(value);
  if (scale === 0) return n.toString();
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString().padStart(scale + 1, '0');
  const result = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${result}` : result;
}

export function calculate(left, operator, right, divisionDigits = 4) {
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

export function sumValues(values) {
  let sum = { n: 0n, scale: 0 };
  for (const value of values) {
    const [a, b, scale] = align(sum, decimal(value));
    sum = normalize({ n: a + b, scale });
  }
  return decimalString(sum);
}

export function formatNumber(value, grouping = false) {
  const [whole, fractional] = String(value).split('.');
  const formatted = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  return fractional === undefined ? formatted : `${formatted}.${fractional}`;
}

export function appendExpressionOperator(expression, operator) {
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
export function numberToChinese(value) {
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

export function evaluateExpression(expression, divisionDigits = 4) {
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

export function squareRoot(value, digits = 4) {
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
