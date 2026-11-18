import katex from 'katex';
import { escapeHtml } from './html.js';

export function renderFormula(tex, displayMode = false) {
  if (!tex) return '';
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return escapeHtml(tex);
  }
}

/**
 * Render prose containing $$...$$ or $...$ LaTeX segments safely into HTML.
 */
export function renderRichText(text) {
  if (!text) return '';
  const str = String(text);
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let out = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(str.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      out += renderFormula(match[1].trim(), true);
    } else if (match[2] !== undefined) {
      out += renderFormula(match[2].trim(), false);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < str.length) {
    out += escapeHtml(str.slice(lastIndex));
  }
  return out;
}
