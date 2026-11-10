from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "API.md"
TARGET = ROOT / "public" / "api-docs.html"


def inline(value: str) -> str:
    tokens: list[str] = []

    def keep_code(match: re.Match[str]) -> str:
        tokens.append(f"<code>{html.escape(match.group(1))}</code>")
        return f"\x00{len(tokens) - 1}\x00"

    value = re.sub(r"`([^`]+)`", keep_code, value)
    value = html.escape(value)
    value = re.sub(r"\[([^]]+)]\(([^)]+)\)", r'<a href="\2">\1</a>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)
    for index, token in enumerate(tokens):
        value = value.replace(f"\x00{index}\x00", token)
    return value


def slugify(value: str) -> str:
    value = re.sub(r"[`*_{}]/?", " ", value.lower())
    value = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", value).strip("-")
    return value or "section"


def convert(markdown: str) -> tuple[str, list[tuple[str, str]]]:
    lines = markdown.splitlines()
    output: list[str] = []
    navigation: list[tuple[str, str]] = []
    ids: set[str] = set()
    index = 0
    endpoint_open = False

    def close_endpoint() -> None:
        nonlocal endpoint_open
        if endpoint_open:
            output.append("</section>")
            endpoint_open = False

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("```"):
            close_endpoint()
            language = stripped[3:].strip()
            code: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            output.append(f'<div class="code-block"><button class="copy-code" type="button">复制</button><pre><code class="language-{html.escape(language)}">{html.escape(chr(10).join(code))}</code></pre></div>')
            continue
        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            close_endpoint()
            level = len(heading.group(1))
            text = heading.group(2)
            anchor = slugify(text)
            suffix = 2
            original = anchor
            while anchor in ids:
                anchor = f"{original}-{suffix}"
                suffix += 1
            ids.add(anchor)
            if level == 2:
                navigation.append((anchor, re.sub(r"\*\*", "", text)))
            if level == 4:
                method, _, route = text.partition(" ")
                output.append(f'<section class="endpoint" data-search="{html.escape(text.lower(), quote=True)}">')
                output.append(f'<h4 id="{anchor}"><span class="method method-{method.lower()}">{html.escape(method)}</span><a href="#{anchor}" class="route">{inline(route)}</a></h4>')
                endpoint_open = True
            else:
                output.append(f'<h{level} id="{anchor}">{inline(text)}<a class="anchor" href="#{anchor}" aria-label="链接到此节">#</a></h{level}>')
            index += 1
            continue
        if stripped.startswith("|"):
            table_lines: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            rows = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
            output.append('<div class="table-wrap"><table>')
            if rows:
                output.append("<thead><tr>" + "".join(f"<th>{inline(cell)}</th>" for cell in rows[0]) + "</tr></thead>")
                body_rows = rows[2:] if len(rows) > 1 and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in rows[1]) else rows[1:]
                output.append("<tbody>")
                for row in body_rows:
                    output.append("<tr>" + "".join(f"<td>{inline(cell)}</td>" for cell in row) + "</tr>")
                output.append("</tbody>")
            output.append("</table></div>")
            continue
        if stripped.startswith(">"):
            close_endpoint()
            quote: list[str] = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote.append(lines[index].strip().lstrip(">").strip())
                index += 1
            output.append(f'<aside class="callout">{inline(" ".join(part for part in quote if part))}</aside>')
            continue
        list_match = re.match(r"^([-+]|\d+\.)\s+(.+)$", stripped)
        if list_match:
            tag = "ol" if list_match.group(1)[0].isdigit() else "ul"
            items: list[str] = []
            while index < len(lines):
                item = re.match(r"^([-+]|\d+\.)\s+(.+)$", lines[index].strip())
                if not item:
                    break
                items.append(f"<li>{inline(item.group(2))}</li>")
                index += 1
            output.append(f"<{tag}>" + "".join(items) + f"</{tag}>")
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate or candidate.startswith(("#", "```", ">", "|")) or re.match(r"^([-+]|\d+\.)\s+", candidate):
                break
            paragraph.append(candidate)
            index += 1
        output.append(f"<p>{inline(' '.join(paragraph))}</p>")
    close_endpoint()
    return "\n".join(output), navigation


TEMPLATE = r'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#173f35">
  <meta name="description" content="音昱 Wellness 完整 API 对接文档，覆盖 76 个接口、权限、字段、业务规则与示例。">
  <meta name="generator" content="docs/build_api_docs.py">
  <link id="api-favicon" rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Crect width='36' height='36' rx='18' fill='%23173f35'/%3E%3Cpath d='M28 6C15 7 8 13 8 23c7 1 15-2 20-17ZM8 29c3-8 8-12 16-17' fill='none' stroke='%23e9efe7' stroke-width='1.5'/%3E%3C/svg%3E">
  <title>API 对接文档 · 音昱 Wellness</title>
  <style>
    :root{--pine-950:#102e27;--pine-900:#173f35;--pine-700:#2f6b5b;--sage-500:#7b9c88;--sage-300:#bdd0c0;--sage-100:#e9efe7;--paper:#f6f7f2;--white:#fff;--ink:#1d2925;--muted:#5c6b63;--line:#dfe4dc;--amber:#83562d;--red:#a64843;--display:"Noto Serif SC","Songti SC",serif;--body:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-family:var(--body);color:var(--ink);background:var(--paper);font-synthesis:none}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:96px;scrollbar-gutter:stable}body{margin:0;min-width:320px}button,input,select{font:inherit}button,a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}button,select{cursor:pointer}a{color:inherit;text-decoration:none}h1,h2,h3,h4,p{margin-top:0}button,input,select{outline:none}:focus-visible{outline:3px solid #bf793c!important;outline-offset:3px}::selection{background:var(--sage-300);color:var(--pine-950)}[hidden]{display:none!important}.skip-link{position:fixed;top:8px;left:8px;z-index:100;padding:12px 16px;background:var(--pine-900);color:#fff;transform:translateY(-150%)}.skip-link:focus{transform:translateY(0)}
    .topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:80px;padding:12px clamp(20px,4vw,64px);border-bottom:1px solid var(--line);background:rgba(246,247,242,.96);backdrop-filter:blur(18px)}.brand{display:inline-flex;align-items:center;gap:12px;min-height:44px}.brand-symbol{display:grid;place-items:center;flex:0 0 auto;width:42px;height:42px;border-radius:50%;background:var(--pine-900);color:var(--sage-100);overflow:hidden}.brand-symbol svg{width:26px;height:26px}.brand-symbol img{width:100%;height:100%;object-fit:contain}.brand-copy{display:flex;flex-direction:column}.brand-copy strong{color:var(--pine-900);font-family:var(--display);font-size:19px;font-weight:600}.brand-copy small{margin-top:2px;color:var(--muted);font-size:9px;letter-spacing:.16em}.top-actions{display:flex;align-items:center;gap:8px}.action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 14px;border:1px solid var(--line);border-radius:4px;background:transparent;color:var(--pine-900);font-size:12px;transition:background .2s,border-color .2s}.action:hover{background:var(--sage-100);border-color:var(--sage-500)}.action-primary{background:var(--pine-900);color:#fff;border-color:var(--pine-900)}
    .docs-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:clamp(36px,5vw,76px);width:min(1500px,100%);margin:0 auto;padding:0 clamp(20px,4vw,64px)}.sidebar{align-self:start;position:sticky;top:80px;max-height:calc(100dvh - 80px);padding:34px 0;overflow-y:auto}.search-label{display:grid;gap:8px;margin-bottom:20px;color:var(--pine-900);font-size:12px;font-weight:600}.search-input{width:100%;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:4px;background:#fff;color:var(--ink);font-size:13px}.search-hint{color:var(--muted);font-size:10px;font-weight:400}.search-results{min-height:20px;margin:-8px 0 14px;color:var(--muted);font-size:11px}.toc-title{margin:0 0 12px;color:var(--sage-500);font-size:10px;letter-spacing:.18em}.toc-list{display:grid;gap:2px;margin:0;padding:0;list-style:none}.toc-list a{display:flex;align-items:center;min-height:38px;padding:7px 10px;border-left:2px solid transparent;color:var(--muted);font-size:12px;line-height:1.5}.toc-list a:hover,.toc-list a.active{border-left-color:var(--pine-700);background:var(--sage-100);color:var(--pine-900)}.sidebar-bottom{display:grid;gap:4px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}.sidebar-bottom a{display:inline-flex;align-items:center;min-height:38px;color:var(--pine-700);font-size:12px;text-decoration:underline;text-underline-offset:4px}.section-jump{display:none}
    .docs-main{min-width:0;max-width:1040px;padding:56px 0 80px}.docs-main>h1{margin-bottom:22px;color:var(--pine-950);font-family:var(--display);font-size:clamp(38px,5vw,62px);font-weight:500;line-height:1.25;letter-spacing:-.035em}.docs-main>h1 .anchor{display:none}.docs-main>h2{margin:68px 0 24px;padding:18px 0 14px;border-top:2px solid var(--pine-900);border-bottom:1px solid var(--line);color:var(--pine-950);font-family:var(--display);font-size:clamp(26px,3vw,35px);font-weight:600;scroll-margin-top:96px}.docs-main>h3{margin:42px 0 17px;color:var(--pine-900);font-family:var(--display);font-size:21px;font-weight:600}.anchor{margin-left:10px;color:var(--sage-500);font-family:var(--body);font-size:14px;opacity:0}h2:hover .anchor,h3:hover .anchor{opacity:1}p,li{font-size:14px;line-height:1.9}p{margin-bottom:16px}ul,ol{display:grid;gap:7px;margin:12px 0 20px;padding-left:24px}li::marker{color:var(--pine-700)}strong{color:var(--pine-900)}p>a,li>a,.callout a{color:var(--pine-700);text-decoration:underline;text-underline-offset:3px}code{padding:2px 5px;border-radius:3px;background:var(--sage-100);color:var(--pine-900);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;overflow-wrap:anywhere}.callout{margin:22px 0;padding:17px 19px;border-left:3px solid var(--pine-700);border-radius:0 4px 4px 0;background:var(--sage-100);font-size:13px;line-height:1.9}
    .endpoint{margin:18px 0;padding:22px 24px;border:1px solid var(--line);border-radius:6px;background:#fff;scroll-margin-top:96px}.endpoint h4{display:flex;align-items:flex-start;gap:12px;margin:0 0 17px;padding-bottom:16px;border-bottom:1px solid #edf0ea;font-size:15px;line-height:1.65}.endpoint h4 .route{min-width:0;color:var(--pine-950);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:600;overflow-wrap:anywhere}.endpoint h4 .route:hover{color:var(--pine-700)}.method{flex:0 0 auto;min-width:58px;padding:3px 7px;border-radius:3px;background:var(--pine-900);color:#fff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;text-align:center;letter-spacing:.04em}.method-get{background:#316757}.method-post{background:#315f78}.method-patch{background:#87642f}.method-put{background:#6a5686}.method-delete{background:#984d47}.endpoint>:last-child{margin-bottom:0}
    .table-wrap{width:100%;margin:16px 0 22px;overflow-x:auto;border:1px solid var(--line);border-radius:4px}table{width:100%;border-collapse:collapse;background:#fff;font-size:12px;line-height:1.7}th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:var(--sage-100);color:var(--pine-900);font-weight:600;white-space:nowrap}tr:last-child td{border-bottom:0}td code{white-space:normal}.code-block{position:relative;margin:18px 0 24px;border-radius:5px;background:#122d27;color:#e6ede8}.code-block pre{margin:0;padding:22px;overflow-x:auto;font-size:12px;line-height:1.8}.code-block code{padding:0;background:transparent;color:inherit;overflow-wrap:normal}.copy-code{position:absolute;top:8px;right:8px;min-width:48px;min-height:34px;border:1px solid #55736a;border-radius:3px;background:#1c4037;color:#e6ede8;font-size:11px}.copy-code:hover{background:#2f6b5b}.search-empty{margin:24px 0;padding:30px;border:1px dashed var(--sage-500);border-radius:5px;color:var(--muted);text-align:center}.docs-footer{display:flex;justify-content:space-between;gap:20px;margin-top:50px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.8}.docs-footer a{color:var(--pine-700);text-decoration:underline}
    @media(max-width:1050px){.docs-layout{grid-template-columns:215px minmax(0,1fr);gap:28px}.top-actions .action:first-child{display:none}}
    @media(max-width:760px){html{scroll-padding-top:82px}.topbar{min-height:68px;padding:10px 16px;gap:8px}.brand-symbol{width:36px;height:36px}.brand-copy strong{font-size:16px}.brand-copy small{display:none}.top-actions{gap:5px}.action{padding:8px 10px}.top-actions .action-primary{display:none}.docs-layout{display:block;padding:0 16px}.sidebar{display:block;position:static;max-height:none;padding:20px 0 0;overflow:visible}.sidebar nav,.sidebar .toc-title,.sidebar .sidebar-bottom,.sidebar .search-hint{display:none}.search-label{margin-bottom:0}.search-results{margin:8px 0 0}.section-jump{display:grid;gap:7px;margin:12px 0 0;color:var(--pine-900);font-size:12px}.section-jump select{width:100%;min-height:46px;padding:9px 11px;border:1px solid var(--line);border-radius:4px;background:#fff;color:var(--ink)}.docs-main{padding:28px 0 50px}.docs-main>h1{font-size:37px}.docs-main>h2{margin-top:48px;font-size:27px;scroll-margin-top:80px}.endpoint{padding:18px 16px;scroll-margin-top:80px}.endpoint h4{flex-direction:column;gap:8px}.method{min-width:54px}th,td{padding:9px 8px;min-width:82px}.docs-footer{display:block}.docs-footer span{display:block;margin-top:7px}}
    @media(max-width:380px){.brand-copy strong{font-size:14px}.brand{gap:8px}.docs-main>h1{font-size:32px}.top-actions .action{padding:8px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
    @media print{html{scroll-padding-top:0;scrollbar-gutter:auto}.topbar,.sidebar,.section-jump,.copy-code,.skip-link{display:none!important}.docs-layout{display:block;width:100%;padding:0}.docs-main{max-width:none;padding:0}.docs-main>h1{font-size:32px}.docs-main>h2{break-after:avoid}.endpoint{break-inside:avoid;border-color:#bbb}.table-wrap,.code-block{overflow:visible}.code-block{background:#f3f3f3;color:#111}.code-block code{color:#111}.docs-main{print-color-adjust:exact}body{background:#fff}}
  </style>
</head>
<body>
  <a class="skip-link" href="#api-content">跳到 API 文档正文</a>
  <header class="topbar">
    <a class="brand" href="/" aria-label="音昱 Wellness 首页"><span class="brand-symbol" id="brand-symbol"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4C10 4.8 5 9 5 16c5 .8 11-1 15-12Z"/><path d="M5 21c2-6 6-9 12-13"/></svg></span><span class="brand-copy"><strong id="venue-name">音昱 Wellness</strong><small>DEVELOPER DOCUMENTATION · API v1.0.0</small></span></a>
    <div class="top-actions"><a class="action" href="/help.html">操作指南</a><a class="action" href="/docs" target="_blank" rel="noreferrer">Swagger 调试</a><a class="action action-primary" href="/redoc" target="_blank" rel="noreferrer">ReDoc</a></div>
  </header>
  <div class="docs-layout">
    <aside class="sidebar" aria-label="API 文档目录">
      <label class="search-label"><span>搜索接口、字段或业务规则</span><input class="search-input" id="api-search" type="search" placeholder="例如：签到、退款、bookings" autocomplete="off"><span class="search-hint">按 / 快速搜索，Esc 清空</span></label>
      <p class="search-results" id="search-results" aria-live="polite"></p>
      <p class="toc-title">API REFERENCE · 76 ENDPOINTS</p>
      <nav><ul class="toc-list">__NAVIGATION__</ul></nav>
      <div class="sidebar-bottom"><a href="/openapi.json" target="_blank" rel="noreferrer">下载 OpenAPI JSON ↗</a><a href="https://github.com/dqf514/WellnessBooking/blob/main/docs/API.md" target="_blank" rel="noreferrer">GitHub Markdown 源文档 ↗</a><a href="/help.html">← 返回系统操作指南</a></div>
    </aside>
    <main class="docs-main" id="api-content">
      <label class="section-jump"><span>跳转到文档章节</span><select id="mobile-jump">__MOBILE_NAVIGATION__</select></label>
      <div class="search-empty" id="search-empty" hidden>没有匹配的接口。可尝试“预约”“卡”“settings”或清空搜索。</div>
      __CONTENT__
      <footer class="docs-footer"><span>音昱 Wellness · API v1.0.0 · 76 个业务接口</span><span><a href="/help.html">系统操作指南</a> · <a href="/openapi.json">OpenAPI 3</a> · 文档源：<a href="https://github.com/dqf514/WellnessBooking/blob/main/docs/API.md">docs/API.md</a></span></footer>
    </main>
  </div>
  <script>
    (() => {
      const input = document.getElementById("api-search");
      const endpoints = Array.from(document.querySelectorAll(".endpoint"));
      const result = document.getElementById("search-results");
      const empty = document.getElementById("search-empty");
      function filterEndpoints() {
        const query = input.value.trim().toLocaleLowerCase();
        let visible = 0;
        endpoints.forEach((endpoint) => {
          const match = !query || endpoint.textContent.toLocaleLowerCase().includes(query);
          endpoint.hidden = !match;
          if (match) visible += 1;
        });
        result.textContent = query ? `找到 ${visible} / ${endpoints.length} 个接口；通用说明保持不变` : "";
        empty.hidden = visible !== 0;
      }
      input.addEventListener("input", filterEndpoints);
      document.addEventListener("keydown", (event) => {
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "");
        if (event.key === "/" && !typing) { event.preventDefault(); input.focus(); }
        if (event.key === "Escape" && document.activeElement === input) { input.value = ""; filterEndpoints(); input.blur(); }
      });
      document.querySelectorAll(".copy-code").forEach((button) => button.addEventListener("click", async () => {
        const text = button.parentElement.querySelector("code").textContent;
        try { await navigator.clipboard.writeText(text); button.textContent = "已复制"; }
        catch { button.textContent = "请手动复制"; }
        window.setTimeout(() => { button.textContent = "复制"; }, 1800);
      }));
      document.getElementById("mobile-jump").addEventListener("change", (event) => {
        document.getElementById(event.target.value)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
      const headings = Array.from(document.querySelectorAll(".docs-main > h2"));
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          document.querySelectorAll(".toc-list a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
        }), { rootMargin: "-12% 0px -75% 0px" });
        headings.forEach((heading) => observer.observe(heading));
      }
      fetch("/api/public/bootstrap").then((response) => response.ok ? response.json() : null).then((data) => {
        if (!data?.venue) return;
        document.getElementById("venue-name").textContent = data.venue.name;
        if (data.venue.logo_url) {
          const image = document.createElement("img"); image.src = data.venue.logo_url; image.alt = "";
          document.getElementById("brand-symbol").replaceChildren(image);
        }
        if (data.venue.favicon_url) {
          const favicon = document.getElementById("api-favicon"); favicon.type = "image/png"; favicon.href = data.venue.favicon_url;
        }
      }).catch(() => {});
    })();
  </script>
</body>
</html>
'''


def main() -> None:
    content, navigation = convert(SOURCE.read_text(encoding="utf-8"))
    links = "\n".join(f'<li><a href="#{anchor}">{html.escape(text)}</a></li>' for anchor, text in navigation)
    options = "\n".join(f'<option value="{anchor}">{html.escape(text)}</option>' for anchor, text in navigation)
    page = TEMPLATE.replace("__NAVIGATION__", links).replace("__MOBILE_NAVIGATION__", options).replace("__CONTENT__", content)
    TARGET.write_text(page, encoding="utf-8")
    print(f"Generated {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)} ({len(navigation)} chapters)")


if __name__ == "__main__":
    main()
