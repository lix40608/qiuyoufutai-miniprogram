const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

function client(handler, token) {
  const store = new Map(token ? [['qiuyou-futai.session-token.v1', token]] : []);
  let logins = 0;
  const context = { module: { exports: {} }, require: createRequire(path.resolve('data/api.js')), console, wx: {
    getStorageSync: key => store.get(key),
    setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: key => store.delete(key),
    login: options => { logins++; setImmediate(() => options.success({ code: 'wx-code' })); },
    request: options => setImmediate(() => {
      const response = handler(options);
      options.success(response);
    })
  }};
  vm.runInNewContext(fs.readFileSync('data/api.js', 'utf8'), context);
  return { api: context.module.exports, logins: () => logins };
}
const ok = data => ({ statusCode: 200, data: { data } });
const profile = { userId: 1, nickname: '球友', gender: 'male', age: 28, avatarUrl: '', gameTypes: [] };

test('concurrent reads exchange one wx.login code for a shared session', async () => {
  const c = client(o => o.url.endsWith('/auth/login') ? ok({ token: 'new' }) : ok(profile));
  await Promise.all([c.api.getProfile(), c.api.getProfile(), c.api.getProfile()]);
  assert.equal(c.logins(), 1);
});

test('a rejected expired session is renewed once and the original read is retried', async () => {
  const c = client(o => {
    if (o.url.endsWith('/auth/login')) return ok({ token: 'renewed' });
    if (o.header.Authorization === 'Bearer expired') return { statusCode: 401, data: { error: { code: 'UNAUTHORIZED' } } };
    return ok(profile);
  }, 'expired');
  const result = await c.api.getProfile();
  assert.equal(result.userId, 1);
  assert.equal(c.logins(), 1);
});

test('profile labels are translated to API enums and returned as UI labels', async () => {
  let payload;
  const c = client(o => { payload = o.data; return ok(profile); }, 'session');
  const result = await c.api.saveProfile({ nickname: '球友', age: '28', gender: '男', avatarUrl: '' });
  assert.equal(payload.gender, 'male');
  assert.equal(payload.age, 28);
  assert.equal(result.gender, '男');
});

test('match normalization exposes host ID, parsed games and expiry without closing matched status', async () => {
  const c = client(() => ok({ id: 7, status: 'matched', startsAt: '2020-01-01T00:00:00Z', matchedAt: '2020-01-01T00:00:00Z', gameType: '中式八球', host: { id: 9, gender: 'female', gameTypes: '["中式八球"]' } }), 'session');
  const result = await c.api.getMatch(7);
  assert.equal(result.hostUserId, 9);
  assert.equal(result.hostGender, '女');
  assert.equal(result.hostGameTypes[0], '中式八球');
  assert.equal(result.status, 'matched');
  assert.equal(result.displayEnded, true);
});

test('chat endpoints send only an explicit confirmation request when called', async () => {
  const calls = [];
  const c = client(o => { calls.push(o); return ok({ id: 12 }); }, 'session');
  await c.api.openConversation(7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.endsWith('/v1/matches/7/conversations'), true);
  await c.api.confirmConversation(12);
  assert.equal(calls[1].url.endsWith('/v1/conversations/12/confirm'), true);
});

test('avatar upload renews an expired token and returns a server URL', async () => {
  // Upload is a separate WeChat transport and must recover the same way as JSON requests.
  let uploads = 0;
  const store = new Map([['qiuyou-futai.session-token.v1', 'old']]);
  const scope = { module: { exports: {} }, require, wx: {
    getStorageSync: key => store.get(key), setStorageSync: (key, value) => store.set(key, value), removeStorageSync: key => store.delete(key),
    login: options => options.success({ code: 'new-code' }),
    request: options => options.success(ok({ token: 'new' })),
    uploadFile: options => {
      uploads++;
      options.success(uploads === 1 ? { statusCode: 401, data: JSON.stringify({ error: { message: '过期' } }) }
        : { statusCode: 200, data: JSON.stringify({ data: { avatarUrl: '/avatars/one.jpg' } }) });
    }
  }};
  vm.runInNewContext(fs.readFileSync('data/api.js', 'utf8'), scope);
  const url = await scope.module.exports.uploadAvatar('/local/avatar.jpg');
  assert.equal(uploads, 2);
  assert.equal(url.endsWith('/avatars/one.jpg'), true);
});
