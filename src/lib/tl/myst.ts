export type PageRef = { rel: string; target: string };

function entity(name: string) {
  return String.fromCharCode(38) + name + ";";
}

function esc(value: string) {
  return value
    .replaceAll("&", entity("amp"))
    .replaceAll("<", entity("lt"))
    .replaceAll(">", entity("gt"))
    .replaceAll('"', entity("quot"));
}

const LT = entity("lt");
const GT = entity("gt");

function refMark(label: string, target: string, linked: boolean) {
  if (!linked) return `<span class="myst-ref">${label}</span>`;
  return `<a href="#${encodeURIComponent(target)}" data-wiki="${target}" class="myst-ref">${label}</a>`;
}

function inline(source: string, refs: PageRef[], linked: boolean) {
  let text = esc(source);
  text = text.replace(/\[\[([^\]\n]+)\]\]/g, (_, label: string) => {
    const target = label.trim();
    refs.push({ rel: "link", target });
    return refMark(target, target, linked);
  });
  text = text.replace(/\{([a-z][\w-]*)\}`([^`]+)`/g, (_, role: string, body: string) => {
    const [name, extra] = body.split(LT);
    const target = (extra ? extra.replace(new RegExp(`${GT}$`), "") : name).trim();
    if (role === "doc" || role === "ref") refs.push({ rel: role, target });
    const shown = name.trim();
    if (role === "doc" || role === "ref") return refMark(shown, target, linked);
    return extra ? `<abbr title="${target}">${shown}</abbr>` : `<span class="myst-${role}">${shown}</span>`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    if (/^https?:\/\//i.test(href)) return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
    refs.push({ rel: "link", target: href });
    return refMark(label, href, linked);
  });
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return text;
}

function directive(name: string, body: string, refs: PageRef[], linked: boolean) {
  const kind = /^(note|warning|tip|caution|important|admonition)$/.test(name) ? name : "note";
  return `<aside class="myst-${kind}"><p class="myst-label">${esc(kind)}</p>${blocks(body, refs, linked)}</aside>`;
}

function blocks(source: string, refs: PageRef[], linked: boolean): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = /^(```|:::)\{?\s*([a-z][\w-]*)?\}?\s*$/.exec(line.trim());
    if (fence) {
      const close = fence[1] === ":::" ? ":::" : "```";
      const name = fence[2] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]?.trim() !== close) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      html.push(name ? directive(name, body.join("\n"), refs, linked) : `<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? "")) {
        const cells = (lines[i] ?? "")
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      const [head, ...body] = rows;
      if (head) {
        const cells = (row: string[], tag: "th" | "td") =>
          row.map((cell) => `<${tag}>${inline(cell, refs, linked)}</${tag}>`).join("");
        html.push(
          `<table><thead><tr>${cells(head, "th")}</tr></thead><tbody>${body.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`,
        );
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level + 2}>${inline(heading[2], refs, linked)}</h${level + 2}>`);
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${inline(quote.join(" "), refs, linked)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? "")) {
        items.push(inline((lines[i] ?? "").replace(/^\s*([-*]|\d+\.)\s+/, ""), refs, linked));
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]?.trim() && !/^(```|:::|#{1,3}\s|>\s|[-*] |\d+\. |\s*\|)/.test(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    html.push(`<p>${inline(para.join(" "), refs, linked)}</p>`);
  }
  return html.join("");
}

export function mystRefs(source: string) {
  const refs: PageRef[] = [];
  blocks(source, refs, false);
  return refs;
}

export function mystHtml(source: string, linked = false) {
  return blocks(source, [], linked);
}
