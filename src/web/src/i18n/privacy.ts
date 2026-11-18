/**
 * 6f.1 L1 Privacy page copy (zh / en verbatim from the frame). Kept out of the global UI table so it ships
 * only in the lazy Privacy chunk (Home entry budget, AC 3). `**x**` = <strong>, `[x]` = a link (rich()).
 */

/** L1: bumped only when the privacy text changes (`{n}` / `{date}` in the footer). */
export const PRIVACY_NOTICE = { n: 1, date: '2026-11-18' } as const;

export const PV_ZH = {
  pv_title: '隐私说明',
  pv_lead: '怎么去? 不用注册，没有广告，也不追踪你。下面说清楚你的资料去了哪里。',
  pv_glance: '一眼看懂',
  pv_g1: '不用账号',
  pv_g2: '没有广告，不追踪',
  pv_g3: '你的资料多数只在这部手机里',
  pv_h1: '留在这部手机里',
  pv_1a: '你的称呼、家、常去的地方、最近去过的地方、家人的名字和电话、设置，还有正在走的行程。',
  pv_1b: '为了没有网络也能用，手机还会暂存看过的地图和最近的搜索结果。',
  pv_1c: '我们看不到这些。',
  pv_h2: '发到我们的服务器',
  pv_2a: '**找路和搜索：**你打的字、起点和终点，用来向 OneMap 和陆路交通管理局查询。我们不记下是谁问的。同样的问题会暂存最多 1 天，让下次更快，然后自动删掉。',
  pv_2b: '**分享行程：**只在你分享时，发出你的位置、下一步、目的地的名字和家人怎么称呼你（还有你的电话，如果你同意）。分享最长 4 小时；到达后 30 分钟自动结束。结束时，位置和电话马上删掉，其余的最晚 4 小时内删掉。',
  pv_2c: '**家人帮你设置：**家人填好的内容，先在他们的手机上锁好（加密）。我们只保管这个打不开的包，最多 24 小时；你打开一次，就删掉。',
  pv_2d: '**匿名错误统计（可以关）：**只有"哪一种问题、在哪个画面、几次"。没有位置、地址、搜索内容，也没有能认出你的东西。保留 90 天。可以在设置里关掉。',
  pv_2e: '我们的服务器记录里没有你的位置、地址、搜索内容或网络地址（IP）。网络地址只用来防止有人滥用，不会保存。',
  pv_h3: '还有谁会参与',
  pv_3a: '**OneMap（新加坡土地管理局）：**地图和地址。你的手机直接向 OneMap 下载地图图片。',
  pv_3b: '**LTA DataMall（陆路交通管理局）：**巴士和地铁资料，经过我们的服务器去问。',
  pv_3c: '**Cloudflare：**帮我们运行网站和服务器。',
  pv_3d: '**WhatsApp、短信、电话、Grab、CDG Zig：**只有你按了才会打开。打开以后，由它们自己的隐私规定负责。',
  pv_h4: '我们不做的事',
  pv_4a: '没有广告，不追踪你，没有账号，不卖你的资料，不用 cookie。',
  pv_h5: '删除所有资料',
  pv_5a: '在设置里按 [清除所有资料]：这部手机上的资料全部删掉，包括暂存的地图和搜索。如果正在分享，会先停止分享。',
  pv_5b: '再把 怎么去? 从主屏幕删掉，就全部完成了。',
  pv_family: '家人打开行程链接时，不用安装，也不用账号；我们不记录是谁在看。',
  pv_contact: '有问题？用设置里的 [报告问题]。',
  pv_footer: '说明版本 {n} · {date}（怎么去? {v}）',
  pv_open: '打开 怎么去?',
};

export type PvKey = keyof typeof PV_ZH;

export const PV_EN: Record<PvKey, string> = {
  pv_title: 'Privacy',
  pv_lead: '怎么去? has no sign-up, no ads and no tracking. Here is exactly where your information goes.',
  pv_glance: 'At a glance',
  pv_g1: 'No account',
  pv_g2: 'No ads, no tracking',
  pv_g3: 'Most of your information stays on this phone',
  pv_h1: 'Stays on this phone',
  pv_1a: 'Your name, Home, your places, recent places, family names and numbers, your settings and the trip you are on.',
  pv_1b: 'So it works without internet, the phone also keeps map pictures you have seen and recent search results.',
  pv_1c: 'We cannot see any of this.',
  pv_h2: 'Sent to our server',
  pv_2a: "**Searches and routes:** what you type, and the start and end, so we can ask OneMap and the Land Transport Authority. We don't record who asked. The same question is kept for up to 1 day to answer faster next time, then deleted by itself.",
  pv_2b: "**Sharing a trip:** only while you share, we send your position, your next step, the name of where you're going and what family call you (and your phone number, if you allow it). A share lasts at most 4 hours and ends by itself 30 minutes after you arrive. When it ends, your position and number are deleted at once, and the rest within 4 hours.",
  pv_2c: '**Family setup:** what your family fill in is locked (encrypted) on their phone first. We only hold the locked box, for at most 24 hours, and delete it once you open it.',
  pv_2d: '**Anonymous error counts (you can turn this off):** only which kind of problem, on which screen, and how many times. No location, addresses, searches or anything that could identify you. Kept for 90 days. You can turn it off in Settings.',
  pv_2e: 'Our server logs never contain your location, addresses, searches or internet address (IP). The IP is used only for a moment to stop misuse, and is not kept.',
  pv_h3: 'Who else is involved',
  pv_3a: '**OneMap (Singapore Land Authority):** maps and addresses. Your phone downloads the map pictures straight from OneMap.',
  pv_3b: '**LTA DataMall (Land Transport Authority):** bus and train information, asked through our server.',
  pv_3c: '**Cloudflare:** runs our website and server.',
  pv_3d: '**WhatsApp, SMS, phone calls, Grab, CDG Zig:** they open only when you tap them. After that, their own privacy rules apply.',
  pv_h4: 'What we never do',
  pv_4a: 'No ads, no tracking, no accounts, no selling your data, no cookies.',
  pv_h5: 'Deleting everything',
  pv_5a: 'In Settings, tap [Delete all my data]: everything on this phone is removed, including saved maps and searches. If you are sharing a trip, sharing stops first.',
  pv_5b: "Then remove 怎么去? from your home screen, and you're done.",
  pv_family: "When family open a trip link, they need no app and no account, and we don't record who is watching.",
  pv_contact: 'Questions? Use [Report a problem] in Settings.',
  pv_footer: 'Notice version {n} · {date} (怎么去? {v})',
  pv_open: 'Open 怎么去?',
};
