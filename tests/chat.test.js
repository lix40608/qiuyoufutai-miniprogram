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
});
test('a winning conversation stays open while cancelled and losing conversations close', () => {
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: true }, 1).closed, false);
  assert.equal(model.conversationState({ ...conversation, status: 'matched', won: false }, 1).closed, true);
  assert.equal(model.conversationState({ ...conversation, status: 'cancelled' }, 1).canConfirm, false);
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
