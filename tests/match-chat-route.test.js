const {test}=require('node:test');
const assert=require('node:assert/strict');
const resolveRoute=require('../data/match-chat-route');

test('已组局直接进入最终确认会话，含聊天只读状态',async()=>{
 const api={getMatch:async()=>({status:'matched',displayEnded:true}),getLatestMatchConversation:async()=>({id:77,won:true})};
 assert.equal(await resolveRoute(api,7),'/pages/chat/index?id=77');
});
test('招募中进入当前球局消息列表',async()=>{
 assert.equal(await resolveRoute({getMatch:async()=>({status:'recruiting'})},7),'/pages/match-chats/index?matchId=7');
});
test('已组局未找到最终会话时不误入其他球友聊天',async()=>{
 const api={getMatch:async()=>({status:'matched'}),getLatestMatchConversation:async()=>({id:88,won:false})};
 await assert.rejects(resolveRoute(api,7),/组局聊天/);
});
