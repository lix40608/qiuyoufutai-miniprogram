const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../data/chat-model');

const conversation = { id: 2, matchId: 7, hostUserId: 1, guestUserId: 3, status: 'recruiting', hostConfirmed: false, guestConfirmed: true, won: false };
test('confirmation state is relative to the current participant', () => {
  assert.equal(model.conversationState(conversation, 1).canConfirm, true);
  assert.equal(model.conversationState(conversation, 3).canConfirm, false);
  assert.equal(model.conversationState(conversation, 1).count, 1);
  assert.equal(model.conversationState(conversation, 1).showInvite, true);
  assert.equal(model.conversationState(conversation, 3).showInvite, false);
});
test('a winning conversation stays open while cancelled and losing conversations close', () => {
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: true }, 1).closed, false);
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: false }, 1).closed, true);
  assert.equal(model.conversationState({ ...conversation, status: 'cancelled' }, 1).canConfirm, false);
  assert.equal(model.conversationState({ ...conversation, displayEnded: true }, 1).closed, false);
});
function page(api, wx = {}) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/chat/index.js', 'utf8'), {
    Page: value => { definition = value; },
    require: name => name.endsWith('chat-model') ? model : api,
    wx, setTimeout: () => 1, clearTimeout() {}, console
  });
  definition.data = { ...definition.data, conversation, messages: [] };
  definition.setData = value => Object.assign(definition.data, value);
  return definition;
}
test('sending does not skip unseen peer messages when polling resumes', async () => {
  const message = (id, senderId) => ({ id, senderId, content: String(id), createdAt: `2026-10-28T10:00:${id}Z` });
  let requestedAfter;
  const p = page({
    sendMessage: async () => message(12, 1),
    getConversation: async () => conversation,
    getMessages: async (_, after) => { requestedAfter = after; return [message(11, 3), message(12, 1)]; }
  });
  p._ready = true; p._userId = 1; p._afterId = 10;
  p.data.loading = false;
  p.data.messages = [message(10, 3)]; p.data.draft = '消息';
  await p.sendMessage();
  assert.equal(p._afterId, 10);
  p._active = true;
  await p.sync();
  assert.equal(requestedAfter, 10);
  assert.equal(p.data.messages.map(item => item.id).join(','), '10,11,12');
});
test('opening the confirmation dialog never confirms before the user accepts', () => {
  let submissions = 0;
  const p = page({}, { showModal: options => options.success({ confirm: false }) });
  p.data.canConfirm = true;
  p.submitConfirmation = () => { submissions++; };
  p.confirmMatch();
  assert.equal(submissions, 0);
});
test('hidden chat pages do not poll', async () => {
  let requests = 0;
  const p = page({ getConversation: async () => { requests++; } });
  p._active = true; p._ready = true;
  p.onHide();
  await p.sync();
  assert.equal(requests, 0);
});

test('服务端返回同一客户端消息时替换待确认消息', () => {
  const failed = { clientId: 'msg-1', senderId: 1, content: '你好', state: 'failed', createdAt: '2026-10-28T10:00:00Z' };
  const delivered = { id: 12, clientId: 'msg-1', senderId: 1, content: '你好', createdAt: '2026-10-28T10:00:01Z' };
  const merged = model.mergeMessages([failed], [delivered]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 12);
});

test('已取消或落败聊天发送被拒后立即锁定并显示系统提示', async () => {
  for (const state of [
    { code: 'MATCH_CANCELLED', status: 'cancelled', won: false, expected: /约局已取消/ },
    { code: 'CONVERSATION_CLOSED', status: 'matched', won: false, expected: /其他聊天完成组局/ }
  ]) {
    const error = Object.assign(new Error('聊天已关闭'), { code: state.code, statusCode: 400 });
    const p = page({
      sendMessage: async () => { throw error; },
      getConversation: async () => ({ ...conversation, status: state.status, won: state.won })
    });
    p._ready = true; p._userId = 1; p.data.loading = false; p.data.draft = '继续吗';
    await p.sendMessage();
    assert.equal(p.data.closed, true);
    assert.equal(p.data.canConfirm, false);
    assert.match(p.data.systemNotice, /刚才这条消息未投递/);
    assert.match(p.data.systemNotice, state.expected);
    assert.equal(p.data.messages[0].state, 'failed');
  }
});

test('停留在旧会话时点确认，服务端拒绝后也关闭确认和发送并提示原因', async () => {
  for (const state of [
    { code: 'MATCH_CANCELLED', status: 'cancelled', expected: /约局已取消/ },
    { code: 'CONVERSATION_CLOSED', status: 'matched', expected: /其他聊天完成组局/ }
  ]) {
    const error = Object.assign(new Error('聊天已关闭'), { code: state.code, statusCode: 400 });
    const p = page({
      confirmConversation: async () => { throw error; },
      getConversation: async () => ({ ...conversation, status: state.status, won: false })
    }, { showToast() {} });
    p.sync = async () => {};
    p.data.canConfirm = true;
    await p.submitConfirmation();
    assert.equal(p.data.closed, true);
    assert.equal(p.data.canConfirm, false);
    assert.match(p.data.systemNotice, state.expected);
  }
});

test('暂不只关闭当前确认邀请提示，不修改确认进度', () => {
  const p = page({});
  p.data.showInvite = true;
  p.data.count = 1;
  p.dismissInvite();
  assert.equal(p.data.inviteDismissed, true);
  assert.equal(p.data.count, 1);
});

test('消息气泡展示双方真实昵称头像而非固定球友占位', () => {
  const source = fs.readFileSync('pages/chat/index.wxml', 'utf8');
  const styles = fs.readFileSync('pages/chat/index.wxss', 'utf8');
  assert.match(source, /conversation\.peerAvatar/);
  assert.match(source, /currentAvatar/);
  assert.match(source, /item\.mine \? currentName : peerName/);
  assert.doesNotMatch(source, /class="message-avatar other-avatar">球友/);
  assert.match(source, /wx:else class="avatar-image" src="\/assets\/eight-ball\.png"/);
  assert.match(styles, /\.message-avatar\s*\{[^}]*border-radius:\s*50%/);
});

test('消息中心分聊天和通知，聊天列表使用对方头像并以黑八兜底', () => {
  const source = fs.readFileSync('pages/messages/index.wxml', 'utf8');
  const styles = fs.readFileSync('pages/messages/index.wxss', 'utf8');
  assert.match(source, /data-tab="chat"/);
  assert.match(source, /data-tab="notification"/);
  assert.match(source, /item\.peerAvatar \|\| '\/assets\/eight-ball\.png'/);
  assert.match(source, /item\.title/);
  assert.match(styles, /\.conversation-avatar\s*\{[^}]*border-radius:\s*50%/);
});
