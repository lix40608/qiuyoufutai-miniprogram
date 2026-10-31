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

test('发起的约局卡片点击进入详情，进入聊天按钮打开按对局筛选的列表', async () => {
  const destinations = [];
  const page = loadGroup({}, {
    navigateTo: options => destinations.push(options.url)
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'matched' } } });
  page.openMatchChats({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(destinations[0], '/pages/detail/index?id=7');
  assert.equal(destinations[1], '/pages/match-chats/index?matchId=7');
});

test('发起的球局卡片不再显示查看详情按钮，我聊过的卡片标明聊天对象', () => {
  const group = fs.readFileSync('pages/group/index.wxml', 'utf8');
  const allMatches = fs.readFileSync('pages/my-matches/index.wxml', 'utf8');
  assert.doesNotMatch(group, /data-chat-first=/);
  assert.match(group, /wx:if="\{\{latestActive\.chatUnreadCount\}\}" class="match-action-unread"/);
  assert.match(group, /class="primary-button match-action-button match-action-chat" catchtap="openMatchChats"/);
  assert.doesNotMatch(group, />查看详情</);
  assert.match(group, /与 \{\{item\.peerName \|\| '球友'\}\} 聊天/);
  assert.doesNotMatch(allMatches, /data-chat-first=/);
  assert.match(allMatches, /class="primary-button match-action-button match-action-chat" catchtap="openMatchChats"/);
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
  assert.match(homeWxml, /wx:if="\{\{(?:loggedIn && )?unreadCount\}\}" class="message-unread"/);
  assert.match(meWxml, /wx:if="\{\{(?:loggedIn && )?unreadCount\}\}" class="message-unread"/);
  assert.match(homeWxml, /item\.chatUnreadCount/);
  assert.match(findWxml, /item\.chatUnreadCount/);
  assert.match(fs.readFileSync('pages/group/index.wxml', 'utf8'), /item\.unreadCount.*action-unread-dot/);
});

test('全部约球中的发起记录卡片点击进详情，聊天按钮进球友列表', () => {
  const destinations = [];
  const page = loadAllMatches({}, {
    navigateTo: options => destinations.push(options.url)
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'recruiting' } } });
  page.openMatchChats({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(destinations[0], '/pages/detail/index?id=7');
  assert.equal(destinations[1], '/pages/match-chats/index?matchId=7');
});

test('过期招募记录仍保留在列表，但卡片不提供取消操作', async () => {
  const page = loadAllMatches({ getMyMatches: () => Promise.resolve([
    { id: 1, status: 'recruiting', displayEnded: false },
    { id: 2, status: 'recruiting', displayEnded: true }
  ]) }, { stopPullDownRefresh() {} });
  page.setData = values => Object.assign(page.data, values);
  page.data = { ...page.data, activeView: 'created', activeFilter: 'all' };
  const records = [
    { id: 1, status: 'recruiting', displayEnded: false },
    { id: 2, status: 'recruiting', displayEnded: true }
  ];
  assert.deepEqual(Array.from(page.filterRecords(records), item => item.id), [1, 2]);
  const wxml = fs.readFileSync('pages/my-matches/index.wxml', 'utf8');
  await page.loadRecords(1, false);
  assert.equal(page.data.records[0].canCancel, true);
  assert.equal(page.data.records[1].canCancel, false);
  assert.match(wxml, /wx:if="\{\{item\.canCancel\}\}"/);
});

test('已组局记录在展示期限结束后仍留在已组局筛选，不进入已过期筛选', () => {
  const page = loadAllMatches({}, {});
  const records = [
    { id: 1, status: 'matched', displayEnded: false },
    { id: 2, status: 'matched', displayEnded: true },
    { id: 3, status: 'recruiting', displayEnded: true }
  ];

  page.data = { ...page.data, activeView: 'created', activeFilter: 'matched' };
  assert.deepEqual(Array.from(page.filterRecords(records), item => item.id), [1, 2]);
  page.data = { ...page.data, activeFilter: 'expired' };
  assert.deepEqual(Array.from(page.filterRecords(records), item => item.id), [3]);
});

test('已组局卡片在聊天只读后仍显示业务状态已组局', async () => {
  const page = loadAllMatches({ getMyMatches: async () => [{ id: 2, status: 'matched', displayEnded: true }] }, {
    stopPullDownRefresh() {}
  });
  page.setData = (update, callback) => {
    page.data = { ...page.data, ...update };
    if (callback) callback();
  };
  page.data = { ...page.data, activeView: 'created', activeFilter: 'matched' };

  await page.loadRecords(1, false);

  assert.equal(page.data.records[0].stateLabel, '已组局');
  const detail = fs.readFileSync('pages/detail/index.wxml', 'utf8');
  assert.match(detail, /match\.displayEnded \? '查看聊天' : '进入聊天'/);
});
