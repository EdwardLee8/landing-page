// A deliberately small Markdown subset. Raw HTML is always displayed as text.
export function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function safeLink(value) {
  if (typeof value !== 'string') return '#';
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; }
}
function inline(text) {
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let html = '', end = 0;
  for (const m of text.matchAll(re)) {
    html += escapeHTML(text.slice(end, m.index));
    if (m[1]) html += `<code>${escapeHTML(m[1])}</code>`;
    else if (m[2]) html += `<a href="${escapeHTML(safeLink(m[3]))}" rel="noopener noreferrer">${escapeHTML(m[2])}</a>`;
    else html += `<strong>${escapeHTML(m[4])}</strong>`;
    end = m.index + m[0].length;
  }
  return html + escapeHTML(text.slice(end));
}
export function renderMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = []; let paragraph = [], list = [], code = null;
  const flush = () => { if (paragraph.length) { blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } if (list.length) { blocks.push(`<ul>${list.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`); list = []; } };
  for (const line of lines) {
    if (/^```/.test(line)) { if (code !== null) { blocks.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`); code = null; } else { flush(); code = []; } continue; }
    if (code !== null) { code.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) { flush(); const level = Math.min(heading[1].length + 1, 4); blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    if (/^>\s?/.test(line)) { flush(); blocks.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (/^[-*]\s+/.test(line)) { if (paragraph.length) flush(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (list.length) flush(); paragraph.push(line);
  }
  if (code !== null) blocks.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);
  flush(); return blocks.join('\n');
}
