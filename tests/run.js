'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const readHtml = () => fs.readFileSync(HTML_PATH, 'utf8');

// Достаёт содержимое <script id="app"> и выполняет его без document.
function loadApp() {
  const m = readHtml().match(/<script id="app">([\s\S]*?)<\/script>/);
  assert.ok(m, 'нет <script id="app">');
  const ctx = vm.createContext({});
  vm.runInContext(m[1], ctx);
  return ctx;
}

// Текст секции по id (без тегов), для проверок содержимого.
function sectionText(id) {
  const m = readHtml().match(new RegExp('<section[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</section>'));
  assert.ok(m, 'нет секции #' + id);
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('OK   ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]);
  }
}

check('нет внешних ссылок', () => {
  const html = readHtml();
  assert.ok(!/(src|href)\s*=\s*["']https?:\/\//i.test(html), 'внешний src/href');
  assert.ok(!/url\(\s*["']?https?:\/\//i.test(html), 'внешний url()');
});

check('есть viewport', () => {
  assert.ok(readHtml().includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
});

check('есть секции', () => {
  const html = readHtml();
  for (const id of ['tool', 'problem', 'rules', 'soon', 'footer']) {
    assert.ok(new RegExp('id="' + id + '"').test(html), 'нет #' + id);
  }
});

check('скрипт выполняется без document', () => {
  loadApp();
});

// --- Задача 2: генератор и CSV ---
const groupNames = (r) => r.items.map((i) => i.group.toLowerCase());

check('форма с паролем даёт группу про пароль', () => {
  const r = loadApp().buildChecklist('Форма входа с паролем', []);
  assert.ok(groupNames(r).some((g) => g.includes('парол')), 'нет группы про пароль');
  assert.strictEqual(r.usedDefault, false);
});

check('поиск по началу слова, регистр и ё/е не важны', () => {
  const app = loadApp();
  const hasGroup = (d, part) => groupNames(app.buildChecklist(d, [])).some((g) => g.includes(part));
  assert.ok(hasGroup('PASSWORDS reset', 'password') || hasGroup('PASSWORDS reset', 'парол'), 'PASSWORDS');
  assert.ok(hasGroup('Пароля нет', 'парол'), 'Пароля');
  assert.ok(hasGroup('Паролем', 'парол'), 'Паролем');
  assert.strictEqual(app.normalize('  ЁлкА '), 'елка');
});

check('нестандартное описание даёт общий набор', () => {
  const r = loadApp().buildChecklist('что-то странное', []);
  assert.strictEqual(r.usedDefault, true);
  assert.ok(r.items.length >= 5 && r.items.length <= 8, 'пунктов: ' + r.items.length);
  assert.ok(r.items.every((i) => i.group === 'Общие проверки'));
});

check('пустое описание ничего не выводит', () => {
  const app = loadApp();
  for (const d of ['', '   ']) {
    const r = app.buildChecklist(d, []);
    assert.strictEqual(r.items.length, 0);
    assert.strictEqual(r.usedDefault, false);
  }
});

check('длинное описание обрабатывается быстро', () => {
  const app = loadApp();
  const t = Date.now();
  app.buildChecklist('x'.repeat(10000), []);
  assert.ok(Date.now() - t < 200, 'медленно: ' + (Date.now() - t) + ' мс');
});

check('встроенных правил 8-12, по 4-8 проверок', () => {
  const rules = loadApp().getRules();
  assert.ok(rules.length >= 8 && rules.length <= 12, 'тем: ' + rules.length);
  assert.ok(rules.every((r) => r.checks.length >= 4 && r.checks.length <= 8));
});

check('CSV: BOM, заголовок, экранирование, статус', () => {
  const csv = loadApp().toCsv([{ group: 'А', text: 'a;b "c"' }]);
  assert.ok(csv.startsWith('﻿№;Группа;Проверка;Статус\r\n'));
  assert.ok(csv.includes('"a;b ""c"""'));
  assert.ok(csv.includes('не проверено'));
});

check('CSV: опасное начало ячейки получает апостроф', () => {
  const app = loadApp();
  for (const s of ['=1+1', '+1', '-1', '@x']) {
    assert.ok(app.toCsv([{ group: 'А', text: s }]).includes("'" + s), s);
  }
});

// --- Задача 3: боль и решение ---
check('блок про боль: есть текст, нет обещаний про ИИ', () => {
  const t = sectionText('problem');
  assert.ok(t.length > 0, 'пусто');
  assert.ok(!t.includes('Заглушка'), 'осталась заглушка');
  assert.ok((readHtml().match(/<section[^>]*id="problem"[\s\S]*?<\/section>/)[0].match(/<p>/g) || []).length >= 2, 'меньше двух абзацев');
  assert.ok(!/(^|[^А-Яа-яЁё])ИИ([^А-Яа-яЁё]|$)/.test(t), 'слово ИИ');
  assert.ok(!/нейросет|искусственн/i.test(t), 'нейросеть/искусственный');
});

// --- проверки следующих задач добавляются выше этой строки ---

if (failed) {
  console.log('\nПровалено: ' + failed);
  process.exit(1);
}
console.log('\nВсе проверки пройдены');
