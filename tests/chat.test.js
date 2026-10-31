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
test('ended conversations are read-only while active winning conversations stay open', () => {
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: true }, 1).closed, false);
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: false }, 1).closed, true);
  assert.equal(model.conversationState({ ...conversation, status: 'cancelled' }, 1).canConfirm, false);
  const ended = model.conversationState({ ...conversation, displayEnded: true }, 1);
  assert.equal(ended.closed, true);
  assert.equal(ended.canConfirm, false);
  assert.match(ended.hint, /已结束/);
});
test('旧版会话接口缺少开球时间时仍根据已加载的约局详情锁定过期聊天', () => {
  const legacyConversation = { ...conversation, startsAt: undefined, displayEnded: undefined };
  const match = { status: 'recruiting', startsAt: '2020-01-01T20:00:00.000Z' };
  const state = model.conversationState(legacyConversation, 1, match);
  assert.equal(state.closed, true);
  assert.equal(state.canConfirm, false);
  assert.match(state.hint, /招募已结束/);
  assert.equal(state.statusLabel, '招募结束');
});
test('只读提示说明实际球局结果，而不是公开展示期限', () => {
  const expiredRecruitment = model.conversationState({ ...conversation, displayEnded: true }, 1);
  assert.equal(expiredRecruitment.statusLabel, '招募结束');
  assert.match(expiredRecruitment.hint, /招募已结束.*历史聊天可查看/);
  assert.doesNotMatch(expiredRecruitment.hint, /公开展示期限/);

  const completed = model.conversationState({ ...conversation, status: 'matched', won: true, displayEnded: true }, 1);
  assert.equal(completed.statusLabel, '已组局');
  assert.match(completed.hint, /组局已结束.*历史聊天可查看/);

  const cancelled = model.conversationState({ ...conversation, status: 'cancelled' }, 1);
  assert.equal(cancelled.statusLabel, '已取消');
  assert.match(cancelled.hint, /约球已取消.*历史聊天可查看/);
});
test('confirmed participant deletion expires the match and tells the host why', () => {
  const state = model.conversationState({ ...conversation, status: 'cancelled', closed: true, cancelReason: 'PARTICIPANT_DELETED' }, 1);
  assert.equal(state.statusLabel, '已过期');
  assert.equal(state.closed, true);
  assert.match(state.hint, /对方账号已注销，本场组局已结束/);
});
test('organizer cancellation does not disclose account deletion', () => {
  const state = model.conversationState({ ...conversation, status: 'cancelled', closed: true }, 3);
  assert.equal(state.statusLabel, '已取消');
  assert.match(state.hint, /本场约球已取消/);
  assert.doesNotMatch(state.hint, /注销/);
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

test('阅读旧消息时新消息不抢滚动位置，并显示可点击的新消息提示', () => {
  const p = page({});
  p._userId = 1;
  p._messageViewportHeight = 400;
  p._hasRenderedMessages = true;
  p.data.messages = [{ id: 10, senderId: 3, content: '旧消息', createdAt: '2026-10-28T10:00:00Z', key: 'message-10' }];
  p.data.scrollTarget = 'message-10';
  p.onMessageScroll({ detail: { scrollTop: 100, scrollHeight: 980 } });
  assert.equal(p._nearBottom, false);
  p.renderMessages([
    ...p.data.messages,
    { id: 11, senderId: 3, content: '新消息', createdAt: '2026-10-28T10:01:00Z' }
  ]);
  assert.equal(p.data.scrollTarget, 'message-10');
  assert.equal(p.data.newMessageCount, 1);
  p.jumpToLatest();
  assert.equal(p.data.scrollTarget, 'message-11');
  assert.equal(p.data.newMessageCount, 0);
});

test('停留在最新消息时新消息继续自动跟随且不显示提示', () => {
  const p = page({});
  p._userId = 1;
  p._nearBottom = true;
  p._hasRenderedMessages = true;
  p.data.messages = [{ id: 10, senderId: 3, content: '旧消息', createdAt: '2026-10-28T10:00:00Z', key: 'message-10' }];
  p.renderMessages([
    ...p.data.messages,
    { id: 11, senderId: 3, content: '新消息', createdAt: '2026-10-28T10:01:00Z' }
  ]);
  assert.equal(p.data.scrollTarget, 'message-11');
  assert.equal(p.data.newMessageCount, 0);
});

test('滚动回最新位置时清除新消息提示', () => {
  const p = page({});
  p._messageViewportHeight = 400;
  p.data.newMessageCount = 2;
  p.onMessageScroll({ detail: { scrollTop: 550, scrollHeight: 980 } });
  assert.equal(p.data.newMessageCount, 0);
  assert.equal(p._nearBottom, true);
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
    { code: 'MATCH_CANCELLED', status: 'cancelled', won: false, expected: /约球已取消/ },
    { code: 'CONVERSATION_CLOSED', status: 'matched', won: false, expected: /其他球友组局.*本次未能组局/ },
    { code: 'MATCH_DISPLAY_ENDED', status: 'recruiting', displayEnded: true, expected: /招募已结束.*历史聊天可查看/ }
  ]) {
    const error = Object.assign(new Error('聊天已关闭'), { code: state.code, statusCode: 400 });
    const p = page({
      sendMessage: async () => { throw error; },
      getConversation: async () => ({ ...conversation, status: state.status, won: state.won, displayEnded: state.displayEnded })
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
    { code: 'MATCH_CANCELLED', status: 'cancelled', expected: /约球已取消/ },
    { code: 'CONVERSATION_CLOSED', status: 'matched', expected: /其他球友组局.*本次未能组局/ },
    { code: 'MATCH_DISPLAY_ENDED', status: 'recruiting', displayEnded: true, expected: /招募已结束.*历史聊天可查看/ }
  ]) {
    const error = Object.assign(new Error('聊天已关闭'), { code: state.code, statusCode: 400 });
    const p = page({
      confirmConversation: async () => { throw error; },
      getConversation: async () => ({ ...conversation, status: state.status, won: false, displayEnded: state.displayEnded })
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
  assert.match(source, /conversation\.peerAvatar \|\| '\/assets\/eight-ball\.png'/);
  assert.match(source, /item\.title/);
  assert.match(styles, /\.conversation-avatar\s*\{[^}]*border-radius:\s*50%/);
});

test('结束的我聊过卡片显示查看聊天且聊天页隐藏输入区', () => {
  const group = fs.readFileSync('pages/group/index.wxml', 'utf8');
  const chat = fs.readFileSync('pages/chat/index.wxml', 'utf8');
  assert.match(group, /item\.displayEnded \? '查看聊天' : '进入聊天'/);
  assert.match(chat, /wx:if="\{\{!closed\}\}" class="composer"/);
  assert.match(chat, /wx:if="\{\{closed && !systemNotice\}\}" class="closed-banner"/);
  assert.match(chat, /bindscroll="onMessageScroll"/);
  assert.match(chat, /class="new-messages-tip" bindtap="jumpToLatest"/);
});
