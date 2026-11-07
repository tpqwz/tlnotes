function entity(name: string) {
  return String.fromCharCode(38) + name + ";";
}

function esc(value: string) {
  return value.replaceAll("&", entity("amp")).replaceAll("<", entity("lt")).replaceAll(">", entity("gt")).replaceAll('"', entity("quot"));
}

function inline(source: string) {
  let text = esc(source);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return text;
}

function blocks(source: string): string {
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
      if (name && /^(note|warning|tip|caution|important)$/.test(name)) {
        html.push(`<aside class="myst-${name}"><p class="myst-label">${esc(name)}</p>${blocks(body.join("\n"))}</aside>`);
      } else {
        html.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length + 2;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? "")) {
        items.push(inline((lines[i] ?? "").replace(/^\s*([-*]|\d+\.)\s+/, "")));
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]?.trim() && !/^(```|:::|#{1,3}\s|>\s|[-*] |\d+\. )/.test(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return html.join("");
}

/** A small MyST reader for update cards. Notes stay plain text. */
export function mystHtml(source: string) {
  return blocks(source);
}
