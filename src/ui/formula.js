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
