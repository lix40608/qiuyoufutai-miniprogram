const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadGroup(api, wx) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/group/index.js', 'utf8'), {
    Page: value => { definition = value; },
    require: name => name.endsWith('/api') ? api : { getUserLocation: () => null },
    wx, getApp: () => ({ globalData: {} }), setTimeout, clearTimeout, console
  });
  return definition;
}

function loadAllMatches(api, wx) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/my-matches/index.js', 'utf8'), {
    Page: value => { definition = value; }, require: () => api, wx, setTimeout, clearTimeout, console
  });
  return definition;
}

test('发起的约局卡片优先进入最近聊天，没有聊天时才回到详情', async () => {
  const destinations = [];
  const page = loadGroup({ getLatestMatchConversation: async () => ({ id: 55 }) }, {
    navigateTo: options => destinations.push(options.url)
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'matched', chatFirst: true } } });
  await new Promise(setImmediate);
  assert.equal(destinations[0], '/pages/chat/index?id=55');

  const noChatPage = loadGroup({ getLatestMatchConversation: async () => null }, {
    navigateTo: options => destinations.push(options.url)
  });
  noChatPage.openRecord({ currentTarget: { dataset: { id: 8, status: 'recruiting', chatFirst: true } } });
  await new Promise(setImmediate);
  assert.equal(destinations[1], '/pages/detail/index?id=8');
});

test('发起的球局卡片不再显示查看详情按钮，我聊过的卡片标明聊天对象', () => {
  const group = fs.readFileSync('pages/group/index.wxml', 'utf8');
  const allMatches = fs.readFileSync('pages/my-matches/index.wxml', 'utf8');
  assert.match(group, /data-chat-first="true"/);
  assert.doesNotMatch(group, />查看详情</);
  assert.match(group, /与 \{\{item\.peerName \|\| '球友'\}\} 聊天/);
  assert.match(allMatches, /data-chat-first="\{\{activeView === 'created' && item\.status !== 'draft'\}\}"/);
  assert.doesNotMatch(allMatches, />查看详情</);
  assert.match(allMatches, /wx:key="rowKey"/);
});

test('首页默认选中全部玩法，通知入口用图标并在有未读时显示红点', () => {
  const home = fs.readFileSync('pages/home/index.js', 'utf8');
  const homeWxml = fs.readFileSync('pages/home/index.wxml', 'utf8');
  const findWxml = fs.readFileSync('pages/find/index.wxml', 'utf8');
  const meWxml = fs.readFileSync('pages/me/index.wxml', 'utf8');
  assert.match(home, /selectedGameType: '全部'/);
  assert.match(home, /selectedGameType === '全部' \? '' : this\.data\.selectedGameType/);
  assert.match(homeWxml, /data-type="全部"[^>]*>全部</);
  assert.match(homeWxml, /bell-icon/);
  assert.match(findWxml, /bell-icon/);
  assert.match(homeWxml, /wx:if="\{\{unreadCount\}\}" class="message-unread"/);
  assert.match(meWxml, /wx:if="\{\{unreadCount\}\}" class="message-unread"/);
  assert.match(homeWxml, /item\.chatUnreadCount/);
  assert.match(findWxml, /item\.chatUnreadCount/);
  assert.match(fs.readFileSync('pages/group/index.wxml', 'utf8'), /item\.unreadCount.*action-unread-dot/);
});

test('全部约球中的发起记录卡片也直接打开最近聊天', async () => {
  let destination;
  const page = loadAllMatches({ getLatestMatchConversation: async () => ({ id: 91 }) }, {
    navigateTo: options => { destination = options.url; }
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'recruiting', chatFirst: true } } });
  await new Promise(setImmediate);
  assert.equal(destination, '/pages/chat/index?id=91');
});
