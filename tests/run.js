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
    console.log('FAIL ' + name + ': ' + e.message.split('\n').slice(0, 8).join(' | '));
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
  for (const id of ['tool', 'problem', 'rules', 'bug', 'footer']) {
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

// --- Задача 4: свои правила, «скоро», подвал ---
check('parseRuleInput: ключи, проверки, группа', () => {
  const r = loadApp().parseRuleInput('Пароль, password', 'a\n\nb');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { keys: ['пароль', 'password'], group: 'пароль', checks: ['a', 'b'] });
});

check('parseRuleInput: без ключей или без проверок даёт null', () => {
  const app = loadApp();
  assert.strictEqual(app.parseRuleInput('', 'a'), null);
  assert.strictEqual(app.parseRuleInput('x', '  \n '), null);
});

check('loadCustomRules: повреждённые данные и исключения дают []', () => {
  const app = loadApp();
  assert.deepStrictEqual(Array.from(app.loadCustomRules({ getItem: () => '{не json' })), []);
  assert.deepStrictEqual(Array.from(app.loadCustomRules({ getItem() { throw new Error('x'); } })), []);
  assert.deepStrictEqual(Array.from(app.loadCustomRules({ getItem: () => null })), []);
  assert.deepStrictEqual(Array.from(app.loadCustomRules({ getItem: () => '{"a":1}' })), []);
});

check('save/load правил: круг и сбой записи', () => {
  const app = loadApp();
  const store = {};
  const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  const rule = app.parseRuleInput('склад', 'Проверить остаток');
  assert.strictEqual(app.saveCustomRules([rule], storage), true);
  assert.strictEqual(app.loadCustomRules(storage)[0].group, 'склад');
  assert.strictEqual(app.saveCustomRules([], { setItem() { throw new Error('x'); } }), false);
});

check('своё правило срабатывает в buildChecklist', () => {
  const app = loadApp();
  const r = app.buildChecklist('Склад: приёмка', [app.parseRuleInput('склад', 'Проверить остаток')]);
  assert.ok(r.items.some((i) => i.group === 'склад' && i.text === 'Проверить остаток'));
  assert.strictEqual(r.usedDefault, false);
});

check('секция правил и подвал заполнены, без заглушек', () => {
  assert.ok(!sectionText('rules').includes('Заглушка'));
  assert.ok(readHtml().includes('только в этом браузере'));
  assert.ok(/<footer id="footer">[\s\S]*?\S[\s\S]*?<\/footer>/.test(readHtml()));
});

// --- Итоговое ревью: исправления ---
check('нет ложных срабатываний на обычных описаниях', () => {
  const app = loadApp();
  const cases = [
    'Пользователь может удалить комментарий',
    'Политика конфиденциальности',
    'Экспорт отчёта в формате PDF',
    'Button for sharing a post',
    'Карточка товара с картинкой',
    'Логирование ошибок на сервере',
    'Входящие сообщения в чате',
    'Поиск без учёта регистра'
  ];
  const unwanted = { 'Пользователь может удалить комментарий': 'Поля ввода', 'Политика конфиденциальности': 'Поля ввода', 'Экспорт отчёта в формате PDF': 'Форма', 'Button for sharing a post': 'Форма', 'Карточка товара с картинкой': 'Оплата', 'Логирование ошибок на сервере': 'Авторизация', 'Входящие сообщения в чате': 'Авторизация', 'Поиск без учёта регистра': 'Регистрация' };
  for (const d of cases) {
    const groups = app.buildChecklist(d, []).items.map((i) => i.group);
    assert.ok(!groups.includes(unwanted[d]), d + ' -> ' + unwanted[d]);
  }
});

check('настоящие формы слов по-прежнему находятся', () => {
  const app = loadApp();
  const has = (d, g) => app.buildChecklist(d, []).items.some((i) => i.group === g);
  assert.ok(has('Поле для ввода даты', 'Поля ввода'));
  assert.ok(has('Заполнить поля формы', 'Форма'));
  assert.ok(has('Оплата картой', 'Оплата'));
  assert.ok(has('Вход в личный кабинет', 'Авторизация'));
  assert.ok(has('Регистрация нового аккаунта', 'Регистрация'));
  assert.ok(has('Поиск по каталогу', 'Поиск и фильтры'));
});

check('ключ из нескольких слов и с дефисом срабатывает', () => {
  const app = loadApp();
  const hit = (key, d) => app.buildChecklist(d, [app.parseRuleInput(key, 'X')]).items.some((i) => i.text === 'X');
  assert.ok(hit('личный кабинет', 'Тест: личный кабинет клиента'));
  assert.ok(hit('двойной клик', 'двойной клик по кнопке'));
  assert.ok(hit('e-mail', 'Письмо на E-Mail'));
  assert.ok(!hit('личный кабинет', 'личный счёт и кабинет врача'));
});

check('звёздочка в конце ключа: любое окончание', () => {
  const app = loadApp();
  const hit = (key, d) => app.buildChecklist(d, [app.parseRuleInput(key, 'X')]).items.some((i) => i.text === 'X');
  assert.ok(hit('склад*', 'Проверка склада'));
  assert.ok(!hit('склад', 'Проверка склада'));
  assert.ok(hit('склад', 'Проверка склад'));
});

check('ключ constructor не роняет отрисовку', () => {
  const app = loadApp();
  const fake = () => ({ children: [], textContent: '', appendChild(c) { this.children.push(c); } });
  app.document = { createElement: fake };
  const container = fake();
  const items = app.buildChecklist('constructor page', [app.parseRuleInput('constructor', 'Проверка')]).items;
  assert.ok(items.some((i) => i.group === 'constructor'));
  vm.runInContext('renderResult', app); // функция доступна
  app.renderResult(container, items);
  assert.ok(container.children.length >= 2);
});

// --- Блок «свои проверки»: понятность ---
check('блок правил объясняет, что вводить, и даёт пример', () => {
  const html = readHtml();
  const sec = html.match(/<section[^>]*id="rules"[\s\S]*?<\/section>/)[0];
  const text = sectionText('rules');
  assert.ok(text.includes('Свои проверки для вашей темы'), 'заголовок');
  assert.ok(!text.includes('Настройте под свой проект'), 'старый заголовок');
  assert.ok(text.includes('Сработает, когда это слово встретится в описании фичи'), 'подпись');
  assert.ok(/placeholder="склад, остаток"/.test(sec), 'пример ключевых слов');
  assert.ok(/placeholder="Остаток не уходит в минус&#10;Приёмка обновляет остаток"/.test(sec), 'пример проверок');
  assert.ok(text.includes('склад*') && text.includes('любые окончания'), 'подсказка про звёздочку');
  assert.ok(/<label[^>]*for="rule-keys"/.test(sec) && /<label[^>]*for="rule-checks"/.test(sec), 'подписи полей');
});

// --- Баг-репорт: функции ---
check('bugSteps: без пустых, обрезанные', () => {
  const app = loadApp();
  assert.deepStrictEqual(Array.from(app.bugSteps('a\r\n\r\n  b  \n')), ['a', 'b']);
});

check('isBugReportComplete: нужны заголовок, actual и шаг', () => {
  const app = loadApp();
  const ok = { title: 'T', steps: 'a', actual: 'X' };
  assert.strictEqual(app.isBugReportComplete(ok), true);
  assert.strictEqual(app.isBugReportComplete({ title: ' ', steps: 'a', actual: 'X' }), false);
  assert.strictEqual(app.isBugReportComplete({ title: 'T', steps: 'a', actual: '' }), false);
  assert.strictEqual(app.isBugReportComplete({ title: 'T', steps: '   ', actual: 'X' }), false);
  assert.strictEqual(app.isBugReportComplete({ title: 'T', steps: '\n \n', actual: 'X' }), false);
});

check('buildBugReportText: пустые env и expected пропускаются', () => {
  const app = loadApp();
  assert.strictEqual(
    app.buildBugReportText({ title: 'T', severity: 'Значимая', env: '', steps: 'a\nb', expected: '', actual: 'X' }),
    'Заголовок: T\nСерьёзность: Значимая\n\nШаги:\n1. a\n2. b\n\nФактический результат: X'
  );
  assert.strictEqual(
    app.buildBugReportText({ title: 'T', severity: 'Значимая', env: 'Chrome', steps: 'a\nb', expected: 'Y', actual: 'X' }),
    'Заголовок: T\nСерьёзность: Значимая\nОкружение: Chrome\n\nШаги:\n1. a\n2. b\n\nОжидаемый результат: Y\nФактический результат: X'
  );
});

check('bugReportToCsv: BOM, заголовок, шаги, защита ячеек', () => {
  const app = loadApp();
  const csv = app.bugReportToCsv({ title: '=1+1', severity: 'Значимая', env: '', steps: 'a\nb', expected: '', actual: 'a;b "q"' });
  assert.ok(csv.indexOf('﻿Заголовок;Серьёзность;Окружение;Шаги;Ожидаемый результат;Фактический результат\r\n') === 0);
  const row = csv.split('\r\n')[1];
  assert.ok(row.indexOf("'=1+1;") === 0, 'формула');
  assert.ok(csv.indexOf('"1. a\n2. b"') !== -1, 'шаги');
  assert.ok(csv.indexOf('"a;b ""q"""') !== -1, 'экранирование');
});

check('секция баг-репорта', () => {
  const html = readHtml();
  const pos = (id) => html.indexOf('id="' + id + '"');
  assert.ok(pos('tool') < pos('bug') && pos('bug') < pos('problem'), 'порядок секций');
  const sec = html.match(/<section[^>]*id="bug"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(sec, 'нет секции #bug');
  for (const id of ['bug-title', 'bug-env', 'bug-steps', 'bug-expected', 'bug-actual', 'bug-severity']) {
    assert.ok(sec[1].includes('id="' + id + '"'), 'нет поля ' + id);
    assert.ok(sec[1].includes('<label class="field" for="' + id + '"'), 'нет label для ' + id);
  }
  assert.ok(sec[1].includes('id="bug-build"') && sec[1].includes('id="bug-copy"') && sec[1].includes('id="bug-csv"'), 'кнопки');
  const sel = sec[1].match(/<select[^>]*id="bug-severity"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(sel, 'нет select');
  const opts = sel[1].match(/<option[^>]*>[^<]*<\/option>/g) || [];
  assert.deepStrictEqual(opts.map((o) => o.replace(/<[^>]+>/g, '')), ['Блокирующая', 'Критичная', 'Значимая', 'Незначительная', 'Тривиальная']);
  const selected = opts.filter((o) => /\bselected\b/.test(o));
  assert.strictEqual(selected.length, 1);
  assert.ok(selected[0].includes('Значимая'), 'по умолчанию Значимая');
});

check('нет блока «Скоро»', () => {
  const html = readHtml();
  assert.ok(!html.includes('id="soon"'));
  assert.ok(!html.includes('Калькулятор покрытия'));
  assert.ok(!html.includes('Шаблон баг-репорта'));
  assert.ok(!html.includes('class="card"'));
});

check('глобальное правило [hidden] скрывает элементы', () => {
  assert.ok(/(^|\n)\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(readHtml()));
});

check('изменение любого поля баг-репорта сбрасывает результат', () => {
  const html = readHtml();
  assert.ok(html.includes('function resetBugResult'), 'нет resetBugResult');
  for (const id of ['bug-title', 'bug-env', 'bug-steps', 'bug-expected', 'bug-actual', 'bug-severity']) {
    assert.ok(html.includes("'" + id + "'"), 'нет ' + id + ' в скрипте');
  }
  assert.ok(/addEventListener\('input', resetBugResult\)/.test(html), 'нет input-обработчика');
  assert.ok(/addEventListener\('change', resetBugResult\)/.test(html), 'нет change-обработчика');
});

check('баг-репорт не использует innerHTML', () => {
  assert.ok(!readHtml().includes('innerHTML'));
});

check('под заголовком #tool есть строка-пояснение без упоминания ИИ', () => {
  const text = 'Чек-листы и баг-репорты из описания фичи. Всё в браузере, данные никуда не уходят.';
  const html = readHtml();
  const m = html.match(/<section[^>]*id="tool"[^>]*>[\s\S]*?<\/h1>\s*<p class="lead">([^<]*)<\/p>/);
  assert.ok(m, 'нет <p class="lead"> сразу под h1');
  assert.strictEqual(m[1], text);
  assert.ok(!/ИИ|нейросет/i.test(m[1]));
});

// --- проверки следующих задач добавляются выше этой строки ---

if (failed) {
  console.log('\nПровалено: ' + failed);
  process.exit(1);
}
console.log('\nВсе проверки пройдены');
