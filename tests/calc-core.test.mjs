import test from 'node:test';
import assert from 'node:assert/strict';
import { appendExpressionOperator, calculate, decimal, decimalString, evaluateExpression, formatNumber, numberToChinese, squareRoot, sumValues } from '../Web/calc-core.mjs';

test('ordinary operations stay exact', () => {
  assert.equal(calculate('6689', '-', '998'), '5691');
  assert.equal(calculate('99', '×', '89'), '8811');
  assert.equal(calculate('0.1', '+', '0.2'), '0.3');
  assert.equal(calculate('100', '÷', '4'), '25');
  assert.equal(calculate('-1.5', '×', '2'), '-3');
});

test('division rounds to selected decimal places', () => {
  assert.equal(calculate('1', '÷', '3', 4), '0.3333');
  assert.equal(calculate('2', '÷', '3', 2), '0.67');
  assert.equal(calculate('-2', '÷', '3', 2), '-0.67');
  assert.equal(calculate('1', '÷', '8', 2), '0.13');
  assert.throws(() => calculate('1', '÷', '0'), /不能除以 0/);
});

test('line totals and display grouping', () => {
  assert.equal(sumValues(['5691', '8811', '0.3']), '14502.3');
  assert.equal(formatNumber('14502.3', true), '14,502.3');
  assert.equal(decimalString(decimal('0002.500')), '2.5');
});

test('Samsung theme supports parentheses, percent and square root', () => {
  assert.equal(evaluateExpression('(2+3)×4'), '20');
  assert.equal(evaluateExpression('1000+5%'), '1050');
  assert.equal(evaluateExpression('2+3×4'), '14');
  assert.equal(evaluateExpression('99÷9999', 10), '0.0099009901');
  assert.equal(squareRoot('9'), '3');
  assert.equal(squareRoot('2', 4), '1.4142');
  assert.throws(() => evaluateExpression('(2+3'), /括号/);
});

test('operators do not pull an old answer into a cleared expression', () => {
  for (const operator of ['+', '×', '÷']) assert.equal(appendExpressionOperator('', operator), '');
  assert.equal(appendExpressionOperator('', '−'), '−');
  assert.equal(appendExpressionOperator('−8÷', '−'), '−8÷−');
  assert.equal(appendExpressionOperator('8−', '−'), '8−−');
  assert.equal(appendExpressionOperator('8÷−', '÷'), '8÷');
  assert.equal(evaluateExpression('−8÷−2'), '4');
  assert.equal(evaluateExpression('8−−2'), '10');
  assert.equal(evaluateExpression('−8÷−0.5'), '16');
});

test('addition and subtraction percentages use the preceding amount', () => {
  assert.equal(evaluateExpression('200+10%'), '220');
  assert.equal(evaluateExpression('200−15%'), '170');
  assert.equal(evaluateExpression('100+15%+5%'), '120.75');
  assert.equal(evaluateExpression('500×7%'), '35');
  assert.equal(evaluateExpression('50÷25%'), '200');
  assert.equal(evaluateExpression('5+2'), '7');
});

test('spoken results use natural Mandarin place values', () => {
  assert.equal(numberToChinese('105621'), '十万五千六百二十一');
  assert.equal(numberToChinese('10010'), '一万零一十');
  assert.equal(numberToChinese('100000001'), '一亿零一');
  assert.equal(numberToChinese('-1020.06'), '负一千零二十点零六');
});
