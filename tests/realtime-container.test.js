const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../data/realtime'),'utf8');
function load(config,cloud){
  const context={module:{exports:{}},wx:{cloud,connectSocket(){throw new Error('不应回退普通socket')}},require(name){
    if(name==='./api')return {realtimeOptions:()=>({token:'session',url:'wss://unused/ws/chat'})};
    if(name==='./realtime-config')return config;
    if(name==='./realtime-client')return {createClient:options=>options};
    throw new Error(name);
  }};
  vm.runInNewContext(source,context);return context.module.exports;
}
test('默认使用云托管，环境和服务必须明确配置',()=>{
  assert.equal(require('../data/realtime-config').transport,'container');
  assert.throws(()=>load({transport:'container',environment:'',service:''},{}).connect(),/环境ID和服务名称/);
});
test('官方connectContainer参数正确，初始化一次并返回SocketTask',async()=>{
  let initialized=0;const task={};const calls=[];
  const client=load({transport:'container',environment:'actual-env',service:'actual-service',path:'/ws/chat'}, {
    init(options){initialized++;assert.equal(options.traceUser,true)},
    connectContainer(options){calls.push(JSON.parse(JSON.stringify(options)));return Promise.resolve({socketTask:task})}
  });
  assert.equal(await client.connect(),task);await client.connect();assert.equal(initialized,1);
  assert.deepEqual(calls[0],{config:{env:'actual-env'},service:'actual-service',path:'/ws/chat'});
  assert.equal(client.token(),'session');
});
test('不支持云能力时给出升级提示，不隐式回退socket',()=>{
  assert.throws(()=>load({transport:'container',environment:'actual-env',service:'actual-service'},{}).connect(),/2.21.1/);
});
