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

test('opening a chat can mark its pending confirmation invitation as read', async () => {
  const calls = [];
  const c = client(o => { calls.push(o); return ok({ id: 12 }); }, 'session');
  await c.api.getConversation(12, true);
  assert.match(calls[0].url, /\/v1\/conversations\/12\?markRead=true$/);
  await c.api.markConversationRead(12);
  assert.equal(calls[1].url.endsWith('/v1/conversations/12/read'), true);
  assert.equal(calls[1].method, 'POST');
});

test('message center reads peer avatar and notification endpoints with unread count', async () => {
  const calls = [];
  const c = client(o => {
    calls.push(o);
    if (o.url.endsWith('/v1/me/conversations')) return ok([{ id: 12, peerName: '小周', peerAvatar: '/avatars/peer.jpg', unreadCount: 2 }]);
    if (o.url.endsWith('/v1/me/notifications/unread-count')) return ok({ count: 3 });
    if (o.url.endsWith('/v1/me/notifications')) return ok([{ id: 8, matchId: 7, type: 'CANCELLED' }]);
    return ok({ read: true });
  }, 'session');
  const conversations = await c.api.getConversations();
  assert.equal(conversations[0].peerAvatar.endsWith('/avatars/peer.jpg'), true);
  assert.equal((await c.api.getNotifications())[0].matchId, 7);
  assert.equal(await c.api.getUnreadNotificationCount(), 3);
  await c.api.markNotificationRead(8);
  assert.equal(calls.some(call => call.url.endsWith('/v1/me/notifications/8/read') && call.method === 'POST'), true);
});

test('我聊过的包含发起方参与的会话，而不只包含主动加入方', async () => {
  const calls = [];
  const c = client(o => {
    calls.push(o);
    if (o.url.endsWith('/v1/me/profile')) return ok({ ...profile, userId: 1 });
    if (o.url.includes('/v1/me/conversations')) return ok([
      { id: 10, matchId: 70, hostUserId: 1, guestUserId: 2 },
      { id: 11, matchId: 71, hostUserId: 3, guestUserId: 1 }
    ]);
    if (o.url.endsWith('/v1/matches/70') || o.url.endsWith('/v1/matches/71')) return ok({ id: Number(o.url.slice(-2)), status: 'matched', host: { id: 1 } });
    return ok([]);
  }, 'session');

  const rows = await c.api.getChattedMatches(1, 10);

  assert.equal(rows.length, 2);
  assert.equal(rows.map(row => row.conversationId).join(','), '10,11');
  assert.equal(calls.some(call => call.url.includes('guestOnly=true')), false);
});

test('发起方打开球局卡片时读取胜出或最近活跃的聊天', async () => {
  let request;
  const c = client(o => { request = o; return ok({ id: 19, peerName: '小周' }); }, 'session');
  const row = await c.api.getLatestMatchConversation(70);
  assert.match(request.url, /\/v1\/matches\/70\/conversations\/latest$/);
  assert.equal(row.peerName, '小周');
});

test('发起方按球局读取分页的多球友聊天列表', async () => {
  let request;
  const c = client(o => { request = o; return ok([{ id: 19, matchId: 70, peerName: '小周' }]); }, 'session');
  const rows = await c.api.getMatchConversations(70, 2, 10);
  assert.match(request.url, /\/v1\/matches\/70\/conversations\?page=2&pageSize=10$/);
  assert.equal(rows[0].peerName, '小周');
});

test('对返回的全部约局按距离排序，后返回的近处约局不会被截掉', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1, startsAt: '2030-01-01T10:00:00Z', gameType: '中式八球',
    venueLatitude: index === 100 ? 30 : 31, venueLongitude: 120
  }));
  const c = client(() => ok(rows), 'session');
  const matches = await c.api.searchMatches({ userLocation: { latitude: 30, longitude: 120 } });
  assert.equal(matches.length, 101);
  assert.equal(matches[0].id, 101);
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
