// 默认使用微信云托管官方连接，不需要为聊天单独购买域名或配置socket合法域名。
// environment填写控制台环境ID（不是环境显示名），service填写后端服务名称。
// 两者必须指向与data/api.js中HTTP接口相同的环境和服务。
module.exports = {
  transport: 'container',
  environment: 'test-d3g0io2m167fbc67a',
  service: 'springboot-r9wn',
  path: '/ws/chat',
  // 仅本地调试或明确改为普通socket连接时使用；container模式忽略此值。
  url: ''
};
