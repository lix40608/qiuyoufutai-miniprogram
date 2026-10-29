const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadMessages(api) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/messages/index.js', 'utf8'), {
    Page: value => { definition = value; }, require: () => api,
    wx: { stopPullDownRefresh() {} }, setTimeout: () => 1, clearTimeout() {}, console
  });
  definition.data = { ...definition.data };
  definition.setData = value => Object.assign(definition.data, value);
  definition._active = true;
  return definition;
}

test('消息按对局分组，确认邀请计入聊过，空会话过滤', async () => {
  const p = loadMessages({
    getConversations: async () => [
      { id: 1, matchId: 70, gameType: '中式八球', venueName: 'A球房', peerName: '小周', lastMessage: '几点到', lastMessageAt: '2026-10-30T03:00:00Z', unreadCount: 2 },
      { id: 2, matchId: 70, gameType: '中式八球', venueName: 'A球房', peerName: '小李', guestConfirmed: true, guestConfirmedAt: '2026-10-30T03:02:00Z', unreadCount: 1 },
      { id: 3, matchId: 70, peerName: '空会话', unreadCount: 0 },
      { id: 4, matchId: 71, gameType: '斯诺克', venueName: 'B球房', peerName: '小王', lastMessage: '可以', lastMessageAt: '2026-10-30T02:00:00Z', unreadCount: 0 }
    ],
    getNotifications: async () => [],
    getUnreadNotificationCount: async () => 0
  });
  await p.refresh();
  assert.equal(p.data.conversationGroups.length, 2);
  const first = p.data.conversationGroups.find(group => group.matchId === 70);
  assert.equal(first.conversations.length, 2);
  assert.equal(first.unreadCount, 3);
  assert.equal(first.conversations.find(row => row.id === 2).preview, '组局确认邀请');
  assert.equal(first.conversations.some(row => row.peerName === '空会话'), false);
});

test('消息列表显示球局分组和会话各自的未读数', () => {
  const source = fs.readFileSync('pages/messages/index.wxml', 'utf8');
  assert.match(source, /wx:for="\{\{conversationGroups\}\}"/);
  assert.match(source, /wx:for="\{\{item\.conversations\}\}"/);
  assert.match(source, /item\.unreadCount/);
  assert.match(source, /conversation\.peerAvatar/);
});
