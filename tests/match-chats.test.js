const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadMatchChats(api) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/match-chats/index.js', 'utf8'), {
    Page: value => { definition = value; },
    require: name => name.endsWith('/api') ? api : require('../data/conversation-list'),
    wx: { setNavigationBarTitle() {}, stopPullDownRefresh() {} },
    console
  });
  definition.data = { ...definition.data };
  definition.setData = value => Object.assign(definition.data, value);
  return definition;
}

test('单场球友聊天页复用消息列表的会话预览和排序规则', async () => {
  const page = loadMatchChats({
    getMatch: async () => ({ id: 7, status: 'matched', displayEnded: true }),
    getMatchConversations: async () => [
      { id: 1, matchId: 7, peerName: '小周', lastMessage: '几点到', lastMessageAt: '2026-10-30T03:00:00Z', unreadCount: 2 },
      { id: 2, matchId: 7, peerName: '小李', guestConfirmed: true, guestConfirmedAt: '2026-10-30T03:02:00Z', unreadCount: 1 },
      { id: 3, matchId: 7, peerName: '空会话', unreadCount: 0 }
    ]
  });
  page.matchId = 7;

  await page.loadPage(1, false);

  assert.deepEqual(Array.from(page.data.conversations, row => row.peerName), ['小李', '小周']);
  assert.equal(page.data.conversations[0].preview, '组局确认邀请');
  assert.equal(page.data.conversations[0].stateLabel, '沟通中');
  const wxml = fs.readFileSync('pages/match-chats/index.wxml', 'utf8');
  assert.match(wxml, /class="card match-conversation-group"/);
  assert.match(wxml, /item\.peerAvatar/);
  assert.match(wxml, /item\.unreadCount/);
});
