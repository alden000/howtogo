#!/usr/bin/env python3
"""
Regenerates ../stations.ts from downloaded source files (not run by tests).

Inputs (download into an empty folder, pass it as argv[1]):
  mrt.json         parsed rows of en.wikipedia "List of Singapore MRT stations"
                   (wikitext via the MediaWiki API; English + Chinese names and codes
                   come from LTA's System Map, as cited there)
  wpcoords.json    {page title: [lat, lng]} from the MediaWiki coordinates API
  exits.geojson    data.gov.sg "LTA MRT Station Exit (GEOJSON)"
                   d_b39d3a0871985372d7e1637193335da5 (Singapore Open Data Licence v1.0)
LRT Chinese names are typed in below from zh.wikipedia line articles (see stations.ts header).
Usage: python3 -I build_stations.py <dir> > ../stations.ts
"""
import json, math, sys

src = sys.argv[1]
rows = json.load(open(f'{src}/mrt.json'))
wp = json.load(open(f'{src}/wpcoords.json'))
exits = json.load(open(f'{src}/exits.geojson'))['features']

MRT_LINES = ('NS', 'EW', 'CG', 'NE', 'CC', 'DT', 'TE')

# Not open as of 2026-11-17. ISO date when announced, else a year or 'TBC'.
OPENS = {
    'TE30': '2026-12-26', 'TE31': '2026-12-26', 'DT36': '2026-12-26', 'DT37': '2026-12-26',
    'TE22A': '2028', 'TE10': 'TBC', 'TE21': 'TBC', 'CC18': 'TBC',
}

LRT = [  # code, English, Chinese (zh.wikipedia line articles, converted to simplified)
    ('BP2', 'South View', '南景'), ('BP3', 'Keat Hong', '吉丰'), ('BP4', 'Teck Whye', '德惠'),
    ('BP5', 'Phoenix', '凤凰'), ('BP7', 'Petir', '柏提'), ('BP8', 'Pending', '秉定'),
    ('BP9', 'Bangkit', '万吉'), ('BP10', 'Fajar', '法嘉'), ('BP11', 'Segar', '实加'),
    ('BP12', 'Jelapang', '泽拉邦'), ('BP13', 'Senja', '信佳'),
    ('SE1', 'Compassvale', '康埔桦'), ('SE2', 'Rumbia', '棕美'), ('SE3', 'Bakau', '码高'),
    ('SE4', 'Kangkar', '港脚'), ('SE5', 'Ranggung', '兰岗'),
    ('SW1', 'Cheng Lim', '振林'), ('SW2', 'Farmway', '农道'), ('SW3', 'Kupang', '古邦'),
    ('SW4', 'Thanggam', '丹甘'), ('SW5', 'Fernvale', '芬微'), ('SW6', 'Layar', '拉雅'),
    ('SW7', 'Tongkang', '同港'), ('SW8', 'Renjong', '仁宗'),
    ('PE1', 'Cove', '海湾'), ('PE2', 'Meridian', '丽园'), ('PE3', 'Coral Edge', '珊瑚'),
    ('PE4', 'Riviera', '里维拉'), ('PE5', 'Kadaloor', '卡达鲁'), ('PE6', 'Oasis', '绿洲'),
    ('PE7', 'Damai', '达迈'),
    ('PW1', 'Sam Kee', '三记'), ('PW2', 'Teck Lee', '德利'), ('PW3', 'Punggol Point', '榜鹅坊'),
    ('PW4', 'Samudera', '山姆'), ('PW5', 'Nibong', '尼蒙'), ('PW6', 'Sumang', '苏芒'),
    ('PW7', 'Soo Teck', '树德'),
]

# Lines served by LRT hub codes.
HUB_LINES = {'STC': ['SE', 'SW'], 'PTC': ['PE', 'PW']}

LANDMARKS = {  # (station en, exit) -> (en, zh, source)
    ('Novena', 'A'): ('Tan Tock Seng Hospital', '陈笃生医院', 'ttsh.com.sg "Visiting TTSH" (nearest: Novena Exit A)'),
    ('Outram Park', '7'): ('SGH Campus (Exit 6 path closed since Aug 2025)', '中央医院园区', 'sgh.com.sg visitor information (NEL: use Exit 7)'),
    ('Kent Ridge', 'A'): ('National University Hospital', '国立大学医院', 'NUH-linked directions (Exit A); Exit C for Kent Ridge Wing per landtransportguru'),
}

LOW = {  # code -> note
    'GUL_CIRCLE': 'coordinates: LTA exit centroid is ~690 m from the Wikipedia point',
}


def line_of(code):
    if code in HUB_LINES: return HUB_LINES[code]
    if code == 'CG': return ['CG']
    return [code[:2]]


def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


ex_by = {}
for f in exits:
    name = f['properties']['STATION_NA']
    base, kind = name.rsplit(' ', 2)[0], name.split(' ')[-2]
    code = f['properties']['EXIT_CODE'].replace('Exit', '').strip()
    lng, lat = f['geometry']['coordinates']
    ex_by.setdefault(base, {}).setdefault((kind, code), []).append((lat, lng))

stations = []
for r in rows:
    if r['status'] == 'Planned': continue
    codes = []
    for c in r['codes']:
        if c[:2] in MRT_LINES or c in ('STC', 'PTC') or c[:2] in ('BP',): codes.append(c)
    if not codes: continue
    stations.append({'en': r['en'], 'zh': r['zh'], 'codes': codes, 'page': r['page']})
for code, en, zh in LRT:
    stations.append({'en': en, 'zh': zh, 'codes': [code], 'page': None})

out = []
for s in stations:
    key = s['en'].upper()
    lines = []
    for c in s['codes']:
        for l in line_of(c):
            if l not in lines: lines.append(l)
    if s['codes'] == ['EW4', 'CG']: lines = ['EW', 'CG']
    groups = ex_by.get(key, {})
    kinds = {k for k, _ in groups}
    ex = []
    for (kind, code), pts in sorted(groups.items(), key=lambda kv: (kv[0][0], len(kv[0][1]), kv[0][1])):
        lat = sum(p[0] for p in pts) / len(pts); lng = sum(p[1] for p in pts) / len(pts)
        e = {'code': code, 'lat': round(lat, 5), 'lng': round(lng, 5)}
        if len(kinds) > 1: e['part'] = kind
        lm = LANDMARKS.get((s['en'], code))
        if lm: e['landmark'] = {'en-SG': lm[0], 'zh-CN': lm[1]}; e['landmarkSource'] = lm[2]
        ex.append(e)
    if groups:
        pts = [p for v in groups.values() for p in v]
        lat = sum(p[0] for p in pts) / len(pts); lng = sum(p[1] for p in pts) / len(pts)
        coord_src = 'lta-exits'
    else:
        lat, lng = wp[s['page']]
        coord_src = 'wikipedia'
    st = {'codes': s['codes'], 'en': s['en'], 'zh': s['zh'], 'lat': round(lat, 5), 'lng': round(lng, 5),
          'lines': lines, 'coordSource': coord_src}
    opens = [OPENS[c] for c in s['codes'] if c in OPENS]
    if opens: st['opens'] = opens[0]
    lowkey = s['en'].upper().replace(' ', '_')
    if lowkey in LOW: st['lowConfidence'] = LOW[lowkey]
    if s['page'] and s['page'] in wp and groups:
        dd = hav((lat, lng), wp[s['page']])
        if dd > 400 and 'lowConfidence' not in st: st['lowConfidence'] = f'coordinates differ by {round(dd)} m between sources'
    st['exits'] = ex
    out.append(st)





out.sort(key=lambda s: s['en'].lower())

def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))

import os
print(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'header.txt')).read().rstrip())
print("import type { Station } from './types';\n")
print('/** Every MRT/LRT station (open, opening soon, or built but unopened), A–Z by English name. */')
print('export const STATIONS: readonly Station[] = [')
for st in out:
    print('  ' + js(st) + ',')
print('];')
