const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadMatchChats(api) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/match-chats/index.js', 'utf8'), {
    Page: value => { definition = value; },
    require: name => name.endsWith('/api') ? api : name.endsWith('/realtime') ? {subscribe:()=>()=>{}} : require('../data/conversation-list'),
    wx: { setNavigationBarTitle() {}, stopPullDownRefresh() {} },
    console, setTimeout:()=>1,clearTimeout() {}
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
  assert.match(wxml, /template is="conversation-group"/);
  const shared=fs.readFileSync('templates/conversation-group.wxml','utf8');
  assert.match(shared,/conversation\.peerAvatar/);
  assert.match(shared,/conversation\.unreadCount/);
});


test('单场聊天共用消息行样式并隐藏球局信息', () => {
  for (const page of ['match-chats','messages']) {
    assert.match(fs.readFileSync(`pages/${page}/index.wxml`,'utf8'),/import src="..\/..\/templates\/conversation-group.wxml"/);
    assert.match(fs.readFileSync(`pages/${page}/index.wxss`,'utf8'),/@import "..\/..\/styles\/conversation-list.wxss"/);
  }
  const wxml=fs.readFileSync('pages/match-chats/index.wxml','utf8');
  assert.doesNotMatch(wxml,/match-summary|section-count|conversation-time|已经到底了/);
  assert.match(wxml,/showMatchInfo: false/);
  assert.match(fs.readFileSync('pages/messages/index.wxml','utf8'),/showMatchInfo: true/);
  assert.match(fs.readFileSync('templates/conversation-group.wxml','utf8'),/wx:if="\{\{showMatchInfo\}\}"/);
});

test('聊天共享样式和模板路径存在且被显式纳入小程序打包', () => {
  const path=require('node:path');
  const config=JSON.parse(fs.readFileSync('project.config.json','utf8'));
  for (const folder of ['styles','templates']) {
    assert.ok(config.packOptions.include.some(item=>item.type==='folder' && item.value===folder));
  }
  for (const page of ['messages','match-chats']) {
    for (const ext of ['wxss','wxml']) {
      const file=`pages/${page}/index.${ext}`;
      const source=fs.readFileSync(file,'utf8');
      const references=Array.from(source.matchAll(ext==='wxss' ? /@import\s+"([^"]+)"/g : /<import\s+src="([^"]+)"/g));
      assert.equal(references.length,1);
      for (const ref of references) assert.ok(fs.existsSync(path.resolve(path.dirname(file),ref[1])));
    }
  }
});
