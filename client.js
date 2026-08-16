const CSS = `.ob-root{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;color:var(--color-text,#e8e8e8);font-size:13px;line-height:1.5;}.ob-header{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}.ob-title{font-size:16px;font-weight:600;}.ob-subtitle{width:100%;color:var(--color-text-dim,#9aa0a6);font-size:12px;}.ob-mini{padding:4px 12px;border:1px solid var(--color-border,#3a3f47);border-radius:6px;background:transparent;color:var(--color-text,#e8e8e8);cursor:pointer;font-size:12px;margin-right:6px;}.ob-status{font-size:12px;padding:3px 10px;border-radius:6px;background:rgba(255,255,255,.06);}.ob-ok{color:#4ade80;}.ob-error{color:#f87171;}.ob-busy{color:#fbbf24;}.ob-card{border:1px solid var(--color-border,#2c313a);border-radius:10px;background:rgba(255,255,255,.03);overflow:hidden;}.ob-card-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;}.ob-chevron{color:var(--color-text-dim,#9aa0a6);width:12px;}.ob-card-title{font-weight:600;flex:1;}.ob-card-body{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:12px;border-top:1px solid var(--color-border,#2c313a);}.ob-field{display:flex;flex-direction:column;gap:4px;}.ob-field input,.ob-field select{background:var(--color-bg,#15181d);border:1px solid var(--color-border,#2c313a);border-radius:7px;color:var(--color-text,#e8e8e8);padding:7px 9px;font-size:13px;}.ob-label{font-size:11px;color:var(--color-text-dim,#9aa0a6);}.ob-toggle{flex-direction:row;align-items:center;gap:8px;font-size:13px;}.ob-toggle input{width:auto;}.ob-qr{margin:2px 0 6px;padding:8px 10px;background:rgba(0,0,0,.25);border:1px dashed var(--color-border,#3a3f47);border-radius:8px;font-size:12px;word-break:break-all;}.ob-qr a{color:var(--color-accent,#7ea2ff);}.ob-note{font-size:11px;color:var(--color-text-dim,#9aa0a6);grid-column:1/-1;}`;
function Toggle(p){return React.createElement('label',{className:'ob-field ob-toggle'},React.createElement('input',{type:'checkbox',checked:!!p.value,onChange:function(e){p.onChange(e.target.checked);}}),React.createElement('span',null,p.label));}
function TextField(p){return React.createElement('label',{className:'ob-field'},React.createElement('span',{className:'ob-label'},p.label),React.createElement('input',{type:p.password?'password':'text',value:p.value||'',placeholder:p.placeholder||'',onChange:function(e){p.onChange(e.target.value);}}));}
function Card(p){const s=React.useState(p.defaultOpen!==false);const open=s[0];const setOpen=s[1];return React.createElement('div',{className:'ob-card'},React.createElement('div',{className:'ob-card-head',onClick:function(){setOpen(!open);}},React.createElement('span',{className:'ob-chevron'},open?'\u25BE':'\u25B8'),React.createElement('span',{className:'ob-card-title'},p.title),p.onTest?React.createElement('button',{className:'ob-mini',onClick:function(e){e.stopPropagation();p.onTest();}},'测试'):null),open?React.createElement('div',{className:'ob-card-body'},p.children):null);}

function BridgeSettings(props){
  const cs=React.useState(null);const config=cs[0];const setConfig=cs[1];
  const ss=React.useState({kind:'idle',msg:'加载中…'});const status=ss[0];const setStatus=ss[1];
  const bs=React.useState(false);const busy=bs[0];const setBusy=bs[1];
  const qs=React.useState(null);const qr=qs[0];const setQr=qs[1];
  React.useEffect(function(){let alive=true;host.call('get-config').then(function(cfg){if(alive&&cfg){setConfig(cfg);setStatus({kind:'ok',msg:'已加载'});}else if(alive){setStatus({kind:'error',msg:'配置为空'});}}).catch(function(e){if(alive)setStatus({kind:'error',msg:'加载失败: '+(e&&e.message)});});return function(){alive=false;};},[]);
  function patch(path,value){setConfig(function(prev){const next=JSON.parse(JSON.stringify(prev));const keys=path.split('.');let node=next;for(let i=0;i<keys.length-1;i++)node=node[keys[i]];node[keys[keys.length-1]]=value;host.call('set-config',next).catch(function(){});return next;});}
  function testChannel(id){setBusy(true);setStatus({kind:'busy',msg:'测试 '+id+'…'});host.call('bridge-send',{channel:id,text:'桥接测试消息',target:'',contextToken:'',msgId:'',isGroup:false}).then(function(r){setBusy(false);setStatus(r&&r.ok?{kind:'ok',msg:id+' 发送成功'}:{kind:'error',msg:id+'：'+((r&&r.error)||'失败')});}).catch(function(e){setBusy(false);setStatus({kind:'error',msg:'测试失败'});});}
  function getQr(){setBusy(true);host.call('weixin-qr').then(function(r){setBusy(false);if(r&&r.ok){setQr({qrcode:r.qrcode,url:r.url});setStatus({kind:'ok',msg:'二维码已生成，请扫码'});}else{setStatus({kind:'error',msg:'获取失败: '+((r&&r.error)||'')});}}).catch(function(e){setBusy(false);setStatus({kind:'error',msg:'获取失败'});});}
  function pollQr(){if(!qr||!qr.qrcode){setStatus({kind:'error',msg:'请先获取二维码'});return;}setBusy(true);host.call('weixin-poll',{qrcode:qr.qrcode}).then(function(r){setBusy(false);if(r&&r.ok&&r.botToken){setQr(null);setStatus({kind:'ok',msg:'登录成功 ✓'});host.call('get-config').then(function(c){if(c)setConfig(c);});}else{setStatus({kind:'busy',msg:'状态: '+((r&&r.status)||'wait')});}}).catch(function(e){setBusy(false);setStatus({kind:'error',msg:'查询失败'});});}
  function restartQQ(){setBusy(true);host.call('qq-restart').then(function(){setBusy(false);setStatus({kind:'ok',msg:'QQ 网关已重启'});}).catch(function(){setBusy(false);setStatus({kind:'error',msg:'重启失败'});});}
  function restartFeishu(){setBusy(true);host.call('feishu-restart').then(function(){setBusy(false);setStatus({kind:'ok',msg:'飞书网关已重启'});}).catch(function(){setBusy(false);setStatus({kind:'error',msg:'重启失败'});});}
  if(config===null)return React.createElement('div',{className:'ob-root'},'正在加载配置…');
  const ch=config.channels;const wx=ch.weixin||{};const qq=ch.qq||{};const feishu=ch.feishu||{};
  return React.createElement('div',{className:'ob-root'},
    React.createElement('div',{className:'ob-header'},React.createElement('div',{className:'ob-title'},'远程桥接 Omni Bridge'),React.createElement('span',{className:'ob-status ob-'+status.kind},status.msg)),
    React.createElement('div',{className:'ob-subtitle'},'微信 ClawBot / QQ / 飞书 桥接。'),
    React.createElement(Card,{title:'微信 · ClawBot（iLink）',defaultOpen:true,onTest:function(){testChannel('weixin');}},
      React.createElement(Toggle,{label:'启用',value:wx.enabled,onChange:function(v){patch('channels.weixin.enabled',v);}}),
      React.createElement(TextField,{label:'botToken',password:true,value:wx.botToken,onChange:function(v){patch('channels.weixin.botToken',v);}}),
      React.createElement(TextField,{label:'默认接收人（留空=回复私信者）',value:wx.defaultTarget,onChange:function(v){patch('channels.weixin.defaultTarget',v);}}),
      React.createElement('div',{className:'ob-field'},React.createElement('div',null,React.createElement('button',{className:'ob-mini',onClick:getQr,disabled:busy},'1. 获取二维码'),React.createElement('button',{className:'ob-mini',onClick:pollQr,disabled:busy},'2. 查询状态')),qr&&qr.url?React.createElement('div',{className:'ob-qr'},React.createElement('a',{href:qr.url,target:'_blank',rel:'noreferrer'},qr.url)):null)
    ),
    React.createElement(Card,{title:'QQ 机器人（官方开放平台）',defaultOpen:true},
      React.createElement(Toggle,{label:'启用',value:qq.enabled,onChange:function(v){patch('channels.qq.enabled',v);}}),
      React.createElement(TextField,{label:'AppID',value:qq.appId,onChange:function(v){patch('channels.qq.appId',v);}}),
      React.createElement(TextField,{label:'AppSecret',password:true,value:qq.secret,onChange:function(v){patch('channels.qq.secret',v);}}),
      React.createElement('div',{className:'ob-field'},React.createElement('button',{className:'ob-mini',onClick:restartQQ,disabled:busy},'重启网关')),
      React.createElement('div',{className:'ob-note'},'无需默认 openid：私信发消息即回复该用户；群里 @机器人 即回复该用户（被动消息）。')
    ),
    React.createElement(Card,{title:'飞书 Bot（自建应用）',defaultOpen:true},
      React.createElement(Toggle,{label:'启用',value:feishu.enabled,onChange:function(v){patch('channels.feishu.enabled',v);}}),
      React.createElement(TextField,{label:'App ID',value:feishu.appId,onChange:function(v){patch('channels.feishu.appId',v);}}),
      React.createElement(TextField,{label:'App Secret',password:true,value:feishu.appSecret,onChange:function(v){patch('channels.feishu.appSecret',v);}}),
      React.createElement(Toggle,{label:'群内需 @机器人 才回复',value:feishu.requireMention!==false,onChange:function(v){patch('channels.feishu.requireMention',v);}}),
      React.createElement('div',{className:'ob-field'},React.createElement('button',{className:'ob-mini',onClick:restartFeishu,disabled:busy},'重启网关')),
      React.createElement('div',{className:'ob-note'},'需在飞书开放平台建自建应用并开通 im:message 权限；事件订阅选「长连接」，订阅 im.message.receive_v1。')
    )
  );
}

return {
  inject: ['slots'],
  apply(ctx){
    styles.insert(CSS);
    ctx.slots.register({name:'settings.section',id:'omni-bridge',order:60,label:'远程桥接'},function(props){return React.createElement(BridgeSettings,{close:props&&props.close});});
  }
};
