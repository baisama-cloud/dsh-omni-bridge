const DEFAULT_CONFIG = {
  runtime: { provider: 'deepseek-official', model: 'deepseek-v4-flash', sandbox: 'workspace-write' },
  channels: {
    weixin: { enabled: false, baseUrl: 'https://ilinkai.weixin.qq.com', botToken: '', botId: '', userId: '', defaultTarget: '' },
    qq: { enabled: false, appId: '', secret: '' },
    feishu: { enabled: false, appId: '', appSecret: '', domain: 'feishu', requireMention: true }
  }
};

const NODE_HTTP = "const http=require('http');const https=require('https');let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>{let req;try{req=JSON.parse(raw)}catch(e){process.stderr.write('parse:'+e.message);process.exit(1)}const mod=req.url.startsWith('https')?https:http;const h=req.headers||{};let body=req.body!==undefined?JSON.stringify(req.body):null;if(body!==null&&!h['content-length'])h['content-length']=String(Buffer.byteLength(body));const r=mod.request(req.url,{method:req.method||'GET',headers:h,timeout:60000},res=>{const c=[];res.on('data',x=>c.push(x));res.on('end',()=>{process.stdout.write(JSON.stringify({status:res.statusCode,body:Buffer.concat(c).toString('utf8')}))})});r.on('timeout',()=>{r.destroy(new Error('timeout'))});r.on('error',e=>{process.stderr.write('err:'+e.message)});if(body!==null)r.write(body);r.end();});";

const NODE_QQ_WS = "const http=require('http');const https=require('https');let cfg;try{cfg=JSON.parse(process.argv[1])}catch(e){console.error('parse:'+e.message);process.exit(1)}function httpReq(method,url,headers,body){return new Promise(function(resolve,reject){const mod=url.startsWith('https')?https:http;const r=mod.request(url,{method:method,headers:headers},function(res){const c=[];res.on('data',x=>c.push(x));res.on('end',function(){resolve({status:res.statusCode,body:Buffer.concat(c).toString('utf8')})})});r.on('error',reject);if(body)r.write(body);r.end()})}async function main(){let tokenRes;try{tokenRes=await httpReq('POST','https://bots.qq.com/app/getAppAccessToken',{'content-type':'application/json'},JSON.stringify({appId:cfg.appId,clientSecret:cfg.secret}))}catch(e){console.error('token-err:'+e.message);process.exit(1)}let token;try{token=JSON.parse(tokenRes.body).access_token}catch(e){console.error('token-parse:'+tokenRes.body);process.exit(1)}if(!token){console.error('no-token:'+tokenRes.body);process.exit(1)}let gwRes;try{gwRes=await httpReq('GET','https://api.sgroup.qq.com/gateway',{authorization:'QQBot '+token})}catch(e){console.error('gw-err:'+e.message);process.exit(1)}let gwUrl;try{gwUrl=JSON.parse(gwRes.body).url}catch(e){console.error('gw-parse:'+gwRes.body);process.exit(1)}if(!gwUrl){console.error('no-gw:'+gwRes.body);process.exit(1)}const ws=new WebSocket(gwUrl);let heartbeatTimer=null;let seq=0;ws.onopen=function(){ws.send(JSON.stringify({op:2,d:{token:'QQBot '+token,intents:(1<<25)|(1<<30),properties:{os:'linux',browser:'omni-bridge',device:'omni-bridge'}}}))};ws.onmessage=function(ev){let msg;try{msg=JSON.parse(ev.data)}catch(e){return}if(typeof msg.s==='number'&&msg.s!==null)seq=msg.s;if(msg.op===10){const interval=(msg.d&&msg.d.heartbeat_interval)||41250;if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=setInterval(function(){try{ws.send(JSON.stringify({op:1,d:seq}))}catch(e){}},interval)}else if(msg.op===11){}else if(msg.op===0){const t=msg.t;const d=msg.d||{};if(t==='C2C_MESSAGE_CREATE'){const a=d.author||{};console.log(JSON.stringify({type:'c2c',openid:a.user_openid||'',msgId:d.id||'',content:d.content||''}))}else if(t==='GROUP_AT_MESSAGE_CREATE'){const a=d.author||{};console.log(JSON.stringify({type:'group',groupId:d.group_openid||'',openid:a.member_openid||'',msgId:d.id||'',content:d.content||''}))}}};ws.onerror=function(e){console.error('ws-error:'+((e&&e.message)||''));process.exit(1)};ws.onclose=function(e){console.error('ws-close:'+e.code);process.exit(1)}}main();";

const NODE_SAVE = "const fs=require('fs');const path=require('path');const os=require('os');let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>{const file=path.join(os.homedir(),'.dsh','omni-bridge-config.json');try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,raw,'utf8');process.stdout.write(file);process.exit(0)}catch(e){process.stderr.write(e.message);process.exit(1)}});";

const NODE_LOAD = "const fs=require('fs');const path=require('path');const os=require('os');const file=path.join(os.homedir(),'.dsh','omni-bridge-config.json');try{process.stdout.write(fs.readFileSync(file,'utf8'))}catch(e){process.stdout.write('null')}process.exit(0);";

function deepClone(v){return JSON.parse(JSON.stringify(v));}
function deepMerge(target,patch){if(patch===null||typeof patch!=='object'||Array.isArray(patch))return target;const out={};for(const k in target)out[k]=target[k];for(const k in patch){if(patch[k]!==null&&typeof patch[k]==='object'&&!Array.isArray(patch[k])&&target[k]!==null&&typeof target[k]==='object'&&!Array.isArray(target[k]))out[k]=deepMerge(target[k],patch[k]);else out[k]=patch[k];}return out;}

return {
  apply(ctx) {
    let config = deepClone(DEFAULT_CONFIG);
    const subprocess = ctx.get('subprocess');
    const agents = ctx.get('agents');
    const persistence = ctx.get('sessionPersistence');

    function workspaceRoot(){const sp=ctx.get('sandboxPolicy');if(sp&&typeof sp.workspaceRoot==='string'&&sp.workspaceRoot)return sp.workspaceRoot;return '.';}

    async function runNode(script, stdinObj, maxOut) {
      if(subprocess===undefined)return{error:'subprocess 服务不可用'};
      let handle;
      try{handle=subprocess.spawn({argv:['node','-e',script],cwd:workspaceRoot(),stdio:{stdin:{data:JSON.stringify(stdinObj)},stdout:{maxBytes:maxOut||(2*1024*1024)},stderr:{maxBytes:100*1024}},graceMs:2000});}
      catch(e){return{error:'spawn 失败: '+(e&&e.message?e.message:e)};}
      let outcome;
      try{outcome=await handle.done;}catch(e){return{error:'进程失败: '+(e&&e.message?e.message:e)};}
      const out=handle.collected.stdout?handle.collected.stdout.readFrom(0).text:'';
      const err=handle.collected.stderr?handle.collected.stderr.readFrom(0).text:'';
      return{exitCode:outcome.exitCode,out:out,err:err};
    }

    async function http(payload,maxOut){
      const r=await runNode(NODE_HTTP,payload,maxOut);
      if(r.error)return{ok:false,error:r.error};
      if(r.exitCode!==0)return{ok:false,error:(r.err||'').trim()||('exit '+r.exitCode)};
      try{return{ok:true,result:JSON.parse(r.out)};}
      catch(e){return{ok:false,error:'输出解析失败: '+e.message,raw:(r.out||'').slice(0,300)};}
    }

    function safeJson(s){try{return JSON.parse(s);}catch(e){return null;}}
    function persistConfig(){runNode(NODE_SAVE,config).then(function(){}).catch(function(){});}

    // ---------- 微信 ClawBot（iLink，按 Whale 驱动协议） ----------
    function randomUin(){return btoa(String((Math.random()*0xffffffff)>>>0));}
    function weixinHeaders(token){const h={'content-type':'application/json','AuthorizationType':'ilink_bot_token','X-WECHAT-UIN':randomUin()};if(token)h.Authorization='Bearer '+token;return h;}
    function wxBase(c){return(c&&c.baseUrl)||'https://ilinkai.weixin.qq.com';}

    async function getWeixinQr(){const r=await http({method:'GET',url:'https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3',headers:{}});if(!r.ok)return r;if(r.result.status<200||r.result.status>=300)return{ok:false,error:'获取二维码失败 HTTP '+r.result.status};const b=safeJson(r.result.body);if(!b)return{ok:false,error:'获取二维码返回异常'};if(b.ret!==undefined&&b.ret!==0)return{ok:false,error:'获取二维码 ret='+b.ret};return{ok:true,qrcode:b.qrcode,url:b.qrcode_img_content||''};}
    async function pollWeixinQr(qrcode){const r=await http({method:'GET',url:'https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode='+qrcode,headers:{'iLink-App-ClientVersion':'1'}});if(!r.ok)return r;if(r.result.status<200||r.result.status>=300)return{ok:false,error:'查询状态失败 HTTP '+r.result.status};const b=safeJson(r.result.body);if(!b)return{ok:false,error:'查询状态返回异常'};return{ok:true,status:b.status||'',botToken:b.bot_token||'',botId:b.ilink_bot_id||b.bot_id||'',userId:b.ilink_user_id||'',baseUrl:b.baseurl||''};}

    async function sendWeixin(c,text,target,contextToken){
      if(!c.botToken)return{ok:false,error:'未配置微信 botToken'};
      const to=target||c.defaultTarget;
      if(!to)return{ok:false,error:'未指定接收人'};
      const clientId='omni-'+((Math.random()*0xffffffff)>>>0).toString(16);
      const msg={to_user_id:to,message_type:2,message_state:2,client_id:clientId,item_list:[{type:1,text_item:{text:text}}]};
      if(contextToken)msg.context_token=contextToken;
      const body={msg:msg,base_info:{channel_version:'1.0.2'}};
      const r=await http({method:'POST',url:wxBase(c)+'/ilink/bot/sendmessage',headers:weixinHeaders(c.botToken),body:body});
      if(!r.ok)return r;
      if(r.result.status<200||r.result.status>=300)return{ok:false,error:'微信发送失败 HTTP '+r.result.status};
      const b=safeJson(r.result.body);
      if(b&&b.ret!==undefined&&b.ret!==0)return{ok:false,error:'微信返回 ret='+b.ret+' errmsg='+(b.errmsg||'')};
      return{ok:true,channel:'weixin',status:r.result.status,ret:b?b.ret:undefined};
    }

    async function getWeixinUpdates(c,cursor){const r=await http({method:'POST',url:wxBase(c)+'/ilink/bot/getupdates',headers:weixinHeaders(c.botToken),body:{get_updates_buf:cursor||'',base_info:{channel_version:'1.0.2'}}},4*1024*1024);if(!r.ok)return r;if(r.result.status<200||r.result.status>=300)return{ok:false,error:'getupdates HTTP '+r.result.status};const b=safeJson(r.result.body);if(!b)return{ok:false,error:'getupdates 返回异常'};return{ok:true,data:b};}

    // ---------- QQ Bot ----------
    async function qqToken(c){if(!c.appId||!c.secret)return{ok:false,error:'未配置 QQ appId/secret'};const r=await http({method:'POST',url:'https://bots.qq.com/app/getAppAccessToken',headers:{'content-type':'application/json'},body:{appId:c.appId,clientSecret:c.secret}});if(!r.ok)return r;const b=safeJson(r.result.body);if(!b||!b.access_token)return{ok:false,error:'QQ 获取 token 失败: '+(r.result.body||'').slice(0,200)};return{ok:true,token:b.access_token};}
    async function sendQQ(c,text,target,msgId,isGroup){
      const t=await qqToken(c);if(!t.ok)return t;
      if(!target)return{ok:false,error:'未指定 QQ 目标 openid/群'};
      const seg=isGroup?'groups':'users';
      const url='https://api.sgroup.qq.com/v2/'+seg+'/'+target+'/messages';
      const body={content:text,msg_type:0};
      if(msgId)body.msg_id=msgId;
      const r=await http({method:'POST',url:url,headers:{'content-type':'application/json',authorization:'QQBot '+t.token},body:body});
      if(!r.ok)return r;
      const s=r.result.status;
      if(s>=200&&s<300)return{ok:true,channel:'qq',status:s};
      return{ok:false,error:'QQ 返回 HTTP '+s+': '+(r.result.body||'').slice(0,300)};
    }

    // ---------- 飞书 Bot ----------
    function feishuBase(c){return(c&&c.domain==='lark')?'https://open.larksuite.com':'https://open.feishu.cn';}
    async function feishuToken(c){if(!c.appId||!c.appSecret)return{ok:false,error:'未配置飞书 appId/appSecret'};const base=feishuBase(c);const r=await http({method:'POST',url:base+'/open-apis/auth/v3/tenant_access_token/internal',headers:{'content-type':'application/json'},body:{app_id:c.appId,app_secret:c.appSecret}});if(!r.ok)return r;const b=safeJson(r.result.body);if(!b||b.code!==0||!b.tenant_access_token)return{ok:false,error:'飞书获取 token 失败: '+(r.result.body||'').slice(0,200)};return{ok:true,token:b.tenant_access_token,base:base};}
    async function sendFeishu(c,text,target,receiveIdType,msgId){
      const t=await feishuToken(c);if(!t.ok)return t;
      if(!target)return{ok:false,error:'未指定飞书接收人/群'};
      const base=t.base;
      const body={content:JSON.stringify({text:text}),msg_type:'text'};
      let r;
      if(msgId){r=await http({method:'POST',url:base+'/open-apis/im/v1/messages/'+msgId+'/reply',headers:{'content-type':'application/json',authorization:'Bearer '+t.token},body:body});}
      else{r=await http({method:'POST',url:base+'/open-apis/im/v1/messages?receive_id_type='+encodeURIComponent(receiveIdType||'open_id'),headers:{'content-type':'application/json',authorization:'Bearer '+t.token},body:Object.assign({receive_id:target},body)});}
      if(!r.ok)return r;
      const s=r.result.status;
      if(s>=200&&s<300)return{ok:true,channel:'feishu',status:s};
      return{ok:false,error:'飞书发送失败 HTTP '+s+': '+(r.result.body||'').slice(0,300)};
    }

    // ---------- 会话桥接 ----------
    const bridgeHandles=[];
    const channelContext={weixin:{target:'',contextToken:''},qq:{target:'',msgId:'',isGroup:false},feishu:{target:'',receiveIdType:'',msgId:''}};
    const readSeq={weixin:0,qq:0,feishu:0};
    const readSeeded={weixin:false,qq:false,feishu:false};
    const seenWxMsg=new Set();

    function makeUserMessage(text,channel){return{id:'bridge-'+channel+'-'+Date.now()+'-'+Math.floor(Math.random()*1e9),role:'user',content:[{type:'text',text:text}],source:{kind:'plugin',plugin:'omni-bridge'}};}
    function extractText(content){if(!Array.isArray(content))return'';return content.map(function(b){return b&&b.type==='text'?(b.text||''):'';}).join('').trim();}
    async function persistedExists(sessionId){try{if(persistence&&typeof persistence.list==='function'){const list=await persistence.list();return list.some(function(h){return h.id===sessionId;});}}catch(e){}return false;}

    function relayToChannel(channel,text){
      const c=config.channels[channel];
      if(!c||!c.enabled)return;
      const cx=channelContext[channel]||{};
      if(channel==='weixin'){
        const target=cx.target||c.defaultTarget;
        if(target)sendWeixin(c,text,target,cx.contextToken).then(function(r){console.log('[bridge] wx send',JSON.stringify(r));});
      } else if(channel==='qq'){
        if(cx.target)sendQQ(c,text,cx.target,cx.msgId,cx.isGroup).then(function(r){console.log('[bridge] qq send',JSON.stringify(r));});
      } else if(channel==='feishu'){
        if(cx.target)sendFeishu(c,text,cx.target,cx.receiveIdType,cx.msgId).then(function(r){console.log('[bridge] fs send',JSON.stringify(r));});
      }
    }

    async function seedWatermark(channel){
      try{
        let max=0;
        if(persistence&&typeof persistence.readFrom==='function'){
          const res=await persistence.readFrom('omni-bridge-'+channel,0);
          if(res&&Array.isArray(res.events)){
            for(const ev of res.events){if(ev&&typeof ev.seq==='number'&&ev.seq>max)max=ev.seq;}
          }
        }
        readSeq[channel]=max+1;
        readSeeded[channel]=true;
      }catch(e){console.error('[bridge] seed watermark fail',channel,e&&e.message);readSeeded[channel]=true;}
    }

    async function pollRelay(){
      for(const channel of ['weixin','qq','feishu']){
        const c=config.channels[channel];
        if(!c||!c.enabled)continue;
        const sessionId='omni-bridge-'+channel;
        const agent=agents?agents.get(sessionId):undefined;
        if(!agent)continue;
        if(!readSeeded[channel]){await seedWatermark(channel);continue;}
        if(!persistence||typeof persistence.readFrom!=='function')continue;
        try{
          const res=await persistence.readFrom(sessionId,readSeq[channel]);
          if(res&&Array.isArray(res.events)){
            for(const ev of res.events){
              if(ev&&typeof ev.seq==='number')readSeq[channel]=ev.seq+1;
              if(ev&&ev.type==='assistant/message'){
                const text=extractText(ev.data&&ev.data.message&&ev.data.message.content);
                if(text)relayToChannel(channel,text);
              }
            }
          }
        }catch(e){console.error('[bridge] poll relay fail',channel,e&&e.message);}
      }
    }

    async function ensureAgent(channel){
      if(!agents)return null;
      const sessionId='omni-bridge-'+channel;
      const existing=agents.get(sessionId);
      if(existing)return existing;
      const rt=config.runtime||{};
      const agentOptions={provider:rt.provider||'deepseek-official',model:rt.model||'deepseek-v4-flash'};
      try{
        let handle;
        if(await persistedExists(sessionId)){handle=await agents.resume({resumeSessionId:sessionId,agentOptions:agentOptions});}
        else{handle=await agents.create({sessionId:sessionId,meta:{cwd:workspaceRoot()},agentOptions:agentOptions});}
        bridgeHandles.push(handle);
        return handle.agent;
      }catch(e){console.error('[bridge] 会话失败',channel,e&&e.message);return null;}
    }

    ctx.effect(function(){return function(){for(const h of bridgeHandles){try{h.dispose();}catch(e){}}bridgeHandles.length=0;if(qqWsHandle){try{qqWsHandle.terminate();}catch(e){}}qqWsHandle=null;if(feishuWsHandle){try{feishuWsHandle.terminate();}catch(e){}}feishuWsHandle=null;};});

    // 微信入站轮询（拉模式）
    let wxCursor='';
    let wxPolling=false;

    // QQ WebSocket 长连接子进程
    let qqWsHandle=null;
    let qqLinesSeen=0;
    let feishuWsHandle=null;
    let feishuLinesSeen=0;

    function startQQ(){
      const c=config.channels.qq;
      if(!c||!c.enabled||!c.appId||!c.secret)return;
      if(qqWsHandle)return;
      if(!subprocess)return;
      try{
        qqWsHandle=subprocess.spawn({argv:['node','-e',NODE_QQ_WS,JSON.stringify({appId:c.appId,secret:c.secret})],cwd:workspaceRoot(),stdio:{stdout:{maxBytes:10*1024*1024},stderr:{maxBytes:100*1024}},graceMs:2000});
        qqLinesSeen=0;
        console.log('[bridge] QQ WS 子进程已启动');
        qqWsHandle.done.then(function(){console.log('[bridge] QQ WS 退出');qqWsHandle=null;}).catch(function(e){console.log('[bridge] QQ WS 失败',e&&e.message);qqWsHandle=null;});
      }catch(e){console.error('[bridge] QQ WS 启动失败',e&&e.message);}
    }

    function pumpQQ(){
      if(!qqWsHandle)return;
      const collected=qqWsHandle.collected&&qqWsHandle.collected.stdout;
      if(!collected)return;
      const txt=collected.readFrom(0).text;
      if(!txt)return;
      const allLines=txt.split('\n');
      const completeCount=allLines.length-1;
      if(completeCount<=qqLinesSeen){qqLinesSeen=completeCount;return;}
      for(let i=qqLinesSeen;i<completeCount;i++){
        const line=allLines[i];
        if(!line)continue;
        const ev=safeJson(line);
        if(!ev)continue;
        if(ev.type==='c2c'){
          channelContext.qq.target=ev.openid||'';
          channelContext.qq.msgId=ev.msgId||'';
          channelContext.qq.isGroup=false;
          if(ev.content)ensureAgent('qq').then(function(agent){if(agent){try{agent.followup(makeUserMessage(ev.content,'qq'));}catch(e){}}});
        } else if(ev.type==='group'){
          channelContext.qq.target=ev.groupId||'';
          channelContext.qq.msgId=ev.msgId||'';
          channelContext.qq.isGroup=true;
          if(ev.content)ensureAgent('qq').then(function(agent){if(agent){try{agent.followup(makeUserMessage(ev.content,'qq'));}catch(e){}}});
        }
      }
      qqLinesSeen=completeCount;
    }

    function startFeishu(){
      const c=config.channels.feishu;
      if(!c||!c.enabled||!c.appId||!c.appSecret)return;
      if(feishuWsHandle)return;
      if(!subprocess)return;
      const script='D:/Document/DSH/工作区/omni-bridge/feishu-ws.cjs';
      try{
        feishuWsHandle=subprocess.spawn({argv:['node',script,JSON.stringify({appId:c.appId,appSecret:c.appSecret,domain:c.domain||'feishu'})],cwd:workspaceRoot(),stdio:{stdout:{maxBytes:10*1024*1024},stderr:{maxBytes:100*1024}},graceMs:2000});
        feishuLinesSeen=0;
        console.log('[bridge] 飞书 WS 子进程已启动');
        feishuWsHandle.done.then(function(){console.log('[bridge] 飞书 WS 退出');feishuWsHandle=null;}).catch(function(e){console.log('[bridge] 飞书 WS 失败',e&&e.message);feishuWsHandle=null;});
      }catch(e){console.error('[bridge] 飞书 WS 启动失败',e&&e.message);}
    }

    function pumpFeishu(){
      if(!feishuWsHandle)return;
      const collected=feishuWsHandle.collected&&feishuWsHandle.collected.stdout;
      if(!collected)return;
      const txt=collected.readFrom(0).text;
      if(!txt)return;
      const allLines=txt.split('\n');
      const completeCount=allLines.length-1;
      if(completeCount<=feishuLinesSeen){feishuLinesSeen=completeCount;return;}
      for(let i=feishuLinesSeen;i<completeCount;i++){
        const line=allLines[i];
        if(!line)continue;
        const ev=safeJson(line);
        if(!ev||ev.type!=='message')continue;
        const c=config.channels.feishu;
        const requireMention=!!(c&&c.requireMention);
        if(ev.chatType==='group'){
          if(requireMention&&!ev.mentionCount)continue;
          channelContext.feishu.target=ev.chatId;
          channelContext.feishu.receiveIdType='chat_id';
          channelContext.feishu.msgId=ev.messageId||'';
        } else {
          channelContext.feishu.target=ev.senderOpenId;
          channelContext.feishu.receiveIdType='open_id';
          channelContext.feishu.msgId=ev.messageId||'';
        }
        if(ev.content)ensureAgent('feishu').then(function(agent){if(agent){try{agent.followup(makeUserMessage(ev.content,'feishu'));}catch(e){}}});
      }
      feishuLinesSeen=completeCount;
    }

    const timer=ctx.get('timer');
    if(timer){
      timer.interval(function(){
        pollRelay();
        pumpQQ();
        pumpFeishu();
        // 微信入站
        if(!wxPolling){
          const c=config.channels.weixin;
          if(c&&c.enabled&&c.botToken){
            wxPolling=true;
            getWeixinUpdates(c,wxCursor).then(function(res){
              if(res.ok&&res.data){
                const d=res.data;
                if(Array.isArray(d.msgs)){
                  for(const m of d.msgs){
                    if(m&&m.message_type===1){
                      const msgId=String(m.message_id||(m.seq+':'+m.from_user_id+':'+m.context_token));
                      if(seenWxMsg.has(msgId))continue;
                      seenWxMsg.add(msgId);
                      if(seenWxMsg.size>2000){const it=seenWxMsg.values();while(seenWxMsg.size>2000)seenWxMsg.delete(it.next().value);}
                      const text=m.item_list&&m.item_list[0]&&m.item_list[0].text_item?m.item_list[0].text_item.text:'';
                      if(!text)continue;
                      channelContext.weixin.target=m.from_user_id;
                      channelContext.weixin.contextToken=m.context_token||'';
                      ensureAgent('weixin').then(function(agent){if(agent){try{agent.followup(makeUserMessage(text,'weixin'));}catch(e){}}});
                    }
                  }
                }
                if(typeof d.get_updates_buf==='string'&&d.get_updates_buf)wxCursor=d.get_updates_buf;
              }
            }).catch(function(){}).then(function(){wxPolling=false;});
          }
        }
      },3000);
    }

    harness.handle('get-config',async function(){return config;});
    harness.handle('set-config',async function(patch){config=deepMerge(config,patch||{});persistConfig();return{ok:true,config:config};});
    harness.handle('weixin-qr',async function(){return getWeixinQr();});
    harness.handle('weixin-poll',async function(args){const r=await pollWeixinQr(args&&args.qrcode);if(r&&r.ok&&r.botToken){config=deepMerge(config,{channels:{weixin:{botToken:r.botToken,botId:r.botId||'',userId:r.userId||'',baseUrl:r.baseUrl||config.channels.weixin.baseUrl,enabled:true}}});persistConfig();}return r;});
    harness.handle('bridge-send',async function(args){const ch=args&&args.channel;const c=config.channels[ch];if(!c||!c.enabled)return{ok:false,error:'通道未启用'};if(ch==='weixin')return sendWeixin(c,args.text,args.target,args.contextToken);if(ch==='qq')return sendQQ(c,args.text,args.target,args.msgId,args.isGroup);if(ch==='feishu')return sendFeishu(c,args.text,args.target,args.receiveIdType,args.msgId);return{ok:false,error:'未知通道 '+ch};});
    harness.handle('qq-restart',async function(){if(qqWsHandle){try{qqWsHandle.terminate();}catch(e){}}qqWsHandle=null;qqLinesSeen=0;startQQ();return{ok:true};});
    harness.handle('feishu-restart',async function(){if(feishuWsHandle){try{feishuWsHandle.terminate();}catch(e){}}feishuWsHandle=null;feishuLinesSeen=0;startFeishu();return{ok:true};});

    runNode(NODE_LOAD,{}).then(function(r){
      if(r&&!r.error&&r.out){const txt=r.out.trim();if(txt&&txt!=='null'){try{config=deepMerge(config,JSON.parse(txt));}catch(e){}}}
      for(const chId in config.channels){if(config.channels[chId]&&config.channels[chId].enabled){ensureAgent(chId);}}
      if(config.channels.qq&&config.channels.qq.enabled)startQQ();
      if(config.channels.feishu&&config.channels.feishu.enabled)startFeishu();
    }).catch(function(e){console.error('[bridge] 读配置异常',e&&e.message);});

    console.log('[bridge] Omni Bridge v27 Host 就绪（微信+QQ+飞书）');
  }
};
