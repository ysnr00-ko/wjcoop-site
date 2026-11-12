# -*- coding: utf-8 -*-
"""원주협동사회경제네트워크 새 홈페이지 만들기

사용법:  python build.py
- content/ 폴더의 글(JSON)과 고정 페이지 내용으로 docs/ 폴더에 홈페이지 전체를 만든다.
- 처음 한 번은 --import 옵션으로 기존 홈페이지 백업(../backup)에서 글과 사진을 가져온다.
  python build.py --import
"""
import html, json, os, re, shutil, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
CONTENT = os.path.join(ROOT, "content")
OUT = os.path.join(ROOT, "docs")
BACKUP = os.path.join(ROOT, "..", "backup")
CUTOFF = "2023-11-11"          # 최근 3년 기준일 (2026-11-11 기준)
SITE_NAME = "원주협동사회경제네트워크"

# 옮기지 않는 글 (개인정보·민감한 공고)
EXCLUDE = {("network_news", 653), ("network_news", 611), ("network_news", 582)}

BOARDS = {
    "network_news": "네트워크 소식",
    "union_activity": "조합원 활동",
    "wonju_living": "원주에 사는 즐거움",
    "social_economy_news": "사회적경제 소식",
}

# ---------------------------------------------------------------- 가져오기
def import_backup():
    from PIL import Image
    os.makedirs(CONTENT, exist_ok=True)
    media = os.path.join(SRC, "media")
    os.makedirs(media, exist_ok=True)

    def conv_image(rel, dest_dir):
        src = os.path.join(BACKUP, rel)
        if not os.path.exists(src):
            return None
        os.makedirs(os.path.join(media, dest_dir), exist_ok=True)
        base = os.path.splitext(os.path.basename(rel))[0]
        base = re.sub(r"[^A-Za-z0-9_.-]+", "_", base)[-60:] or "img"
        try:
            im = Image.open(src)
            im.load()
        except Exception:
            return None
        has_alpha = im.mode in ("RGBA", "LA", "P") and ("transparency" in im.info or im.mode in ("RGBA", "LA"))
        if im.width > 1400:
            im = im.resize((1400, int(im.height * 1400 / im.width)), Image.LANCZOS)
        if has_alpha and im.width * im.height < 600 * 600:
            out = os.path.join(media, dest_dir, base + ".png")
            im.save(out, optimize=True)
        else:
            out = os.path.join(media, dest_dir, base + ".jpg")
            im.convert("RGB").save(out, quality=80, optimize=True, progressive=True)
        return os.path.relpath(out, SRC).replace("\\", "/"), im.width, im.height

    def copy_file(rel, dest_dir):
        src = os.path.join(BACKUP, rel)
        if not os.path.exists(src) or os.path.getsize(src) > 20 * 1024 * 1024:
            return None
        d = os.path.join(media, dest_dir)
        os.makedirs(d, exist_ok=True)
        out = os.path.join(d, os.path.basename(rel))
        shutil.copyfile(src, out)
        return {"name": os.path.basename(rel), "path": os.path.relpath(out, SRC).replace("\\", "/"),
                "size": os.path.getsize(out)}

    def take(board, keep):
        posts = json.load(open(os.path.join(BACKUP, f"posts_{board}.json"), encoding="utf-8"))
        res = []
        for p in posts:
            if (board, p["id"]) in EXCLUDE or not keep(p):
                continue
            imap = {}
            for im in p["images"]:
                r = conv_image(im["file"], f"{board}/{p['id']}")
                if r:
                    imap[im["url"]] = {"src": r[0], "w": r[1], "h": r[2]}
            files = [f for f in (copy_file(f, f"{board}/{p['id']}") for f in p["files"]) if f]
            res.append({"board": board, "id": p["id"], "category": p["category"], "title": p["title"],
                        "date": p["date"][:10], "content_html": p["content_html"], "images": imap, "files": files})
        json.dump(res, open(os.path.join(CONTENT, f"{board}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("imported", board, len(res))

    recent = lambda p: p["date"][:10] >= CUTOFF
    for b in BOARDS:
        take(b, recent)
    take("press_release", lambda p: True)
    take("union_goods", lambda p: True)
    take("reference", lambda p: recent(p) or p["id"] in (61,))

# ---------------------------------------------------------------- 본문 정리
ALLOWED = {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "img", "table", "thead", "tbody",
           "tr", "td", "th", "h2", "h3", "h4", "blockquote", "div", "figure", "figcaption", "hr"}
VOID = {"br", "img", "hr"}

class Cleaner(HTMLParser):
    def __init__(self, imap, base):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.imap, self.base = [], [], imap, base
        self.skip_a = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a":
            href = a.get("href") or ""
            if "view_image.php" in href or not href.startswith(("http", "mailto:", "tel:")):
                self.stack.append("a-skip"); return
            if "wjcoop.or.kr" in href:
                self.stack.append("a-skip"); return
            self.stack.append("a")
            self.out.append(f'<a href="{html.escape(href)}" rel="noopener" target="_blank">'); return
        if tag == "img":
            src = a.get("src", "")
            m = self.imap.get(src)
            if m:
                self.out.append(f'<img src="{self.base}{m["src"]}" width="{m["w"]}" height="{m["h"]}" alt="" loading="lazy">')
            elif src.startswith("http") and "wjcoop.or.kr" not in src:
                self.out.append(f'<img src="{html.escape(src)}" alt="" loading="lazy">')
            return
        if tag in ("td", "th"):
            span = "".join(f' {k}="{html.escape(a[k])}"' for k in ("colspan", "rowspan") if a.get(k))
            self.out.append(f"<{tag}{span}>"); self.stack.append(tag); return
        if tag in ALLOWED:
            if tag in VOID:
                self.out.append(f"<{tag}>")
            else:
                self.out.append(f"<{tag}>"); self.stack.append(tag)
        # 그 밖의 태그(span, font 등)는 껍데기만 버린다

    def handle_endtag(self, tag):
        if tag == "a":
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i] in ("a", "a-skip"):
                    t = self.stack.pop(i)
                    if t == "a":
                        self.out.append("</a>")
                    return
            return
        if tag in ALLOWED and tag not in VOID:
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i] == tag:
                    # 닫히지 않은 안쪽 태그도 닫는다
                    while len(self.stack) > i:
                        t = self.stack.pop()
                        if t != "a-skip":
                            self.out.append(f"</{'a' if t == 'a' else t}>")
                    return

    def handle_data(self, data):
        self.out.append(html.escape(data))

def clean_html(raw, imap, base):
    raw = re.sub(r"\[이 게시물은 .*?(이동|복사) 됨\]", "", raw)
    c = Cleaner(imap, base)
    c.feed(raw); c.close()
    s = "".join(c.out)
    while c.stack:
        t = c.stack.pop()
        if t != "a-skip":
            s += f"</{t}>"
    s = re.sub(r"(<br>\s*){3,}", "<br><br>", s)
    for _ in range(3):
        s = re.sub(r"<(p|div|strong|b|em|u)>(\s|&nbsp;|\xa0|<br>)*</\1>", "", s)
    # 개인 휴대폰 번호 가리기 (사무실 033 번호는 그대로)
    s = MOBILE.sub("[연락처 생략]", s)
    return s.strip()

MOBILE = re.compile(r"01[016789][-. )]?\s?[0-9]{3,4}[-. ]?\s?[0-9]{4}")

def used_images(raw, imap):
    return {u for u in imap if u in raw}

# ---------------------------------------------------------------- 틀
NAV = [("about.html", "네트워크 소개"), ("members.html", "조합원"), ("work.html", "하는 일"),
       ("news/index.html", "소식"), ("tour.html", "협동조합 탐방"), ("resources.html", "자료실"),
       ("contact.html", "문의")]

def esc(s):
    return html.escape(s or "", quote=True)

def fmt_date(d):
    y, m, dd = d.split("-")
    return f"{int(y)}. {int(m)}. {int(dd)}."

def page(title, body, base="", current="", desc=None, extra_class=""):
    nav = "".join(
        f'<a href="{base}{href}"{" aria-current=\"page\"" if current == href else ""}>{label}</a>' for href, label in NAV)
    t = f"{title} | {SITE_NAME}" if title else SITE_NAME
    d = desc or "원주의 협동조합, 사회적기업, 자활기업이 모여 지역의 문제를 협동의 방식으로 함께 풀어 갑니다."
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f4f1e8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="{esc(d)}">
  <title>{esc(t)}</title>
  <link rel="icon" href="{base}assets/img/logo-mark.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="{base}assets/style.css">
  <link rel="stylesheet" href="{base}assets/pages.css">
</head>
<body class="{extra_class}">
  <a class="skip-link" href="#main">본문으로 건너뛰기</a>
  <div class="draft-strip" role="note">시안입니다 — 문구와 숫자는 확인 후 고칩니다</div>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="{base}index.html" aria-label="{SITE_NAME} 홈">
        <img src="{base}assets/img/logo-mark.png" width="54" height="54" alt="">
        <span class="brand-name">사회적협동조합<br>{SITE_NAME}</span>
      </a>
      <nav class="main-nav" aria-label="주요 메뉴">{nav}</nav>
    </div>
  </header>
  <main id="main">
{body}
  </main>
  <footer class="site-footer">
    <div class="page-wrap footer-inner">
      <div>
        <p>사회적협동조합 {SITE_NAME}</p>
        <p class="footer-meta">(26342) 강원특별자치도 원주시 우산초교길 10, 강원사회적경제혁신타운 2층<br>
        대표전화 <a href="tel:0337341844">033-734-1844</a> · 팩스 033-744-1844 · <a href="mailto:wjcoop@hanmail.net">wjcoop@hanmail.net</a><br>
        사업자등록번호 224-82-15745</p>
      </div>
      <a href="#top">맨 위로 ↑</a>
    </div>
  </footer>
</body>
</html>
"""

def page_head(index, title, lede="", base=""):
    lede_html = f'<p class="page-lede">{lede}</p>' if lede else ""
    return f"""    <section class="page-head" id="top">
      <div class="page-wrap">
        <p class="section-index">{index}</p>
        <h1>{title}</h1>
        {lede_html}
      </div>
    </section>"""

def write(rel, s):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(s)

# ---------------------------------------------------------------- 만들기
def load(board):
    p = os.path.join(CONTENT, f"{board}.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []

def post_page(p, label, list_href, prev_p, next_p, base="../"):
    used = used_images(p["content_html"], p["images"])
    extra = [m for u, m in p["images"].items() if u not in used]
    gallery = "".join(f'<img src="{base}{m["src"]}" width="{m["w"]}" height="{m["h"]}" alt="" loading="lazy">' for m in extra)
    body = clean_html(p["content_html"], p["images"], base)
    files = ""
    if p["files"]:
        items = "".join(f'<li><a href="{base}{esc(f["path"])}" download>{esc(f["name"])}</a> <small>{round(f["size"]/1024/1024, 1)}MB</small></li>' for f in p["files"])
        files = f'<section class="attach"><h2>첨부파일</h2><ul>{items}</ul></section>'
    nav = '<nav class="post-nav" aria-label="이전·다음 글">'
    if next_p:
        nav += f'<a class="newer" href="{next_p["slug"]}"><span>다음 글</span>{esc(next_p["title"])}</a>'
    if prev_p:
        nav += f'<a class="older" href="{prev_p["slug"]}"><span>이전 글</span>{esc(prev_p["title"])}</a>'
    nav += "</nav>"
    cat = f'<span class="post-cat">{esc(p["category"])}</span>' if p.get("category") else ""
    return f"""    <article class="post page-wrap">
      <header class="post-head" id="top">
        <p class="section-index"><a href="{list_href}">{label}</a></p>
        <h1>{esc(p["title"])}</h1>
        <p class="post-meta">{cat}<time datetime="{p["date"]}">{fmt_date(p["date"])}</time></p>
      </header>
      <div class="post-body">
        {f'<div class="post-gallery">{gallery}</div>' if gallery else ''}
        {body}
      </div>
      {files}
      {nav}
      <p class="back-link"><a href="{list_href}">← 목록으로</a></p>
    </article>"""

def build_news():
    allp = []
    for b, label in BOARDS.items():
        for p in load(b):
            p["label"] = label
            p["slug"] = f"{b}-{p['id']}.html"
            allp.append(p)
    allp.sort(key=lambda p: (p["date"], p["id"]), reverse=True)
    for i, p in enumerate(allp):
        prev_p = allp[i + 1] if i + 1 < len(allp) else None
        next_p = allp[i - 1] if i > 0 else None
        write(f"news/{p['slug']}", page(p["title"], post_page(p, p["label"], "index.html", prev_p, next_p),
                                         base="../", current="news/index.html"))
    # 목록: 분류별 탭(앵커) + 연도별
    def listing(items):
        out, year = [], None
        for p in items:
            y = p["date"][:4]
            if y != year:
                if year: out.append("</ul>")
                out.append(f'<h2 class="year">{y}</h2><ul class="post-list">'); year = y
            out.append(f'<li><time datetime="{p["date"]}">{fmt_date(p["date"])}</time>'
                       f'<span class="tag">{esc(p["label"])}</span><a href="{p["slug"]}">{esc(p["title"])}</a></li>')
        if year: out.append("</ul>")
        return "".join(out)
    filters = '<a href="index.html" aria-current="page">전체</a>' + "".join(
        f'<a href="{b}.html">{label}</a>' for b, label in BOARDS.items()) + '<a href="../press/index.html">언론보도</a>'
    def news_index(items, cur_href, title):
        f = filters.replace(' aria-current="page"', "").replace(f'href="{cur_href}"', f'href="{cur_href}" aria-current="page"')
        body = page_head("NEWS", title, "네트워크와 조합원의 소식, 지역 사회적경제 이야기입니다. 2023년 11월 이후 글을 옮겼습니다.") + \
            f'<section class="page-section"><div class="page-wrap"><nav class="filter" aria-label="분류">{f}</nav>{listing(items)}</div></section>'
        return page(title, body, base="../", current="news/index.html")
    write("news/index.html", news_index(allp, "index.html", "소식"))
    for b, label in BOARDS.items():
        write(f"news/{b}.html", news_index([p for p in allp if p["board"] == b], f"{b}.html", label))
    return allp

def build_press():
    ps = load("press_release")
    for p in ps:
        p["slug"] = f"{p['id']}.html"
        m = re.match(r"\s*\[([^\]]+)\]\s*(.*)", p["title"])
        p["media"], p["short"] = (m.group(1), m.group(2)) if m and not re.match(r"\d{4}/", m.group(1)) else ("", p["title"])
    ps.sort(key=lambda p: (p["date"], p["id"]), reverse=True)
    for i, p in enumerate(ps):
        write(f"press/{p['slug']}", page(p["title"], post_page(p, "언론보도", "index.html",
              ps[i + 1] if i + 1 < len(ps) else None, ps[i - 1] if i > 0 else None), base="../", current="news/index.html"))
    out, year = [], None
    for p in ps:
        y = p["date"][:4]
        if y != year:
            if year: out.append("</ul>")
            out.append(f'<h2 class="year">{y}</h2><ul class="post-list press">'); year = y
        media = f'<span class="tag">{esc(p["media"])}</span>' if p["media"] else '<span class="tag"></span>'
        out.append(f'<li><time datetime="{p["date"]}">{fmt_date(p["date"])}</time>{media}<a href="{p["slug"]}">{esc(p["short"])}</a></li>')
    out.append("</ul>")
    filters = '<a href="../news/index.html">전체</a>' + "".join(f'<a href="../news/{b}.html">{l}</a>' for b, l in BOARDS.items()) + \
              '<a href="index.html" aria-current="page">언론보도</a>'
    body = page_head("IN THE PRESS", "언론보도", "언론에 실린 원주 협동운동과 조합원 이야기입니다.") + \
        f'<section class="page-section"><div class="page-wrap"><nav class="filter" aria-label="분류">{filters}</nav>{"".join(out)}</div></section>'
    write("press/index.html", page("언론보도", body, base="../", current="news/index.html"))
    return ps

def news_li(p, href):
    return f'<li><time datetime="{p["date"]}">{fmt_date(p["date"])}</time><a href="{href}">{esc(p["title"])}</a></li>'

def build_index(allp, ps):
    tpl = open(os.path.join(SRC, "index.template.html"), encoding="utf-8").read()
    nn = [p for p in allp if p["board"] == "network_news"][:5]
    tpl = tpl.replace("{{NEWS}}", "".join(news_li(p, f"news/{p['slug']}") for p in nn))
    press = "".join(f'<li><span>{esc(p["media"])}</span><a href="press/{p["slug"]}">{esc(p["short"])}</a>'
                    f'<time datetime="{p["date"]}">{fmt_date(p["date"])}</time></li>' for p in ps[:4])
    tpl = tpl.replace("{{PRESS}}", press)
    write("index.html", page("", tpl, base="", current=""))

def build_static():
    for name in os.listdir(os.path.join(SRC, "pages")):
        meta, body = open(os.path.join(SRC, "pages", name), encoding="utf-8").read().split("\n---\n", 1)
        m = dict(l.split(": ", 1) for l in meta.strip().splitlines())
        write(name, page(m["title"], body, base="", current=name))

def build_resources():
    rs = load("reference")
    rs.sort(key=lambda p: (p["date"], p["id"]), reverse=True)
    items = []
    for p in rs:
        files = "".join(f'<li><a href="{esc(f["path"])}" download>{esc(f["name"])}</a> <small>{round(f["size"]/1024/1024, 1)}MB</small></li>' for f in p["files"])
        items.append(f'<li class="res"><time datetime="{p["date"]}">{fmt_date(p["date"])}</time><div><h3>{esc(p["title"])}</h3><ul class="files">{files}</ul></div></li>')
    body = page_head("ARCHIVE", "자료실", "조합원 가입·탐방 신청 양식과 기부금 공개 자료입니다.") + \
        f'<section class="page-section"><div class="page-wrap"><ul class="res-list">{"".join(items)}</ul>' \
        '<p class="note">이전 홈페이지의 자료(2020~2023년 연구·교육 자료, 기록물)는 사무국에 보관하고 있습니다. 필요하시면 문의해 주세요.</p></div></section>'
    write("resources.html", page("자료실", body, current="resources.html"))

def build_goods():
    gs = load("union_goods")
    seen, cards = set(), []
    gs.sort(key=lambda p: (p["date"], p["id"]), reverse=True)
    for p in gs:
        name = re.sub(r"\s+", "", p["title"])
        if name in seen:
            continue
        seen.add(name)
        imgs = [m for m in p["images"].values() if not is_blank(m["src"])]
        img = f'<img src="{imgs[0]["src"]}" width="{imgs[0]["w"]}" height="{imgs[0]["h"]}" alt="{esc(p["title"])} 상품 안내" loading="lazy">' if imgs else ""
        cards.append(f'<li><a href="{imgs[0]["src"]}" target="_blank">{img}<span>{esc(p["title"])}</span></a></li>' if imgs
                     else f'<li class="noimg"><div class="goods-name">{esc(p["title"])}</div><span>상품 소개 준비 중</span></li>')
    return "".join(cards)

def is_blank(src):
    """한 가지 색으로만 된 자리 채움 이미지인지 확인"""
    try:
        from PIL import Image
        lo, hi = Image.open(os.path.join(SRC, src)).convert("L").getextrema()
        return hi - lo < 8
    except Exception:
        return False

def main():
    if "--import" in sys.argv:
        import_backup()
    # 예전에 만든 HTML은 지우고(폴더는 남김), 자산은 덮어쓴다 — 윈도에서 폴더가 잠겨도 실패하지 않게
    if os.path.exists(OUT):
        for dp, _, fs in os.walk(OUT):
            for f in fs:
                if f.endswith(".html"):
                    try:
                        os.remove(os.path.join(dp, f))
                    except OSError:
                        pass
    shutil.copytree(os.path.join(SRC, "assets"), os.path.join(OUT, "assets"), dirs_exist_ok=True)
    if os.path.exists(os.path.join(SRC, "media")):
        shutil.copytree(os.path.join(SRC, "media"), os.path.join(OUT, "media"), dirs_exist_ok=True)
    allp = build_news()
    ps = build_press()
    build_index(allp, ps)
    # 조합원 상품 카드를 members 페이지에 끼워 넣기
    mp = os.path.join(SRC, "pages", "members.html")
    if os.path.exists(mp):
        s = open(mp, encoding="utf-8").read()
        if "{{GOODS}}" in s:
            tmp = s.replace("{{GOODS}}", build_goods())
            meta, body = tmp.split("\n---\n", 1)
            m = dict(l.split(": ", 1) for l in meta.strip().splitlines())
            build_static()
            write("members.html", page(m["title"], body, current="members.html"))
        else:
            build_static()
    else:
        build_static()
    build_resources()
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    with open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nDisallow: /\n")
    print("built:", sum(len(f) for _, _, f in os.walk(OUT)), "files")

if __name__ == "__main__":
    main()
