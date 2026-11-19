/**
 * 6f.1 L1 Privacy page copy (zh / en verbatim from the frame). Kept out of the global UI table so it ships
 * only in the lazy Privacy chunk (Home entry budget, AC 3). `**x**` = <strong>, `[x]` = a link (rich()).
 */

/** L1: bumped only when the privacy text changes (`{n}` / `{date}` in the footer). */
export const PRIVACY_NOTICE = { n: 2, date: '2026-11-19' } as const;

export const PV_ZH = {
  pv_title: '隐私说明',
  pv_lead: '怎么去? 不用注册，没有广告，也不追踪你。下面说清楚你的资料去了哪里。',
  pv_glance: '一眼看懂',
  pv_g1: '不用账号',
  pv_g2: '没有广告，不追踪',
  pv_g3: '你的资料多数只在这部手机里',
  pv_h1: '留在这部手机里',
  pv_1a: '你的称呼、家、常去和最近去过的地方、家人的名字和电话、设置和正在走的行程。',
  pv_1b: '没有网络也能用：手机会暂存看过的地图和最近的搜索。',
  pv_1c: '我们看不到这些。',
  pv_h2: '发到我们的服务器',
  pv_2a: '**找路和搜索：**你打的字、起点和终点，用来向 OneMap 和陆路交通管理局查询。我们不记下是谁问的。查到的结果最多暂存 1 天，然后自动删掉。',
  pv_2b: '**分享行程：**只在你分享时，发出你的位置、下一步、目的地名字和家人怎么称呼你（你同意的话，还有电话）。到达后 30 分钟或满 4 小时，分享自动结束；位置和电话马上删掉，其余的最晚 4 小时内删掉。',
  pv_2c: '**家人帮你设置：**家人填的内容先在他们手机上锁好（加密）。我们只保管这个打不开的包，你打开后或 24 小时后就删掉。',
  pv_2d: '**匿名错误统计（可以关）：**只有“哪一种问题、在哪个画面、几次”，没有能认出你的东西。保留 90 天。',
  pv_2e: '服务器记录里没有你的位置、地址、搜索内容或网络地址（IP）；网络地址只短暂用来防止滥用，不保存。',
  pv_h3: '还有谁会参与',
  pv_3a: '**OneMap（新加坡土地管理局）：**地图和地址。你的手机直接向 OneMap 下载地图图片。',
  pv_3b: '**LTA DataMall（陆路交通管理局）：**巴士和地铁资料，经过我们的服务器去问。',
  pv_3c: '**Cloudflare：**帮我们运行网站和服务器。',
  pv_3d: '**WhatsApp、短信、电话、Grab、CDG Zig：**只有你按了才会打开；打开后由它们自己的隐私规定负责。',
  pv_3e: '**Anthropic 的 Claude：**几乎搜不到时，只收到你要找的字，用来猜是哪个地方。猜的结果最多存 30 天。',
  pv_3f: '**手机的语音服务**（多数安卓手机用 Google 的）把你的话变成文字，我们只收到文字。',
  pv_h4: '我们不做的事',
  pv_4a: '不卖你的资料，不用 cookie。',
  pv_h5: '删除所有资料',
  pv_5a: '在设置里按 [清除所有资料]：这部手机上的资料全部删掉，包括暂存的地图和搜索；正在分享的行程也会先停止。',
  pv_5b: '再把 怎么去? 从主屏幕删掉，就全部完成了。',
  pv_family: '家人打开行程链接，不用安装也不用账号；我们不记录是谁在看。',
  pv_contact: '有问题？用设置里的 [报告问题]。',
  pv_footer: '说明版本 {n} · {date}（怎么去? {v}）',
  pv_open: '打开 怎么去?',
};

export type PvKey = keyof typeof PV_ZH;

export const PV_EN: Record<PvKey, string> = {
  pv_title: 'Privacy',
  pv_lead: '怎么去? has no sign-up, no ads and no tracking. Here is where your information goes.',
  pv_glance: 'At a glance',
  pv_g1: 'No account',
  pv_g2: 'No ads, no tracking',
  pv_g3: 'Most of your information stays on this phone',
  pv_h1: 'Stays on this phone',
  pv_1a: 'Your name, Home, your places, recent places, family names and numbers, settings and current trip.',
  pv_1b: "For offline use, it also keeps maps you've seen and recent searches.",
  pv_1c: 'We cannot see any of this.',
  pv_h2: 'Sent to our server',
  pv_2a: "**Searches and routes:** what you type, and the start and end, to ask OneMap and the Land Transport Authority. We don't record who asked. Answers are kept for up to 1 day, then deleted.",
  pv_2b: '**Sharing a trip:** only while you share: your position, next step, destination name and what family call you (and your number, if you allow it). It ends 30 minutes after you arrive or after 4 hours; your position and number are then deleted at once, the rest within 4 hours.',
  pv_2c: '**Family setup:** what family fill in is locked (encrypted) on their phone; we hold only the locked box, deleted once opened or after 24 hours.',
  pv_2d: '**Anonymous error counts (you can turn this off):** only which problem, which screen, how many times; nothing that could identify you. Kept 90 days.',
  pv_2e: 'Our server logs hold no location, address, search or internet address (IP); the IP is used briefly to stop misuse, never kept.',
  pv_h3: 'Who else is involved',
  pv_3a: '**OneMap (Singapore Land Authority):** maps and addresses. Your phone gets map pictures straight from OneMap.',
  pv_3b: '**LTA DataMall (Land Transport Authority):** bus and train information, asked through our server.',
  pv_3c: '**Cloudflare:** runs our website and server.',
  pv_3d: '**WhatsApp, SMS, calls, Grab, CDG Zig:** open only when you tap them; then their own privacy rules apply.',
  pv_3e: "**Anthropic's Claude:** only when a search finds almost nothing, it gets just the words you searched for, to guess the place. We keep its guess up to 30 days.",
  pv_3f: "**Your phone's speech service** (on most Android phones, Google's) turns speech into text; we get only the text.",
  pv_h4: 'What we never do',
  pv_4a: 'No selling your data. No cookies.',
  pv_h5: 'Deleting everything',
  pv_5a: 'In Settings, tap [Delete all my data]: everything on this phone is removed, including saved maps and searches, and any trip share stops first.',
  pv_5b: "Then remove 怎么去? from your home screen, and you're done.",
  pv_family: "Family open a trip link with no app or account; we don't record who watches.",
  pv_contact: 'Questions? Use [Report a problem] in Settings.',
  pv_footer: 'Notice version {n} · {date} (怎么去? {v})',
  pv_open: 'Open 怎么去?',
};
