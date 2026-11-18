import { escapeHtml } from './html.js';

function formatInline(raw) {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

export function renderSimpleMarkdown(mdText) {
  if (!mdText) return '<p style="color:var(--text-muted)">暂无原文内容</p>';

  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let codeLines = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      if (!inCode) {
        inCode = true;
        codeLines = [];
      } else {
        out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    // Obsidian image embeds ![[...]]
    if (/^!\[\[.*\]\]$/.test(trimmed)) {
      closeList();
      out.push(`<div style="font-size:11.5px;color:#64748b;">[本地配图: ${escapeHtml(trimmed)}]</div>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      out.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      closeList();
      out.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      closeList();
      out.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('> ')) {
      closeList();
      out.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
    } else if (/^[-*+]\s+/.test(trimmed)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${formatInline(trimmed.replace(/^[-*+]\s+/, ''))}</li>`);
    } else {
      closeList();
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  closeList();
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return out.join('\n');
}
