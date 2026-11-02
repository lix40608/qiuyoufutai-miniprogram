const api=require('./api');
const config=require('./realtime-config');
const {createClient}=require('./realtime-client');
let initialized=false;
module.exports=createClient({
  token:()=>api.realtimeOptions().token,
  connect:()=>{
    if(config.transport==='container'){
      if(!config.environment||!config.service)throw new Error('请在data/realtime-config.js配置云托管环境ID和服务名称');
      if(!wx.cloud||typeof wx.cloud.connectContainer!=='function')throw new Error('微信版本不支持云托管连接，请升级微信（基础库需2.21.1及以上）');
      if(!initialized){wx.cloud.init({traceUser:true});initialized=true}
      return wx.cloud.connectContainer({config:{env:config.environment},service:config.service,path:config.path}).then(result=>result.socketTask);
    }
    if(config.transport!=='socket')throw new Error('不支持的实时连接方式');
    const url=config.url||api.realtimeOptions().url;
    if(!/^wss:\/\//.test(url)&&!/^ws:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url))throw new Error('实时连接需使用WSS');
    return wx.connectSocket({url});
  }
});
