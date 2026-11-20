/* M6 STYLE-GUIDE 6h.6 C2 "WebView too old" (AC 4). ES5, no bundle: runs before the app module, and only inside the
 * Android app (https://localhost). A WebView older than Chrome 100 may not run the app at all, so the app never
 * loads behind this screen (window.__howtogoWvOld stops main.tsx). Language from navigator.language. */
(function () {
  var MIN = 100;
  if (location.protocol !== 'https:' || location.hostname !== 'localhost') return;
  var m = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
  var major = m ? parseInt(m[1], 10) : 0;
  if (major >= MIN) return;
  window.__howtogoWvOld = true;
  var zh = /^zh/i.test(navigator.language || 'zh');
  var T = zh
    ? {
        t: '请先更新手机上的一个部件',
        b: '怎么去需要新一点的“Android System WebView”（手机用来显示网页的部分）。更新是免费的，几分钟就好。',
        u: '去更新',
        w: '先用网页版',
        c: '没有 Play 商店的手机，请在手机自带的应用市场里搜索“WebView”。'
      }
    : {
        t: 'Please update one part of your phone',
        b: '怎么去 needs a newer “Android System WebView” (the part of your phone that shows web pages). It\'s free and takes a few minutes.',
        u: 'Update it',
        w: 'Use the web version for now',
        c: 'No Play Store on your phone? Search for “WebView” in your phone\'s own app store.'
      };
  var MARKET = 'market://details?id=com.google.android.webview';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.google.android.webview';
  var WEB = 'https://howtogo.wwweeeiii.com/';
  var css =
    ':root{--c-canvas:#FBF5EC;--c-surface:#FFFFFF;--c-line:#D9CBB6;--c-ink:#1D1915;--c-ink-2:#4A4038;--c-primary:#9A3412;--c-on-primary:#FFFFFF;--c-primary-soft:#FBE3D3;--c-on-primary-soft:#6E2409;--c-primary-text:#8A2E0B}' +
    '@media (prefers-color-scheme:dark){:root{--c-canvas:#14110E;--c-surface:#1F1A16;--c-line:#43392F;--c-ink:#F6EEE4;--c-ink-2:#CFC3B5;--c-primary:#FF9466;--c-on-primary:#1D1915;--c-primary-soft:#4A2414;--c-on-primary-soft:#FFD9C6;--c-primary-text:#FFA77F}}' +
    'html,body{margin:0;background:var(--c-canvas);color:var(--c-ink);font-family:"Atkinson Hyperlegible","PingFang SC","Noto Sans CJK SC","Noto Sans SC",system-ui,sans-serif}' +
    '.wv{max-width:480px;margin:0 auto;padding:48px 20px 24px;box-sizing:border-box}' +
    '.wv .tile{width:72px;height:72px;border-radius:16px;background:var(--c-primary-soft);color:var(--c-on-primary-soft);display:block;text-align:center;line-height:0;padding-top:16px;box-sizing:border-box;margin-bottom:16px}' +
    '.wv h1{font-size:1.6rem;line-height:1.25;margin:0 0 12px}' +
    '.wv p{font-size:1.1rem;line-height:1.5;margin:0 0 20px}' +
    '.wv .cap{font-size:.95rem;color:var(--c-ink-2)}' +
    '.wv button{display:block;width:100%;box-sizing:border-box;border-radius:16px;font:inherit;font-weight:700;font-size:1.15rem;margin:0 0 12px;padding:8px 16px;cursor:pointer}' +
    '.wv .p{min-height:72px;background:var(--c-primary);color:var(--c-on-primary);border:0}' +
    '.wv .s{min-height:56px;background:var(--c-surface);color:var(--c-primary-text);border:3px solid var(--c-line)}';
  var svg =
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
  function open(url, fallback) {
    var cap = window.Capacitor;
    if (cap && cap.nativePromise) {
      cap.nativePromise('Trip', 'openUrl', { url: url }).then(null, function () {
        if (fallback) open(fallback);
      });
    } else location.href = url;
  }
  function render() {
    var st = document.createElement('style');
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
    var app = document.getElementById('app');
    var main = document.createElement('main');
    main.className = 'wv';
    main.setAttribute('data-testid', 'webview-old');
    main.innerHTML =
      '<span class="tile">' + svg + '</span><h1 tabindex="-1"></h1><p class="b"></p>' +
      '<button type="button" class="p" data-testid="wv-update"></button>' +
      '<button type="button" class="s" data-testid="wv-web"></button><p class="cap"></p>';
    main.getElementsByTagName('h1')[0].appendChild(document.createTextNode(T.t));
    main.getElementsByTagName('p')[0].appendChild(document.createTextNode(T.b));
    main.getElementsByTagName('p')[1].appendChild(document.createTextNode(T.c));
    var b = main.getElementsByTagName('button');
    b[0].appendChild(document.createTextNode(T.u));
    b[1].appendChild(document.createTextNode(T.w));
    b[0].onclick = function () { open(MARKET, PLAY); };
    b[1].onclick = function () { open(WEB); };
    if (app) app.parentNode.replaceChild(main, app);
    else document.body.appendChild(main);
    document.documentElement.lang = zh ? 'zh-CN' : 'en';
    main.getElementsByTagName('h1')[0].focus();
    // On resume: reload, which re-checks the version; new enough → the app loads.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') location.reload();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
