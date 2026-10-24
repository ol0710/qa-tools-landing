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

// --- проверки следующих задач добавляются выше этой строки ---

if (failed) {
  console.log('\nПровалено: ' + failed);
  process.exit(1);
}
console.log('\nВсе проверки пройдены');
