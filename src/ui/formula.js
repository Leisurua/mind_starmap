import katex from 'katex';

export function renderFormula(tex, displayMode = false) {
  if (!tex) return '';
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}
