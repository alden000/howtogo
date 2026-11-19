// M6 frames sketch (STYLE-GUIDE 6h): builds creative/m6/preview.html and android.html (the /android page),
// and with --shots renders them light/dark, 100/200 %, zh/en at 390 px (+ /android at 1440 px), checking
// horizontal overflow, clipped text and 56 px targets. Usage: node creative/m6/preview.js [--shots]
const fs = require('fs');
const path = require('path');
const D = __dirname;
const pic = (n, l) => fs.readFileSync(path.join(D, 'pictures', `${n}-${l}.svg`), 'utf8');
const icons = fs.readFileSync(path.join(D, 'icons.svg'), 'utf8');
const proto = fs.readFileSync(path.join(D, '..', 'prototype', 'index.html'), 'utf8');
const symbols = (proto.match(/<symbol id="i-[\s\S]*?<\/symbol>/g) || []).join('\n');
const install = '<symbol id="i-install" viewBox="0 0 24 24"><path d="M12 4v10M8 10l4 4 4-4M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15"/></symbol>';
const sealSvg = fs.readFileSync(path.join(D, '..', 'logo', 'final', 'icon.svg'), 'utf8').replace(/<title>.*?<\/title>/, '').replace('role="img"', 'aria-hidden="true"');
const I = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const CSS = `
:root{--ts:1;--c-canvas:#FBF5EC;--c-surface:#FFFFFF;--c-surface-2:#F3EADC;--c-line:#D9CBB6;--c-ink:#1D1915;--c-ink-2:#4A4038;--c-primary:#9A3412;--c-on-primary:#FFFFFF;--c-primary-text:#8A2E0B;--c-primary-soft:#FBE3D3;--c-on-primary-soft:#6E2409;--c-jade:#0E5B49;--c-on-jade:#FFFFFF;--c-jade-soft:#D6EDE4;--c-on-jade-soft:#0A3F33;--c-saffron:#FFD23F;--c-on-saffron:#1D1915;--c-saffron-soft:#FFF1C2;--c-scrim:rgba(29,25,21,.55)}
.dark{--c-canvas:#14110E;--c-surface:#1F1A16;--c-surface-2:#2A231D;--c-line:#43392F;--c-ink:#F6EEE4;--c-ink-2:#CFC3B5;--c-primary:#FF9466;--c-on-primary:#1D1915;--c-primary-text:#FFA77F;--c-primary-soft:#4A2414;--c-on-primary-soft:#FFD9C6;--c-jade:#5FD3B0;--c-on-jade:#0A1F19;--c-jade-soft:#123A30;--c-on-jade-soft:#BDEFDF;--c-saffron-soft:#3D3212;--c-scrim:rgba(0,0,0,.66);color:var(--c-ink)}
html{font-size:calc(20px * var(--ts))}*{box-sizing:border-box}
body{margin:0;background:var(--c-canvas);color:var(--c-ink);font-family:"Atkinson Hyperlegible","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.45;overflow-wrap:break-word}
.ic{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;flex:none}
h1,h2,h3,p{margin:0}
.frame{background:var(--c-canvas);padding:20px;border-bottom:8px solid var(--c-line)}
.tag{font:700 13px system-ui;color:var(--c-ink-2);margin-bottom:10px;letter-spacing:.02em}
.sheet{background:var(--c-surface);border-radius:36px 36px 0 0;padding:24px 20px 20px;box-shadow:0 -6px 24px rgba(60,30,10,.18)}
.tile{width:72px;height:72px;border-radius:20px;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:grid;place-items:center;margin-bottom:16px}.tile .ic{width:36px;height:36px}
.title{font-size:1.5rem;font-weight:700;line-height:1.2;margin-bottom:10px;text-wrap:balance}
.headline{font-size:1.2rem;font-weight:700;line-height:1.3}
.body{font-size:1rem}.cap{font-size:.85rem;color:var(--c-ink-2);line-height:1.3}
.lockline{display:flex;gap:10px;align-items:flex-start;margin:14px 0 4px;color:var(--c-ink-2);font-size:.85rem}.lockline .ic{width:22px;height:22px}
.btn{display:flex;gap:10px;align-items:center;justify-content:center;width:100%;min-height:72px;border-radius:28px;border:0;font:inherit;font-size:1.15rem;font-weight:700;padding:12px 20px;margin-top:12px;background:var(--c-primary);color:var(--c-on-primary);text-align:center}
.btn.sec{min-height:56px;background:var(--c-surface);color:var(--c-ink);border:2px solid var(--c-line)}
.btn.quiet{min-height:56px;background:transparent;color:var(--c-primary-text);text-decoration:underline;text-underline-offset:4px}
.pic{margin:12px 0 4px;max-width:280px}.pic svg{display:block;width:100%;height:auto}
ol.steps{list-style:none;padding:0;margin:16px 0 0;counter-reset:s}ol.steps>li{counter-increment:s;display:grid;grid-template-columns:32px 1fr;gap:12px;margin-bottom:16px}
ol.steps>li::before{content:counter(s);width:32px;height:32px;border-radius:50%;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:grid;place-items:center;font-weight:700}
.brand{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--c-surface-2);border-radius:20px;padding:10px 14px;margin:12px 0}
.linkbtn{min-height:56px;display:inline-flex;align-items:center;color:var(--c-primary-text);font-weight:700;text-decoration:underline;text-underline-offset:4px;background:none;border:0;font:inherit;font-weight:700;padding:0 4px}
.status{display:flex;gap:10px;align-items:center;background:var(--c-jade-soft);color:var(--c-on-jade-soft);border-radius:20px;padding:12px 14px;font-weight:700;margin-top:12px}
.note{display:flex;gap:12px;align-items:flex-start;background:var(--c-surface-2);border-radius:20px;padding:12px;margin-bottom:12px}
.note .t{flex:1 1 0;min-width:0;font-size:.9rem;font-weight:700;line-height:1.3}.note .t small{display:block;font-size:.85rem;font-weight:400;color:var(--c-ink-2);margin-top:4px}
.x{flex:none;width:56px;height:56px;display:grid;place-items:center;background:none;border:0;color:var(--c-ink);margin:-12px -8px -12px 0}
.notebtn{min-height:56px;margin-top:8px;padding:8px 18px;border-radius:28px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);font:inherit;font-weight:700;font-size:1rem;width:100%}
.warnrule{border-left:8px solid var(--c-saffron);background:var(--c-surface);border-radius:20px;padding:16px;margin-top:16px}
.updbar{display:flex;gap:12px;align-items:center;background:var(--c-surface);border-left:8px solid var(--c-jade);border-radius:20px;padding:6px 0 6px 14px;min-height:56px;box-shadow:0 2px 8px rgba(60,30,10,.12)}
.updbar span{flex:1 1 0;min-width:0;font-weight:700;min-height:56px;display:flex;gap:10px;align-items:center}
.card{background:var(--c-surface);border-radius:28px;padding:18px;box-shadow:0 2px 8px rgba(60,30,10,.12)}
.webview{min-height:640px;display:flex;flex-direction:column;justify-content:center}
/* notification mock: system UI, not our tokens (Android draws it) */
.lock{background:linear-gradient(#2c3440,#11151b);padding:18px 12px;border-radius:24px;color:#fff;font-family:Roboto,system-ui,sans-serif}
.lock .clock{font-size:56px;text-align:center;font-weight:300;margin:6px 0 14px}
.nt{background:rgba(255,255,255,.92);color:#1b1b1f;border-radius:22px;padding:12px 14px;margin-bottom:8px;font-size:15px;line-height:1.35}
.nt .h{display:flex;gap:6px;align-items:center;font-size:12.5px;color:#9A3412}.nt .h svg{width:16px;height:16px}.nt .h span{color:#555}
.nt b{display:block;font-size:16px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nt p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nt .acts{display:flex;gap:16px;margin-top:8px}.nt .acts span{color:#9A3412;font-weight:600;padding:8px 0}
.nt.alert{border:3px solid #FFD23F}
`;

const T = {
  zh: {
    locT: '让我知道你在哪里', locB: '这样我才能一步一步带你走，到站前提醒你下车。手机接下来会问你，请按"使用应用时允许"。',
    locLock: '只在你用怎么去的时候看位置。不会保存，也不会给别人。', ok: '好的', locNo: '不用，我打地方名字',
    ntfT: '到站前，在锁屏上提醒你', ntfB: '手机接下来会问你，请按"允许"。', ntfNo: '先不用',
    denT: '手机没有让我看你的位置', denB: '没关系，你还是可以打出地方名字找路。想让我带路，可以在设置里打开。',
    denS: ['按下面的"打开设置"。', '按"权限"→"位置信息"。', '选"仅在使用该应用时允许"，再打开"使用确切位置"。', '按返回，回到怎么去。'],
    openSet: '打开设置', typePlace: '打地方名字',
    h5ntf: '锁屏时不会提醒你下车', h5ntfS: '声音和震动照样会有。', h5ntfB: '打开通知',
    dndT: '勿扰模式时，也提醒你下车？', dndB: '你的手机开着勿扰模式。这样下车提醒可能没有声音。打开"覆盖勿扰"，提醒就一定会响。', dndGo: '去打开', dndNo: '不用了',
    bgT: '让手机别关掉怎么去', bgI: '有些手机为了省电，锁屏后会把怎么去关掉，那样就不能提醒你下车了。改一个设置就好，只要做一次。',
    bgBrand: '你的手机：三星 Samsung', bgOther: '不是这个？', bgHonest: '每部手机的字可能有点不一样，找意思差不多的就好。',
    bgS: ['按下面的"打开设置"。', '按"电池"。', '选"不受限制"。', '按返回，回到怎么去。'], bgOpen: '打开设置', bgSkip: '以后再说',
    bgOk: '已设置好，锁屏时也能提醒你下车。', bgDone: '好了',
    killT: '上次行程中，手机把怎么去关掉了。', killS: '设置一下，锁屏时也能提醒你下车。', killB: '去设置',
    vT: '这部手机没有中文语音', vB: '我先用英文说，也会震动提醒你。装一个中文语音，我就能说中文了。', vGo: '装中文语音', vLater: '先这样',
    vS: '接下来手机会打开"语音数据"。选"中文（中国）"，下载好以后，按返回。',
    wvT: '请先更新手机上的一个部件', wvB: '怎么去需要新一点的"Android System WebView"（手机用来显示网页的部分）。更新是免费的，几分钟就好。', wvGo: '去更新', wvWeb: '先用网页版',
    wvCap: '没有 Play 商店的手机，请在手机自带的应用市场里搜索"WebView"。',
    upd: '有新版本 1.0.2 · 去下载', getT: '下载安卓版 怎么去', getB: '锁屏也能提醒你下车，放在口袋里也会说话和震动。', getGo: '看看怎么下载', getNo: '不用了',
    tripSub: '行程进行中', tripT: '坐 139 号 · 还有 4 站', tripX: '下车前我会提醒你。', stop: '结束行程',
    aNext: '下一站下车', aNextX: 'Toa Payoh Int · 请现在按铃', ack: '知道了', aNow: '到站了，请下车', aNowX: 'Toa Payoh Int · 慢慢下车',
  },
  en: {
    locT: 'Let me know where you are', locB: 'Then I can take you step by step and remind you before your stop. Your phone will ask next. Please tap "While using the app".',
    locLock: 'I only look at your location while you use 怎么去. It isn\'t saved or shared.', ok: 'OK', locNo: 'No, I\'ll type the place',
    ntfT: 'Reminders on your lock screen', ntfB: 'Your phone will ask next. Please tap "Allow".', ntfNo: 'Not now',
    denT: 'Your phone isn\'t sharing your location', denB: 'That\'s okay. You can still type a place name. To let me guide you, turn it on in Settings.',
    denS: ['Tap "Open settings" below.', 'Tap "Permissions" → "Location".', 'Choose "Allow only while using the app", then turn on "Use precise location".', 'Go back to 怎么去.'],
    openSet: 'Open settings', typePlace: 'Type a place',
    h5ntf: 'No get-off reminder on the lock screen', h5ntfS: 'Voice and vibration still work.', h5ntfB: 'Turn on notifications',
    dndT: 'Remind you even in Do Not Disturb?', dndB: 'Do Not Disturb is on, so get-off reminders may be silent. Turn on "Override Do Not Disturb" and they will always sound.', dndGo: 'Turn it on', dndNo: 'No thanks',
    bgT: 'Keep 怎么去 running', bgI: 'To save battery, some phones close 怎么去 when the screen is locked. Then it can\'t remind you to get off. Change one setting, just once.',
    bgBrand: 'Your phone: Samsung', bgOther: 'Not this one?', bgHonest: 'The words on your phone may be a little different. Look for ones that mean the same.',
    bgS: ['Tap "Open settings" below.', 'Tap "Battery".', 'Choose "Unrestricted".', 'Go back to 怎么去.'], bgOpen: 'Open settings', bgSkip: 'Not now',
    bgOk: 'All set. I can remind you even with the screen locked.', bgDone: 'Done',
    killT: 'Last trip, your phone closed 怎么去.', killS: 'Change one setting so it can remind you with the screen locked.', killB: 'Set it up',
    vT: 'This phone has no Chinese voice', vB: 'I\'ll speak English for now and vibrate to remind you. Add a Chinese voice and I can speak Chinese.', vGo: 'Add Chinese voice', vLater: 'Not now',
    vS: 'Your phone will open "voice data" next. Choose "Chinese (China)", and when it has downloaded, go back.',
    wvT: 'Please update one part of your phone', wvB: '怎么去 needs a newer "Android System WebView" (the part of your phone that shows web pages). It\'s free and takes a few minutes.', wvGo: 'Update it', wvWeb: 'Use the web version for now',
    wvCap: 'No Play Store on your phone? Search for "WebView" in your phone\'s own app store.',
    upd: 'New version 1.0.2 · Get it', getT: 'Get the Android app', getB: 'It can remind you to get off even with the screen locked, and talks and buzzes in your pocket.', getGo: 'See how to get it', getNo: 'No thanks',
    tripSub: 'Trip in progress', tripT: 'On bus 139 · 4 stops to go', tripX: 'I\'ll tell you before your stop.', stop: 'End trip',
    aNext: 'Get off at the next stop', aNextX: 'Toa Payoh Int · Press the bell now', ack: 'OK', aNow: 'This is your stop. Get off now', aNowX: 'Toa Payoh Int · Get off slowly',
  },
};

function app(l) {
  const t = T[l];
  const f = (id, inner) => `<section class="frame" data-frame="${id}"><div class="tag">${id}</div>${inner}</section>`;
  return [
    f('A2 location explainer', `<div class="sheet" role="dialog" aria-labelledby="a2t"><div class="tile">${I('loc')}</div><h2 class="title" id="a2t">${t.locT}</h2><p class="body">${t.locB}</p><div class="pic">${pic('perm-location', l)}</div><p class="lockline">${I('lock')}<span>${t.locLock}</span></p><button class="btn">${t.ok}</button><button class="btn sec">${t.locNo}</button></div>`),
    f('A3 notifications explainer', `<div class="sheet" role="dialog"><div class="tile">${I('bell')}</div><h2 class="title">${t.ntfT}</h2><p class="body">${t.ntfB}</p><div class="pic">${pic('perm-notify', l)}</div><button class="btn">${t.ok}</button><button class="btn quiet">${t.ntfNo}</button></div>`),
    f('A4 location denied (don\'t ask again)', `<div class="sheet" role="dialog"><div class="tile">${I('loc')}</div><h2 class="title">${t.denT}</h2><p class="body">${t.denB}</p><ol class="steps">${t.denS.map((s, i) => `<li><div>${s}${i === 2 ? `<div class="pic">${pic('perm-settings-location', l)}</div>` : ''}</div></li>`).join('')}</ol><button class="btn">${I('sliders')}${t.openSet}</button><button class="btn sec">${t.typePlace}</button></div>`),
    f('A5 H5 notifications-off note', `<div class="note">${I('bell-off')}<div class="t">${t.h5ntf}<small>${t.h5ntfS}</small><button class="notebtn">${t.h5ntfB}</button></div><button class="x" aria-label="${l === 'zh' ? '知道了' : 'OK'}">${I('close')}</button></div>`),
    f('A6 DND note', `<div class="sheet" role="dialog"><div class="tile">${I('moon')}</div><h2 class="title">${t.dndT}</h2><p class="body">${t.dndB}</p><div class="pic">${pic('perm-dnd', l)}</div><button class="btn">${t.dndGo}</button><button class="btn quiet">${t.dndNo}</button></div>`),
    f('B1 battery guide (Samsung)', `<div role="main"><div class="tile">${I('battery')}</div><h1 class="title">${t.bgT}</h1><p class="body">${t.bgI}</p><div class="brand"><b>${t.bgBrand}</b><button class="linkbtn">${t.bgOther}</button></div><ol class="steps">${t.bgS.map((s, i) => `<li><div>${s}${i === 1 ? `<div class="pic">${pic('bg-samsung-1', l)}</div>` : i === 2 ? `<div class="pic">${pic('bg-samsung-2', l)}</div>` : ''}</div></li>`).join('')}</ol><p class="cap">${t.bgHonest}</p><button class="btn">${I('sliders')}${t.bgOpen}</button><button class="btn quiet">${t.bgSkip}</button></div>`),
    f('B2 battery guide done', `<div class="status" role="status">${I('check')}<span>${t.bgOk}</span></div><button class="btn">${t.bgDone}</button>`),
    f('B3 H5 killed note', `<div class="note">${I('battery')}<div class="t">${t.killT}<small>${t.killS}</small><button class="notebtn">${t.killB}</button></div><button class="x" aria-label="${l === 'zh' ? '知道了' : 'OK'}">${I('close')}</button></div>`),
    f('C1 no Chinese voice', `<div class="sheet" role="dialog"><div class="tile">${I('mute')}</div><h2 class="title">${t.vT}</h2><p class="body">${t.vB}</p><button class="btn">${I('speaker')}${t.vGo}</button><p class="cap" style="margin-top:8px">${t.vS}</p><div class="pic">${pic('perm-tts', l)}</div><button class="btn sec">${t.vLater}</button></div>`),
    f('C2 WebView too old', `<div class="webview"><div class="tile">${I('smartphone')}</div><h1 class="title">${t.wvT}</h1><p class="body">${t.wvB}</p><button class="btn">${t.wvGo}</button><button class="btn sec">${t.wvWeb}</button><p class="cap" style="margin-top:12px">${t.wvCap}</p></div>`),
    f('D1 update bar (app, H1/Settings)', `<div class="updbar"><span role="button">${I('install')} ${t.upd}</span><button class="x" aria-label="${l === 'zh' ? '以后再说' : 'Later'}" style="margin:0">${I('close')}</button></div>`),
    f('D2 Get-the-app card (web Settings, Android)', `<div class="card"><div class="tile">${I('smartphone')}</div><h2 class="headline">${t.getT}</h2><p class="body" style="margin-top:6px">${t.getB}</p><button class="btn">${t.getGo}</button><button class="btn quiet">${t.getNo}</button></div>`),
    f('N lock screen (system UI)', `<div class="lock"><div class="clock">9:41</div>
      <div class="nt alert"><div class="h">${I('bell')}<b style="display:inline;margin:0;font-size:12.5px">怎么去</b><span>· ${l === 'zh' ? '现在' : 'now'}</span></div><b>${t.aNext}</b><p>${t.aNextX}</p><div class="acts"><span>${t.ack}</span></div></div>
      <div class="nt"><div class="h">${I('bus')}<b style="display:inline;margin:0;font-size:12.5px">怎么去</b><span>· ${t.tripSub}</span></div><b>${t.tripT}</b><p>${t.tripX}</p><div class="acts"><span>${t.stop}</span></div></div></div>`),
  ].join('\n');
}

// ── /android page ─────────────────────────────────────────────────────────────────────────────
const P = {
  zh: {
    lang: 'English', h1: '怎么去? 安卓版', lead: '锁屏也能提醒你下车。',
    ben: ['手机放在口袋里，也会说话、震动，提醒你下车。', '分享行程时，家人一直看得到你走到哪里。', '和网页版一样用，不用重新学。'],
    dl: '下载 怎么去? 1.0.1', req: '1.7 MB · 安卓 7 或更新的手机都能用，安卓 10 或更新的最好。',
    facts: [['版本', '1.0.1'], ['日期', '2026 年 12 月 1 日'], ['大小', '1.7 MB（1,694,285 字节）']], sha: 'SHA-256', copy: '复制',
    shaCap: '想确认文件没有被改过的家人，可以对一下这串字。',
    qrT: '在电脑上？', qrB: '用手机扫一扫，在手机上下载。',
    ios: '这是给安卓手机用的。iPhone 请用网页版。', iosB: '打开网页版',
    instT: '怎么安装', inst: [
      ['按"下载"。如果 Chrome 问"仍要下载吗？"，按"仍然下载"。', 'install-1-warn'],
      ['下载好了，按"打开"。', 'install-2-open'],
      ['手机可能会说"不允许安装未知应用"。按"设置"，打开"允许来自此来源的应用"，再按返回。', 'install-3-source'],
      ['按"安装"。', 'install-4-install'],
      ['如果出现"Play 保护机制"，看下面的说明。', 'install-5-protect'],
      ['装好了，按"打开"。', 'install-6-done'],
      ['第一次打开时，手机会问位置和通知。请选"使用应用时允许"和"允许"。', 'perm-location'],
    ],
    ppT: '为什么手机会问"Play 保护机制"？', ppB: '因为怎么去不是从 Play 商店下载的，手机会小心一点，先问你一下。这很正常。',
    ppS: '看到"扫描应用"，就按它，扫描完再按"安装"。如果写着"仍然安装"，也可以按它。',
    ppSafe: '怎么去不会读你的短信、照片或通讯录。位置只在你用它找路时才用。',
    updT: '有新版本时怎么更新', upd: ['打开这一页，按"下载"。', '按"打开"，再按"更新"。', '好了。你存的家、常去的地方和家人电话都还在。'],
    warnT: '更新时，不要先删掉旧的', warnB: '删掉怎么去，会把你存的家、常去的地方和家人电话一起删掉。新版本直接装在旧的上面就好。',
    foot: '怎么去? 只在这一页下载，不在 Play 商店上架。', priv: '隐私说明', web: '网页版',
  },
  en: {
    lang: '中文', h1: '怎么去? for Android', lead: 'Reminds you to get off, even with the screen locked.',
    ben: ['It talks and buzzes to remind you to get off, even in your pocket.', 'When you share a trip, family keep seeing where you are.', 'Works just like the web version. Nothing new to learn.'],
    dl: 'Download 怎么去? 1.0.1', req: '1.7 MB · Works on Android 7 or newer. Best on Android 10 or newer.',
    facts: [['Version', '1.0.1'], ['Date', '1 December 2026'], ['Size', '1.7 MB (1,694,285 bytes)']], sha: 'SHA-256', copy: 'Copy',
    shaCap: 'For family who want to check the file hasn\'t been changed: compare this code.',
    qrT: 'On a computer?', qrB: 'Scan this with the phone to download it there.',
    ios: 'This is for Android phones. On iPhone, please use the web version.', iosB: 'Open the web version',
    instT: 'How to install', inst: [
      ['Tap "Download". If Chrome asks "Download anyway?", tap "Download anyway".', 'install-1-warn'],
      ['When it has downloaded, tap "Open".', 'install-2-open'],
      ['Your phone may say it isn\'t allowed to install unknown apps. Tap "Settings", turn on "Allow from this source", then go back.', 'install-3-source'],
      ['Tap "Install".', 'install-4-install'],
      ['If you see "Play Protect", read the note below.', 'install-5-protect'],
      ['When it\'s installed, tap "Open".', 'install-6-done'],
      ['The first time, your phone asks about location and notifications. Choose "While using the app" and "Allow".', 'perm-location'],
    ],
    ppT: 'Why does my phone mention "Play Protect"?', ppB: '怎么去 doesn\'t come from the Play Store, so your phone takes extra care and asks you first. That\'s normal.',
    ppS: 'If you see "Scan app", tap it, and when the scan is done, tap "Install". If it says "Install anyway", you can tap that.',
    ppSafe: '怎么去 doesn\'t read your messages, photos or contacts. It uses your location only while it shows you the way.',
    updT: 'When there\'s a new version', upd: ['Open this page and tap "Download".', 'Tap "Open", then "Update".', 'Done. Your saved home, places and family numbers are all still there.'],
    warnT: 'To update, don\'t delete the old one first', warnB: 'Deleting 怎么去 also deletes your saved home, places and family numbers. Just install the new version over the old one.',
    foot: '怎么去? is only downloaded from this page. It isn\'t on the Play Store.', priv: 'Privacy', web: 'Web version',
  },
};
const SHA = '0cec53af991a5a23f1b61e167dd8dbaa7d986e76c6c4eb38d8b25a8a87603c38';
const shaGroups = SHA.match(/.{4}/g).join(' ');
const PCSS = `
.pg{max-width:1120px;margin:0 auto;padding:0 20px 40px}
.hdr{display:flex;align-items:center;gap:12px;min-height:72px}.hdr .logo{display:block;width:40px;height:40px}.hdr .logo svg{width:100%;height:100%}.hdr b{font-size:1.2rem;flex:1}
.langbtn{min-height:56px;min-width:56px;padding:0 16px;border-radius:28px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);font:inherit;font-weight:700}
.hero{display:grid;gap:24px;padding:16px 0 8px}.hero>*{min-width:0}.hero .seal{display:block;width:96px;height:96px}.hero .seal svg{width:100%;height:100%}
.h1{font-size:2.1rem;font-weight:900;line-height:1.15}.lead{font-size:1.2rem;font-weight:700;margin-top:8px;color:var(--c-primary-text)}
ul.ben{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:10px}ul.ben li{display:flex;gap:12px;align-items:flex-start}ul.ben .ic{color:var(--c-jade)}
.dlbtn{font-size:1.15rem;text-decoration:none}.facts{background:var(--c-surface);border-radius:28px;padding:18px;margin-top:16px}
.facts dl{margin:0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 16px}.facts dt{color:var(--c-ink-2)}.facts dd{margin:0;font-weight:700}
.sha{font-family:ui-monospace,Consolas,monospace;font-size:.9rem;word-break:break-all;background:var(--c-surface-2);border-radius:12px;padding:10px 12px;margin:8px 0;line-height:1.6}
.copy{min-height:56px;padding:0 18px;border-radius:28px;border:2px solid var(--c-line);background:var(--c-surface);color:var(--c-ink);font:inherit;font-weight:700;display:inline-flex;gap:8px;align-items:center}
.qr{display:none}.ios{background:var(--c-surface-2);border-radius:20px;padding:14px;margin-top:16px}
h2.sec{font-size:1.5rem;font-weight:700;margin:32px 0 8px}
.pp{background:var(--c-surface);border-left:8px solid var(--c-jade);border-radius:20px;padding:16px;margin-top:8px}
.foot{margin-top:32px;color:var(--c-ink-2);font-size:.85rem;display:grid;gap:4px}.foot a{color:var(--c-primary-text);font-weight:700;min-height:56px;min-width:56px;padding:0 6px;display:inline-flex;align-items:center;margin-right:20px}
@media (min-width:1000px){.hero{grid-template-columns:1.1fr .9fr;align-items:start}.qr{display:block;background:var(--c-surface);border-radius:28px;padding:20px;text-align:center}
 .qr .code{width:200px;height:200px;margin:12px auto;background:repeating-conic-gradient(var(--c-ink) 0 25%,var(--c-surface) 0 50%) 0 0/20px 20px;border:12px solid var(--c-surface);outline:2px solid var(--c-line)}
 ol.inst{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.two{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}}
`;
function android(l, desktop) {
  const t = P[l];
  return `<div class="pg" lang="${l === 'zh' ? 'zh-Hans' : 'en'}">
  <header class="hdr"><span class="logo">${sealSvg}</span><b>怎么去?</b><button class="langbtn" lang="${l === 'zh' ? 'en' : 'zh-Hans'}">${t.lang}</button></header>
  <main>
  <section class="hero"><div><span class="seal">${sealSvg}</span><h1 class="h1" style="margin-top:16px">${t.h1}</h1><p class="lead">${t.lead}</p>
    <ul class="ben">${t.ben.map((b, i) => `<li>${I(['bell', 'family', 'check'][i])}<span>${b}</span></li>`).join('')}</ul>
    <a class="btn dlbtn" href="#" download>${I('install')}${t.dl}</a><p class="cap" style="margin-top:8px">${t.req}</p>
    <div class="facts"><dl>${t.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p style="margin-top:10px;color:var(--c-ink-2)">${t.sha}</p><p class="sha">${shaGroups}</p><button class="copy">${I('copy')}${t.copy}</button><p class="cap" style="margin-top:8px">${t.shaCap}</p></div>
    ${desktop ? '' : `<div class="ios">${t.ios}<br><a class="linkbtn" href="#">${t.iosB}</a></div>`}</div>
    <aside class="qr"><h2 class="headline">${t.qrT}</h2><div class="code" aria-hidden="true"></div><p class="body">${t.qrB}</p></aside></section>
  <h2 class="sec">${t.instT}</h2>
  <ol class="steps inst">${t.inst.map(([s, p]) => `<li><div>${s}<div class="pic">${pic(p, l)}</div></div></li>`).join('')}</ol>
  <div class="two"><section class="pp"><h3 class="headline">${t.ppT}</h3><p class="body" style="margin-top:6px">${t.ppB}</p><p class="body" style="margin-top:6px">${t.ppS}</p><p class="lockline">${I('lock')}<span>${t.ppSafe}</span></p></section>
  <section><h2 class="sec" style="margin-top:8px">${t.updT}</h2><ol class="steps">${t.upd.map((s, i) => `<li><div>${s}${i === 1 ? `<div class="pic">${pic('update-1', l)}</div>` : ''}</div></li>`).join('')}</ol>
  <div class="warnrule" role="note"><h3 class="headline">${t.warnT}</h3><p class="body" style="margin-top:6px">${t.warnB}</p></div></section></div>
  </main>
  <footer class="foot"><span>${t.foot}</span><span><a href="#">${t.priv}</a><a href="#">${t.web}</a></span></footer></div>`;
}

const doc = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M6 frames</title><style>${CSS}${extra}</style></head><body>
<svg style="display:none" xmlns="http://www.w3.org/2000/svg"><defs>${symbols}${install}</defs></svg>${icons}
${body}</body></html>`;
fs.writeFileSync(path.join(D, 'preview.html'), doc(`<div data-lang="zh">${app('zh')}</div><div data-lang="en">${app('en')}</div>`));
fs.writeFileSync(path.join(D, 'android.html'), doc(`<div id="v">${android('zh', false)}</div>`, PCSS));

if (!process.argv.includes('--shots')) { console.log('preview.html + android.html written'); process.exit(0); }

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const out = path.join(D, 'shots');
  const check = async (name) => p.evaluate((name) => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`h-scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
    for (const el of document.querySelectorAll('button,a,[role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.height < 55.5 || r.width < 55.5)) issues.push(`target ${Math.round(r.width)}×${Math.round(r.height)} "${el.textContent.trim().slice(0, 24)}"`);
    }
    for (const el of document.querySelectorAll('.title,.body,.cap,.headline,.btn,.note .t,.h1,.lead,.sha,dd')) if (el.scrollWidth > el.clientWidth + 1) issues.push(`clip "${el.textContent.trim().slice(0, 24)}"`);
    return issues.map((i) => `${name}: ${i}`);
  }, name);
  const all = [];
  for (const l of ['zh', 'en']) for (const theme of ['light', 'dark']) for (const ts of [1, 2]) {
    const tag = `${l}-${theme}-${ts * 100}`;
    await p.setViewportSize({ width: 390, height: 844 });
    await p.setContent(doc(`<div class="${theme}" style="background:var(--c-canvas)">${app(l)}</div>`).replace('--ts:1', `--ts:${ts}`));
    all.push(...(await check('app ' + tag)).filter((s) => !s.includes('"9:41') && !/target \d+×\d+ "(结束行程|End trip|知道了|OK)"$/.test(s)));
    await p.screenshot({ path: path.join(out, `M6-app-${tag}.png`), fullPage: true });
    await p.setContent(doc(`<div class="${theme}" style="background:var(--c-canvas)">${android(l, false)}</div>`, PCSS).replace('--ts:1', `--ts:${ts}`));
    all.push(...await check('android-390 ' + tag));
    await p.screenshot({ path: path.join(out, `M6-android-390-${tag}.png`), fullPage: true });
  }
  for (const l of ['zh', 'en']) for (const theme of ['light', 'dark']) {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.setContent(doc(`<div class="${theme}" style="background:var(--c-canvas)">${android(l, true)}</div>`, PCSS));
    all.push(...await check(`android-1440 ${l}-${theme}`));
    await p.screenshot({ path: path.join(out, `M6-android-1440-${l}-${theme}.png`), fullPage: true });
  }
  await b.close();
  console.log(all.length ? all.join('\n') : 'no overflow, clipping or small targets');
})();
