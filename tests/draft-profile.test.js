const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function pageFrom(path, api, wx, DateClass = Date) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), {
    Page: (page) => { definition = page; },
    require: (name) => name.endsWith('/api') ? api : {},
    wx, getApp: () => ({ globalData: {} }), Date: DateClass, Math, Number, Object, JSON
  });
  definition.data = JSON.parse(JSON.stringify(definition.data));
  definition.setData = function (updates, callback) {
    Object.entries(updates).forEach(([key, value]) => {
      const parts = key.split('.');
      let target = this.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    });
    if (callback) callback();
  };
  return definition;
}

function frozenDate(year, month, day, hour, minute) {
  const now = new Date(year, month - 1, day, hour, minute);
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  };
}

test('发布默认选择当天当前时间之后的下一个半小时', () => {
  const page = pageFrom('pages/publish/index.js', {}, {}, frozenDate(2026, 10, 29, 19, 38));
  assert.equal(page.data.form.date, '2026-10-29');
  assert.equal(page.data.form.time, '20:00');
  assert.equal(page.data.minDate, '2026-10-29');
});

test('临近午夜时默认开球时间进入次日', () => {
  const page = pageFrom('pages/publish/index.js', {}, {}, frozenDate(2026, 10, 29, 23, 55));
  assert.equal(page.data.form.date, '2026-10-30');
  assert.equal(page.data.form.time, '00:00');
  assert.equal(page.data.minDate, '2026-10-29');
});

test('草稿保存成功后进入我的约局的编辑中列表', async () => {
  let destination;
  const wx = {
    navigateTo(options) { destination = options.url; options.success(); },
    showToast() {}, showModal() {}
  };
  const api = { saveDraft: () => Promise.resolve({ id: 12, startAt: new Date('2030-01-01T10:00:00Z') }) };
  const page = pageFrom('pages/publish/index.js', api, wx);
  page.data.form.note = '待保存内容';
  page.saveDraft();
  await new Promise(setImmediate);
  assert.equal(destination, '/pages/my-matches/index?filter=draft');
  assert.equal(page.data.form.id, '');
  assert.equal(page.data.savingDraft, false);
});

test('发布成功后进入我的约局的组局中列表', async () => {
  let destination;
  const wx = { navigateTo(options) { destination = options.url; options.success(); }, showToast() {}, showModal() {} };
  const api = {
    getProfile: () => Promise.resolve({ nickname: '球友', age: 28, gender: '男' }),
    publishMatch: () => Promise.resolve({ id: 20 })
  };
  const page = pageFrom('pages/publish/index.js', api, wx);
  page.data.form.venueName = '球房';
  page.data.form.date = '2030-01-01';
  page.publishMatch();
  await new Promise(setImmediate);
  assert.equal(destination, '/pages/my-matches/index?filter=active');
  assert.equal(page.data.submitting, false);
});

test('保存草稿期间的新编辑不会被清除', async () => {
  let resolveSave;
  let navigated = false;
  const wx = { navigateTo() { navigated = true; }, showToast() {}, showModal() {} };
  const api = { saveDraft: () => new Promise((resolve) => { resolveSave = resolve; }) };
  const page = pageFrom('pages/publish/index.js', api, wx);
  page.saveDraft();
  page.data.form.note = '保存期间补充的内容';
  resolveSave({ id: 12, startAt: new Date('2030-01-01T10:00:00Z') });
  await new Promise(setImmediate);
  assert.equal(navigated, false);
  assert.equal(page.data.form.id, 12);
  assert.equal(page.data.form.note, '保存期间补充的内容');
});

test('个人资料缺失时显示每个必填字段的提示', () => {
  const page = pageFrom('pages/personal-profile/index.js', {}, { showToast() {} });
  page.saveProfile();
  assert.equal(page.data.errors.nickname, '请填写昵称');
  assert.equal(page.data.errors.age, '请填写 1 至 120 岁的年龄');
  assert.equal(page.data.errors.gender, '请选择性别');
  page.onPersonalInput({ currentTarget: { dataset: { field: 'nickname' } }, detail: { value: '球友' } });
  assert.equal(page.data.errors.nickname, '');
});

test('头像入口传递当前预览并接收已确认的选择', () => {
  let navigation;
  let initial;
  const page = pageFrom('pages/personal-profile/index.js', {}, {
    navigateTo(options) {
      navigation = options;
      options.success({ eventChannel: { emit: (name, value) => { initial = { name, value }; } } });
    }
  });
  page.data.personal.avatarPath = 'https://example.test/avatar.jpg';
  page.openAvatarEditor();
  assert.equal(navigation.url, '/pages/avatar-editor/index');
  assert.equal(initial.name, 'avatarInitial');
  assert.equal(initial.value.avatarPath, 'https://example.test/avatar.jpg');
  navigation.events.avatarSelected({ path: '/tmp/avatar.jpg' });
  assert.equal(page.data.pendingAvatarPath, '/tmp/avatar.jpg');
});

test('未选球房时发布显示字段错误并定位到球房', () => {
  let selector;
  const page = pageFrom('pages/publish/index.js', {}, { pageScrollTo: (options) => { selector = options.selector; } });
  page.publishMatch();
  assert.equal(page.data.formErrors.venue, '请选择球房后再发布');
  assert.equal(selector, '#venue-field');
  assert.equal(page.data.submitting, false);
});

test('开球时间无效时显示错误，修改时间后清除', () => {
  let selector;
  const page = pageFrom('pages/publish/index.js', {}, { pageScrollTo: (options) => { selector = options.selector; } });
  page.data.form.venueName = '球房';
  page.data.form.date = 'invalid';
  page.publishMatch();
  assert.equal(page.data.formErrors.time, '请选择晚于当前时间的开球时间');
  assert.equal(selector, '#time-field');
  page.selectDate({ detail: { value: '2030-01-01' } });
  assert.equal(page.data.formErrors.time, '');
});
