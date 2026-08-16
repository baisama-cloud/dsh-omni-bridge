// Feishu (Lark) long-connection inbound subprocess for omni-bridge.
// Uses the official @larksuiteoapi/node-sdk WSClient to receive im.message.receive_v1 events,
// and prints each inbound message as one JSON line to stdout (host pumps them).
const path = require('path');

let lark;
try {
  lark = require('@larksuiteoapi/node-sdk');
} catch (e) {
  // Absolute fallback: SDK installed at workspace root node_modules.
  lark = require('D:/Document/DSH/工作区/node_modules/@larksuiteoapi/node-sdk');
}

let cfg;
try { cfg = JSON.parse(process.argv[2]); } catch (e) { console.error('parse:' + e.message); process.exit(1); }

function logError(s) { console.error(s); }

const domain = (cfg.domain === 'lark') ? lark.Domain.Lark : lark.Domain.Feishu;

try {
  const wsClient = new lark.WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: domain,
    loggerLevel: lark.LoggerLevel.error
  });

  wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data) => {
        try {
          const msg = (data && data.message) || {};
          const sender = (data && data.sender) || {};
          const senderId = sender.sender_id || {};
          let text = '';
          try {
            const c = JSON.parse(msg.content || '{}');
            text = c.text || '';
            // rich-text post content fallback
            if (!text && c.content) {
              const segs = Array.isArray(c.content) ? c.content : [];
              text = segs.map(s => (s && s[1] && s[1].text) || '').join('');
            }
          } catch (e) {}
          const mentions = Array.isArray(msg.mentions)
            ? msg.mentions.map(m => ({ key: m.key, id: m.id, name: m.name }))
            : [];
          const ev = {
            type: 'message',
            chatId: msg.chat_id || '',
            chatType: msg.chat_type || '',
            senderOpenId: senderId.open_id || senderId.user_id || '',
            messageId: msg.message_id || '',
            content: text,
            mentionCount: mentions.length,
            mentions: mentions
          };
          process.stdout.write(JSON.stringify(ev) + '\n');
        } catch (e) {
          logError('event-err:' + e.message);
        }
      }
    })
  }).catch(e => logError('start-err:' + (e && e.message)));
} catch (e) {
  logError('ws-init-err:' + e.message);
  process.exit(1);
}

// keep alive; the host kills this process on unload
setInterval(function(){}, 1 << 30);
