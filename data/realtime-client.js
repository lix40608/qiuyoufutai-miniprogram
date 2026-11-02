// 与微信API解耦的单连接协议客户端；离开可见页面后释放连接。
function createClient(options) {
  const later=options.setTimeout||setTimeout, cancel=options.clearTimeout||clearTimeout;
  const now=options.now||Date.now, random=options.random||Math.random;
  const listeners=new Set(),pending=new Map();
  let socket=null,ready=false,connecting=false,generation=0,retryTimer,heartbeatTimer,authTimer,attempt=0,sequence=0,lastReceived=0;
  const emit=event=>listeners.forEach(fn=>{try{fn(event)}catch(_){/* 单个页面不能影响其他订阅者 */}});
  const failure=(code,message,uncertain=true)=>Object.assign(new Error(message),{code,uncertain});
  function transmit(frame){if(!socket)return;socket.send({data:JSON.stringify(frame),fail:()=>drop(generation)})}
  function settle(id,error,data){const p=pending.get(id);if(!p)return;cancel(p.timer);pending.delete(id);error?p.reject(error):p.resolve(data)}
  function scheduleHeartbeat(epoch){cancel(heartbeatTimer);heartbeatTimer=later(()=>{if(epoch!==generation||!ready)return;if(now()-lastReceived>75000)return drop(epoch);transmit({type:'ping'});scheduleHeartbeat(epoch)},25000)}
  function drop(epoch){
    if(epoch!==generation)return;
    generation++;const old=socket;socket=null;ready=false;connecting=false;
    cancel(authTimer);cancel(heartbeatTimer);if(old)try{old.close({})}catch(_){}
    emit({type:'disconnected'});
    if(listeners.size){cancel(retryTimer);const delay=Math.min(30000,1000*Math.pow(2,Math.min(attempt++,5)));retryTimer=later(connect,delay+Math.floor(random()*delay*.2))}
  }
  async function connect(){
    if(socket||connecting||!listeners.size||!options.token())return;
    connecting=true;const epoch=++generation;
    try{
      const task=await options.connect();
      if(epoch!==generation||!listeners.size){task.close({});return}
      socket=task;connecting=false;let authenticated=false;
      const authenticate=()=>{if(authenticated||epoch!==generation)return;authenticated=true;transmit({type:'auth',token:options.token()})};
      task.onOpen(authenticate);
      task.onClose(()=>drop(epoch));task.onError(()=>drop(epoch));
      authTimer=later(()=>drop(epoch),10000);
      task.onMessage(({data})=>{
        if(epoch!==generation||!listeners.size)return;
        let frame;try{frame=JSON.parse(data)}catch(_){return}
        lastReceived=now();
        if(frame.type==='ready'){
          ready=true;attempt=0;cancel(authTimer);scheduleHeartbeat(epoch);
          for(const p of pending.values())transmit(p.frame);
          if(ready && epoch===generation)emit({type:'ready'});return;
        }
        if(frame.type==='pong')return;
        if(frame.type==='ack'){settle(frame.requestId,null,frame.data);return}
        if(frame.type==='error'){
          const err=Object.assign(failure(frame.code,frame.message,frame.code==='INTERNAL_ERROR'),{statusCode:frame.statusCode});
          settle(frame.requestId,err);emit({type:'error',error:err});return;
        }
        if(ready)emit(frame);
      });
    }catch(_){connecting=false;drop(epoch)}
  }
  return {
    isReady:()=>ready,
    subscribe(fn){listeners.add(fn);connect();return ()=>{listeners.delete(fn);if(!listeners.size){cancel(retryTimer);cancel(heartbeatTimer);cancel(authTimer);const old=socket;socket=null;connecting=false;ready=false;generation++;if(old)try{old.close({})}catch(_){};for(const id of [...pending.keys()])settle(id,failure('CONNECTION_CLOSED','连接已关闭，发送结果需重新同步'))}}},
    request(type,data){
      if(!options.token())return Promise.reject(failure('UNAUTHORIZED','请先登录',false));
      if(!listeners.size)return Promise.reject(failure('NOT_CONNECTED','请返回聊天页面后重试',false));
      if(pending.size>=50)return Promise.reject(failure('TOO_MANY_PENDING','待确认操作过多，请稍后重试',false));
      const requestId=`ws-${now()}-${++sequence}`;
      return new Promise((resolve,reject)=>{
        const frame=Object.assign({},data,{type,requestId});
        const timer=later(()=>settle(requestId,failure('ACK_TIMEOUT','操作结果暂未确认，请恢复连接后重试')),20000);
        pending.set(requestId,{frame,resolve,reject,timer});
        if(ready)transmit(frame);else connect();
      });
    }
  };
}
module.exports={createClient};
