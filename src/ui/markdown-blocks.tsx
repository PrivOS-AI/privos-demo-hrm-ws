/**
 * Minimal, dependency-free markdown block renderer for agent responses.
 *
 * Renders the FULL response text segmented into visual blocks — headings,
 * paragraphs, bullet/numbered lists and fenced code — using React elements
 * (never dangerouslySetInnerHTML, so no injection risk inside the iframe).
 * Inline: **bold**, *italic*, `code`. Good enough for chat output, not a spec
 * implementation.
 */
import type { ReactNode } from 'react';

/** Parse inline **bold**, *italic*, `code` into React nodes. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) nodes.push(<code key={key++} className="md-code-inline">{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function MarkdownBlocks({ text }: { text: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(<pre key={key++} className="md-code-block"><code>{code.join('\n')}</code></pre>);
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${Math.min(level + 2, 6)}`) as any; // demote so it fits the chat scale
      blocks.push(<Tag key={key++} className="md-heading">{renderInline(heading[2])}</Tag>);
      i++;
      continue;
    }

    // List (bullet or numbered) — consume consecutive list lines
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        items.push(<li key={items.length}>{renderInline(content)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key++} className="md-list">{items}</ol> : <ul key={key++} className="md-list">{items}</ul>);
      continue;
    }

    // Blank line → block separator
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — consume consecutive non-blank, non-special lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} className="md-paragraph">{renderInline(para.join('\n'))}</p>);
  }

  return <div className="md-blocks">{blocks}</div>;
}
