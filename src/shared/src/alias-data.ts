/**
 * 1.1 smart search, layer 1: a curated Singapore alias table (abbreviations, colloquial, Chinese and
 * toneless-pinyin names → OneMap search terms). Hand-written; only places we are confident exist.
 * Keys are matched after `normaliseAliasKey` (case, spaces, full-width, basic traditional → simplified),
 * so write them in lower case / simplified Chinese. `terms` are sent to OneMap elastic search as typed,
 * best match first, at most 5. Station Chinese names are added automatically from the station table
 * (src/data/stations.ts, LTA's official names) — do not repeat plain station names here unless the entry
 * adds something (a bus interchange, a nickname).
 *
 * Prefer the building's postal code when OneMap does not know the common name (QA-64): it is exact.
 *
 * Kinds are informational (tests, future UI grouping).
 */
export type AliasKind = 'hospital' | 'clinic' | 'transport' | 'landmark' | 'religious' | 'service' | 'mall' | 'school';

export interface AliasEntry {
  kind: AliasKind;
  keys: string[];
  terms: string[];
  /** 1.1: zh display name for the "“KKH” means …" line when the longest all-Chinese key is not the full name. */
  zh?: string;
  /**
   * QA-64: en display name when the only term is not a name OneMap knows by heart (a postal code: OneMap
   * always finds a building by its postal code, e.g. 198833 Masjid Sultan, 208718 ICA Building).
   */
  en?: string;
  /** 1.1: a kind of place or a chain (many branches), not one place: no "means" line. */
  many?: true;
}

const mrtBus = (en: string): string[] => [`${en} MRT Station`, `${en} Bus Interchange`];

export const ALIASES: readonly AliasEntry[] = [
  // ---------------- Public hospitals and national centres ----------------
  { kind: 'hospital', keys: ['kkh', 'kk', 'kk hospital', 'kk医院', 'kk妇幼医院', '竹脚医院', '竹脚妇幼医院', '竹脚妇幼', 'zhu jiao yi yuan'], terms: ["KK Women's and Children's Hospital"] },
  { kind: 'hospital', keys: ['sgh', '中央医院', '新加坡中央医院', 'zhong yang yi yuan', 'singapore general'], terms: ['Singapore General Hospital'] },
  { kind: 'hospital', keys: ['ttsh', 'tan tock seng', '陈笃生医院', '陈笃生', 'chen du sheng yi yuan', 'chen du sheng'], terms: ['Tan Tock Seng Hospital'] },
  { kind: 'hospital', keys: ['nuh', '国大医院', '国立大学医院', '新加坡国立大学医院', 'guo da yi yuan'], terms: ['National University Hospital'] },
  { kind: 'hospital', keys: ['cgh', '樟宜综合医院', '樟宜医院', 'zhang yi zong he yi yuan', 'zhang yi yi yuan'], terms: ['Changi General Hospital'] },
  { kind: 'hospital', keys: ['ktph', 'khoo teck puat', '邱德拔医院', '邱德拔', 'qiu de ba yi yuan'], terms: ['Khoo Teck Puat Hospital'] },
  { kind: 'hospital', keys: ['skh', 'sengkang hospital', '盛港综合医院', '盛港医院', 'sheng gang yi yuan'], terms: ['Sengkang General Hospital'] },
  { kind: 'hospital', keys: ['ntfgh', 'ng teng fong', '黄廷方综合医院', '黄廷方医院', 'huang ting fang yi yuan'], terms: ['Ng Teng Fong General Hospital'] },
  { kind: 'hospital', keys: ['imh', '心理卫生学院', '板桥医院', 'ban qiao yi yuan'], terms: ['Institute of Mental Health'] },
  { kind: 'hospital', keys: ['ah', 'alexandra hosp', '亚历山大医院', 'ya li shan da yi yuan'], terms: ['Alexandra Hospital'] },
  { kind: 'hospital', keys: ['jch', 'jurong community hosp', '裕廊社区医院'], terms: ['Jurong Community Hospital'] },
  { kind: 'hospital', keys: ['ych', '义顺社区医院'], terms: ['Yishun Community Hospital'] },
  { kind: 'hospital', keys: ['skch', '盛港社区医院'], terms: ['Sengkang Community Hospital'] },
  { kind: 'hospital', keys: ['och'], terms: ['Outram Community Hospital'] },
  { kind: 'hospital', keys: ['ncid', '国家传染病中心'], terms: ['National Centre for Infectious Diseases'] },
  { kind: 'hospital', keys: ['nccs', '国家癌症中心'], terms: ['National Cancer Centre Singapore'] },
  { kind: 'hospital', keys: ['nhcs', '国家心脏中心'], terms: ['National Heart Centre Singapore'] },
  { kind: 'hospital', keys: ['snec', '国家眼科中心', '眼科中心'], terms: ['Singapore National Eye Centre'] },
  { kind: 'hospital', keys: ['nsc', '国家皮肤中心', '皮肤中心'], terms: ['National Skin Centre'] },
  { kind: 'hospital', keys: ['nni', '国家脑神经医学院'], terms: ['National Neuroscience Institute'] },
  { kind: 'hospital', keys: ['ndcs', '国家牙科中心', '牙科中心'], terms: ['National Dental Centre Singapore'] },
  { kind: 'hospital', keys: ['mount e', 'mt e', 'mt elizabeth', '伊丽莎白医院'], terms: ['Mount Elizabeth Hospital', 'Mount Elizabeth Novena Hospital'] },
  { kind: 'hospital', keys: ['gleneagles', '鹰阁医院'], terms: ['Gleneagles Hospital'] },
  { kind: 'hospital', keys: ['莱佛士医院'], terms: ['Raffles Hospital'] },
  { kind: 'hospital', keys: ['仁慈医院'], terms: ['Ren Ci Hospital'] },
  { kind: 'hospital', keys: ['st lukes', 'st luke', '圣路加医院'], terms: ["St Luke's Hospital"] },

  // ---------------- Polyclinics (综合诊疗所) ----------------
  { kind: 'clinic', keys: ['amk poly', '宏茂桥综合诊疗所'], terms: ['Ang Mo Kio Polyclinic'] },
  { kind: 'clinic', keys: ['tpy poly', '大巴窑综合诊疗所'], terms: ['Toa Payoh Polyclinic'] },
  { kind: 'clinic', keys: ['bedok poly', '勿洛综合诊疗所'], terms: ['Bedok Polyclinic'] },
  { kind: 'clinic', keys: ['tampines poly', '淡滨尼综合诊疗所'], terms: ['Tampines Polyclinic'] },
  { kind: 'clinic', keys: ['clementi poly', '金文泰综合诊疗所'], terms: ['Clementi Polyclinic'] },
  { kind: 'clinic', keys: ['je poly', 'jurong poly', '裕廊综合诊疗所'], terms: ['Jurong Polyclinic'] },
  { kind: 'clinic', keys: ['cck poly', '蔡厝港综合诊疗所'], terms: ['Choa Chu Kang Polyclinic'] },
  { kind: 'clinic', keys: ['woodlands poly', '兀兰综合诊疗所'], terms: ['Woodlands Polyclinic'] },
  { kind: 'clinic', keys: ['yishun poly', '义顺综合诊疗所'], terms: ['Yishun Polyclinic'] },
  { kind: 'clinic', keys: ['sengkang poly', '盛港综合诊疗所'], terms: ['Sengkang Polyclinic'] },
  { kind: 'clinic', keys: ['punggol poly', '榜鹅综合诊疗所'], terms: ['Punggol Polyclinic'] },
  { kind: 'clinic', keys: ['geylang poly', '芽笼综合诊疗所'], terms: ['Geylang Polyclinic'] },
  { kind: 'clinic', keys: ['outram poly', '欧南综合诊疗所'], terms: ['Outram Polyclinic'] },
  { kind: 'clinic', keys: ['queenstown poly', '女皇镇综合诊疗所'], terms: ['Queenstown Polyclinic'] },
  { kind: 'clinic', keys: ['bukit batok poly', '武吉巴督综合诊疗所'], terms: ['Bukit Batok Polyclinic'] },
  { kind: 'clinic', keys: ['pasir ris poly', '白沙综合诊疗所'], terms: ['Pasir Ris Polyclinic'] },
  { kind: 'clinic', keys: ['marine parade poly', '马林百列综合诊疗所'], terms: ['Marine Parade Polyclinic'] },
  { kind: 'clinic', keys: ['综合诊疗所', 'polyclinic', 'poly'], terms: ['Polyclinic'], many: true },

  // ---------------- Towns: MRT + bus interchange (zh, pinyin, short forms) ----------------
  { kind: 'transport', keys: ['amk', '宏茂桥', 'hong mao qiao', 'amk int', 'amk interchange'], terms: mrtBus('Ang Mo Kio') },
  { kind: 'transport', keys: ['tpy', '大巴窑', 'da ba yao', 'tpy int', 'tpy interchange'], terms: mrtBus('Toa Payoh') },
  { kind: 'transport', keys: ['cck', '蔡厝港', 'cai cuo gang', 'cck int', 'cck interchange'], terms: mrtBus('Choa Chu Kang') },
  { kind: 'transport', keys: ['je', '裕廊东', 'yu lang dong', 'je int', 'je interchange'], terms: mrtBus('Jurong East') },
  { kind: 'transport', keys: ['hbf', '港湾', 'gang wan', 'harbour front', 'hbf int', 'hbf interchange'], terms: [...mrtBus('HarbourFront'), 'HarbourFront Centre'] },
  { kind: 'transport', keys: ['碧山', 'bi shan', 'bishan int'], terms: mrtBus('Bishan') },
  { kind: 'transport', keys: ['义顺', 'yi shun', 'yishun int'], terms: mrtBus('Yishun') },
  { kind: 'transport', keys: ['兀兰', 'wu lan', 'woodlands int'], terms: mrtBus('Woodlands') },
  { kind: 'transport', keys: ['淡滨尼', 'dan bin ni', 'tampines int', 'tamp', 'tamps'], terms: mrtBus('Tampines') },
  { kind: 'transport', keys: ['白沙', 'bai sha', 'pasir ris int'], terms: mrtBus('Pasir Ris') },
  { kind: 'transport', keys: ['勿洛', 'wu luo', 'bedok int'], terms: mrtBus('Bedok') },
  { kind: 'transport', keys: ['文礼', 'wen li', 'boon lay int'], terms: mrtBus('Boon Lay') },
  { kind: 'transport', keys: ['武吉班让', 'wu ji ban rang', 'bukit panjang int'], terms: mrtBus('Bukit Panjang') },
  { kind: 'transport', keys: ['武吉巴督', 'wu ji ba du', 'bukit batok int'], terms: mrtBus('Bukit Batok') },
  { kind: 'transport', keys: ['盛港', 'sheng gang', 'sengkang int'], terms: mrtBus('Sengkang') },
  { kind: 'transport', keys: ['榜鹅', 'bang e', 'punggol int'], terms: mrtBus('Punggol') },
  { kind: 'transport', keys: ['后港', 'hou gang', 'hougang central', 'hougang int'], terms: ['Hougang MRT Station', 'Hougang Central Bus Interchange'] },
  { kind: 'transport', keys: ['实龙岗', 'shi long gang', 'serangoon int'], terms: mrtBus('Serangoon') },
  { kind: 'transport', keys: ['金文泰', 'jin wen tai', 'clementi int'], terms: mrtBus('Clementi') },
  { kind: 'transport', keys: ['三巴旺', 'san ba wang', 'sembawang int'], terms: mrtBus('Sembawang') },
  { kind: 'transport', keys: ['jw', '裕廊西', 'yu lang xi'], terms: ['Jurong West', 'Boon Lay MRT Station', 'Pioneer MRT Station'] },
  { kind: 'transport', keys: ['ps', 'plaza sing', 'plaza singapura', '狮城大厦'], terms: ['Plaza Singapura', 'Dhoby Ghaut MRT Station'] },
  { kind: 'transport', keys: ['town', '市区', '市中心'], terms: ['City Hall MRT Station', 'Raffles Place MRT Station'] },

  // ---------------- Airport ----------------
  { kind: 'transport', keys: ['樟宜机场', '机场', 'zhang yi ji chang', 'changi airport', 'airport'], terms: ['Changi Airport Terminal 1', 'Changi Airport Terminal 2', 'Changi Airport Terminal 3', 'Changi Airport Terminal 4', 'Changi Airport MRT Station'] },
  { kind: 'transport', keys: ['t1', '一号搭客大厦', '第一搭客大厦'], terms: ['Changi Airport Terminal 1'] },
  { kind: 'transport', keys: ['t2', '二号搭客大厦', '第二搭客大厦'], terms: ['Changi Airport Terminal 2'] },
  { kind: 'transport', keys: ['t3', '三号搭客大厦', '第三搭客大厦'], terms: ['Changi Airport Terminal 3'] },
  { kind: 'transport', keys: ['t4', '四号搭客大厦', '第四搭客大厦'], terms: ['Changi Airport Terminal 4'] },
  { kind: 'mall', keys: ['jewel', '星耀樟宜', 'xing yao zhang yi'], terms: ['Jewel Changi Airport'] },

  // ---------------- Landmarks and areas ----------------
  { kind: 'landmark', keys: ['牛车水', 'niu che shui', 'niucheshui', 'chinatown'], terms: ['Chinatown MRT Station', 'Chinatown Point', 'Chinatown Complex'] },
  { kind: 'landmark', keys: ['乌节', '乌节路', 'wu jie', 'wu jie lu', 'orchard'], terms: ['Orchard MRT Station', 'Orchard Road', 'ION Orchard'] },
  { kind: 'landmark', keys: ['滨海湾', 'bin hai wan', 'marina bay'], terms: ['Marina Bay Sands', 'Marina Bay MRT Station', 'Gardens by the Bay'] },
  { kind: 'landmark', keys: ['mbs', '滨海湾金沙', '金沙', 'bin hai wan jin sha', 'jin sha'], terms: ['Marina Bay Sands'] },
  { kind: 'landmark', keys: ['gbtb', '滨海湾花园', 'bin hai wan hua yuan'], terms: ['Gardens by the Bay'] },
  { kind: 'landmark', keys: ['圣淘沙', 'sheng tao sha'], terms: ['Sentosa', 'Resorts World Sentosa'] },
  { kind: 'landmark', keys: ['rws', '名胜世界', 'ming sheng shi jie'], terms: ['Resorts World Sentosa'] },
  { kind: 'landmark', keys: ['uss', '环球影城', 'huan qiu ying cheng'], terms: ['Universal Studios Singapore'] },
  { kind: 'landmark', keys: ['鱼尾狮', 'yu wei shi', 'merlion'], terms: ['Merlion Park'] },
  { kind: 'landmark', keys: ['植物园', 'zhi wu yuan', 'botanic gardens', 'botanical garden'], terms: ['Singapore Botanic Gardens', 'Botanic Gardens MRT Station'] },
  { kind: 'landmark', keys: ['动物园', 'dong wu yuan', 'zoo'], terms: ['Singapore Zoo'] },
  { kind: 'landmark', keys: ['夜间动物园', 'ye jian dong wu yuan'], terms: ['Night Safari'] },
  { kind: 'landmark', keys: ['飞禽公园', '裕廊飞禽公园', 'fei qin gong yuan', 'bird park'], terms: ['Bird Paradise'] },
  { kind: 'landmark', keys: ['摩天观景轮', 'mo tian guan jing lun', 'flyer'], terms: ['Singapore Flyer'] },
  { kind: 'landmark', keys: ['滨海艺术中心', 'bin hai yi shu zhong xin'], terms: ['Esplanade'] },
  { kind: 'landmark', keys: ['国家博物馆', 'guo jia bo wu guan'], terms: ['National Museum of Singapore'] },
  { kind: 'landmark', keys: ['国家美术馆', 'guo jia mei shu guan'], terms: ['National Gallery Singapore'] },
  { kind: 'landmark', keys: ['nlb', '国家图书馆', 'guo jia tu shu guan', 'national library'], terms: ['National Library Building'] },
  { kind: 'landmark', keys: ['东海岸', '东海岸公园', 'dong hai an', 'dong hai an gong yuan', 'ecp'], terms: ['East Coast Park'] },
  { kind: 'landmark', keys: ['小印度', 'xiao yin du'], terms: ['Little India MRT Station', 'Tekka Centre'] },
  { kind: 'landmark', keys: ['竹脚中心', '竹脚巴刹', 'zhu jiao zhong xin', 'tekka'], terms: ['Tekka Centre'] },
  { kind: 'landmark', keys: ['甘榜格南', 'gan bang ge nan', 'kampong glam', 'kampung glam'], terms: ['198833', 'Bugis MRT Station'] },
  { kind: 'landmark', keys: ['武吉士', 'wu ji shi'], terms: ['Bugis MRT Station', 'Bugis Junction'] },
  { kind: 'landmark', keys: ['荷兰村', 'he lan cun', 'holland v', 'hv'], terms: ['Holland Village MRT Station', 'Holland Village'] },
  { kind: 'landmark', keys: ['克拉码头', 'ke la ma tou'], terms: ['Clarke Quay', 'Clarke Quay MRT Station'] },
  { kind: 'landmark', keys: ['驳船码头', 'bo chuan ma tou'], terms: ['Boat Quay'] },
  { kind: 'landmark', keys: ['老巴刹', 'lao ba sha'], terms: ['Lau Pa Sat'] },
  { kind: 'landmark', keys: ['麦士威', '麦士威熟食中心', 'mai shi wei'], terms: ['Maxwell Food Centre'] },
  { kind: 'landmark', keys: ['国家体育场', '体育城', 'guo jia ti yu chang', 'ti yu cheng', 'sports hub'], terms: ['National Stadium', '397629'] },
  { kind: 'landmark', keys: ['麦里芝', '麦里芝蓄水池', 'mai li zhi'], terms: ['MacRitchie Reservoir'] },
  { kind: 'landmark', keys: ['花芭山', 'hua ba shan', 'mount faber', 'mt faber'], terms: ['Mount Faber'] },
  { kind: 'landmark', keys: ['乌敏岛', 'wu min dao'], terms: ['Changi Point Ferry Terminal'] },

  // ---------------- Malls ----------------
  { kind: 'mall', keys: ['怡丰城', 'yi feng cheng', 'vivo'], terms: ['VivoCity'] },
  { kind: 'mall', keys: ['高岛屋', 'gao dao wu', 'taka', 'takashimaya'], terms: ['Ngee Ann City'] },
  { kind: 'mall', keys: ['义安城', 'yi an cheng'], terms: ['Ngee Ann City'] },
  { kind: 'mall', keys: ['新达城', 'xin da cheng'], terms: ['Suntec City'] },
  { kind: 'mall', keys: ['珍珠坊', 'zhen zhu fang', 'peoples park', "people's park"], terms: ["People's Park Complex", "People's Park Centre"] },
  { kind: 'mall', keys: ['nex'], terms: ['NEX'] },

  // ---------------- Temples, churches, mosques ----------------
  { kind: 'religious', keys: ['观音堂', '观音庙', '四马路观音堂', '四马路观音庙', '观音', 'guan yin', 'guanyin', 'guan yin tang', 'guan yin miao', 'guan yin temple', 'kwan im', 'kwan yin', 'kuan yin', 'kwan im temple', 'kuan yin temple', 'si ma lu'], terms: ['Kwan Im Thong Hood Cho Temple', 'Leong San See Temple'] },
  { kind: 'religious', keys: ['龙山寺', 'long shan si'], terms: ['Leong San See Temple'] },
  { kind: 'religious', keys: ['双林寺', 'shuang lin si'], terms: ['Lian Shan Shuang Lin Monastery'] },
  { kind: 'religious', keys: ['光明山', '光明山普觉禅寺', 'guang ming shan'], terms: ['Kong Meng San Phor Kark See Monastery'] },
  { kind: 'religious', keys: ['佛牙寺', '佛牙寺龙华院', 'fo ya si'], terms: ['Buddha Tooth Relic Temple'] },
  { kind: 'religious', keys: ['天福宫', 'tian fu gong'], terms: ['Thian Hock Keng'] },
  { kind: 'religious', keys: ['马里安曼兴都庙', '马里安曼'], terms: ['Sri Mariamman Temple'] },
  { kind: 'religious', keys: ['苏丹回教堂', 'su dan hui jiao tang'], terms: ['198833'], en: 'Sultan Mosque' },
  { kind: 'religious', keys: ['圣安德烈座堂', 'st andrews cathedral', "st andrew's cathedral"], terms: ["St Andrew's Cathedral"] },

  // ---------------- Government and services seniors use ----------------
  { kind: 'service', keys: ['cpf', '公积金', '公积金局', 'gong ji jin', 'cpf board'], terms: ['CPF Building', 'CPF Bishan Building', 'CPF Tampines Building', 'CPF Jurong Building', 'CPF Woodlands Building'] },
  { kind: 'service', keys: ['hdb', 'hdb hub', '建屋局', '建屋发展局', 'jian wu ju'], terms: ['HDB Hub'] },
  { kind: 'service', keys: ['ica', '移民局', '移民与关卡局', 'yi min ju'], terms: ['208718'], en: 'ICA Building' },
  { kind: 'service', keys: ['mom', '人力部', 'ren li bu'], terms: ['Ministry of Manpower'] },
  { kind: 'service', keys: ['ntuc', '职总', 'zhi zong'], terms: ['NTUC Centre', 'FairPrice'] },
  { kind: 'service', keys: ['fairprice', '平价超市', 'ping jia chao shi'], terms: ['FairPrice'], many: true },
  { kind: 'service', keys: ['邮政总局', 'singpost', 'singpost centre'], terms: ['SingPost Centre'] },
  { kind: 'service', keys: ['国家法院', 'state courts'], terms: ['State Courts'] },
  { kind: 'service', keys: ['最高法院', 'supreme court'], terms: ['Supreme Court'] },

  // ---------------- Universities ----------------
  { kind: 'school', keys: ['nus', '国大', '新加坡国立大学', 'guo da'], terms: ['National University of Singapore'] },
  { kind: 'school', keys: ['ntu', '南大', '南洋理工大学', 'nan da'], terms: ['Nanyang Technological University'] },
  { kind: 'school', keys: ['smu', '新加坡管理大学'], terms: ['Singapore Management University'] },
  { kind: 'school', keys: ['sutd', '新加坡科技设计大学'], terms: ['Singapore University of Technology and Design'] },
  { kind: 'school', keys: ['suss', '新跃社科大学'], terms: ['Singapore University of Social Sciences'] },
  // QA-70: "poly" after a polytechnic's name means the polytechnic, never a polyclinic.
  { kind: 'school', keys: ['ngee ann poly', 'ngee ann polytechnic', 'np', '义安理工学院', '义安理工'], terms: ['Ngee Ann Polytechnic'] },
  { kind: 'school', keys: ['temasek poly', 'temasek polytechnic', '淡马锡理工学院', '淡马锡理工'], terms: ['Temasek Polytechnic'] },
  { kind: 'school', keys: ['singapore poly', 'singapore polytechnic', 'sp', '新加坡理工学院'], terms: ['Singapore Polytechnic'] },
  { kind: 'school', keys: ['republic poly', 'republic polytechnic', 'rp', '共和理工学院', '共和理工'], terms: ['Republic Polytechnic'] },
  { kind: 'school', keys: ['nanyang poly', 'nanyang polytechnic', 'nyp', '南洋理工学院'], terms: ['Nanyang Polytechnic'] },
];

/**
 * Whole-word short forms expanded INSIDE longer queries ("blk 123 amk ave 3" → "blk 123 ang mo kio ave 3",
 * "cck poly" → "choa chu kang polyclinic"). Kept small on purpose: OneMap's own road abbreviations
 * (BT, JLN, LOR, AVE, ST, CTRL) must NOT be expanded.
 */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
  amk: 'ang mo kio',
  cck: 'choa chu kang',
  tpy: 'toa payoh',
  hbf: 'harbourfront',
  je: 'jurong east',
  jw: 'jurong west',
  poly: 'polyclinic', // except after a polytechnic's name (POLYTECHNIC_HEAD in alias.ts, QA-70)
  hosp: 'hospital',
  int: 'interchange',
};
