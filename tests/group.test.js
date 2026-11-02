const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadGroup(api, wx) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/group/index.js', 'utf8'), {
    Page: value => { definition = value; },
    require: name => name.endsWith('/api') ? api : name.endsWith('/match-chat-route') ? require('../data/match-chat-route') : name.endsWith('/conversation-list') ? require('../data/conversation-list') : { getUserLocation: () => null, distanceKm: () => null },
    wx, getApp: () => ({ globalData: {} }), setTimeout, clearTimeout, console
  });
  return definition;
}

function loadAllMatches(api, wx) {
  let definition;
  vm.runInNewContext(fs.readFileSync('pages/my-matches/index.js', 'utf8'), {
    Page: value => { definition = value; }, require: name => name.endsWith('/match-chat-route') ? require('../data/match-chat-route') : name.endsWith('/location-store') ? { getUserLocation: () => null, distanceKm: () => null } : api, wx, setTimeout, clearTimeout, console
  });
  return definition;
}

test('已组局卡片点击进入详情，进入聊天按钮直接打开最终会话', async () => {
  const destinations = [];
  const page = loadGroup({ getMatch: async () => ({status:'matched'}), getLatestMatchConversation: async () => ({id:77,won:true}) }, {
    navigateTo: options => destinations.push(options.url)
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'matched' } } });
  await page.openMatchChats({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(destinations[0], '/pages/detail/index?id=7');
  assert.equal(destinations[1], '/pages/chat/index?id=77');
});

test('发起的球局卡片不再显示查看详情按钮，我聊过的卡片标明聊天对象', () => {
  const group = (fs.readFileSync('pages/group/index.wxml', 'utf8') + fs.readFileSync('templates/my-game-card.wxml', 'utf8'));
  const allMatches = (fs.readFileSync('pages/my-matches/index.wxml', 'utf8') + fs.readFileSync('templates/my-game-card.wxml', 'utf8'));
  assert.doesNotMatch(group, /data-chat-first=/);
  assert.match(group, /wx:if="\{\{item\.chatUnreadCount\}\}" class="match-action-unread"/);
  assert.match(group, /class="primary-button match-action-button match-action-chat" catchtap="openMatchChats"/);
  assert.doesNotMatch(group, />查看详情</);
  assert.match(group, /item\.peerName \|\| '球友'/);
  assert.match(group, /class="match-card chatted"/);
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
  assert.match((fs.readFileSync('pages/group/index.wxml', 'utf8') + fs.readFileSync('templates/my-game-card.wxml', 'utf8')), /item\.unreadCount.*action-unread-dot/);
});

test('全部约球中的招募卡片点击进详情，聊天按钮进球友列表', async () => {
  const destinations = [];
  const page = loadAllMatches({getMatch:async()=>({status:'recruiting'})}, {
    navigateTo: options => destinations.push(options.url)
  });
  page.openRecord({ currentTarget: { dataset: { id: 7, status: 'recruiting' } } });
  await page.openMatchChats({ currentTarget: { dataset: { id: 7 } } });
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
  const wxml = (fs.readFileSync('pages/my-matches/index.wxml', 'utf8') + fs.readFileSync('templates/my-game-card.wxml', 'utf8'));
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

test('已组局取消入口使用服务端宽限期，开球后仍可取消且不影响招募规则', async () => {
  const page=loadAllMatches({ getMyMatches: async () => [
    { id: 1, status: 'matched', startsAt: new Date(Date.now()-19*60000).toISOString(), cancellationWindowOpen: true },
    { id: 2, status: 'matched', startsAt: new Date(Date.now()+60000).toISOString(), cancellationWindowOpen: false },
    { id: 3, status: 'recruiting', displayEnded: false },
    { id: 4, status: 'recruiting', displayEnded: true }
  ] }, { stopPullDownRefresh() {} });
  page.setData=values => Object.assign(page.data,values);
  await page.loadRecords(1,false);
  assert.deepEqual(Array.from(page.data.records,item=>item.canCancel),[true,false,true,false]);
});

test('我聊过的仅最终组局参与者在宽限期内有取消入口', async () => {
  const page=loadAllMatches({ getChattedMatches: async () => [
    { id: 1, conversationId: 11, status: 'matched', cancellationWindowOpen: true, won: true },
    { id: 1, conversationId: 12, status: 'matched', cancellationWindowOpen: true, won: false },
    { id: 2, conversationId: 13, status: 'matched', cancellationWindowOpen: false, won: true }
  ] }, { stopPullDownRefresh() {} });
  page.data.activeView='chatted';
  page.setData=values => Object.assign(page.data,values);
  await page.loadRecords(1,false);
  assert.deepEqual(Array.from(page.data.records,item=>item.canCancel),[true,false,false]);
});

test('首页我发起的只取最近两条并单独加载唯一草稿',async()=>{
 const requests=[];
 const page=loadGroup({getMyMatches:async(page,size,filter)=>{requests.push([page,size,filter]);return filter==='draft'?[{id:9,status:'draft'}]:[{id:3,status:'cancelled'},{id:2,status:'matched'},{id:1,status:'recruiting'}]}},{});
 page.setData=values=>Object.assign(page.data,values);
 await page.loadPage(1,false);
 assert.deepEqual(requests,[[1,2,'all'],[1,1,'draft']]);
 assert.deepEqual(Array.from(page.data.recentCreated,row=>row.id),[3,2]);
 assert.equal(page.data.latestDraft.id,9);
});

test('两个查看全部入口携带各自范围，记录页固定身份且包含已取消筛选',()=>{
 const urls=[];
 const page=loadGroup({}, {navigateTo:options=>urls.push(options.url)});
 page.data.activeView='created';page.allMatches();
 page.data.activeView='chatted';page.allMatches();
 assert.deepEqual(urls,['/pages/my-matches/index?view=created','/pages/my-matches/index?view=chatted']);
 const all=loadAllMatches({}, {setNavigationBarTitle(){}});
 all.setData=values=>Object.assign(all.data,values);
 all.onLoad({view:'chatted'});
 assert.equal(all.data.activeView,'chatted');
 assert.equal(all.data.filters.some(row=>row.value==='draft'),false);
 assert.equal(all.data.filters.some(row=>row.value==='cancelled'),true);
 const wxml=fs.readFileSync('pages/my-matches/index.wxml','utf8');
 assert.doesNotMatch(wxml,/class="view-tabs"/);
});

test('首页我聊过的只显示最近两条并保留直接沟通摘要',async()=>{
 const page=loadGroup({getChattedMatches:async(page,size,filter)=>{
  assert.deepEqual([page,size,filter],[1,2,'all']);
  return [{id:1,conversationId:11,status:'matched',won:true,lastMessage:'到了联系',lastMessageAt:'2026-11-02T03:00:00Z'},{id:2,conversationId:12,status:'recruiting',lastMessage:'几点到'},{id:3,conversationId:13,status:'cancelled'}];
 }},{});
 page.data.activeView='chatted';page.setData=v=>Object.assign(page.data,v);
 await page.loadPage();
 assert.deepEqual(Array.from(page.data.chatted,row=>row.conversationId),[11,12]);
 assert.equal(page.data.chatted[0].preview,'到了联系');
});

test('已取消记录在全部中保留且独立筛选，草稿不进入记录页',()=>{
 const page=loadAllMatches({},{});
 const rows=[{id:1,status:'draft'},{id:2,status:'cancelled'},{id:3,status:'matched'},{id:4,status:'cancelled',cancelReason:'PARTICIPANT_DELETED'}];
 page.data.activeFilter='all';
 assert.deepEqual(Array.from(page.filterRecords(rows),r=>r.id),[2,3,4]);
 page.data.activeFilter='cancelled';
 assert.deepEqual(Array.from(page.filterRecords(rows),r=>r.id),[2]);
 page.data.activeFilter='expired';
 assert.deepEqual(Array.from(page.filterRecords(rows),r=>r.id),[4]);
});
