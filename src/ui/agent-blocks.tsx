/**
 * Live, typed rendering of an agent attempt's structured JSON blocks.
 *
 * `agents.sandbox.attempt-status?partial=1` returns the parsed `type:'json'`
 * attempt-log events as they accumulate. We flatten those events into an
 * ordered list of display blocks (assistant text, tool calls, tool results,
 * result summary) and render each one typed-out as it arrives — so the chat
 * responds block-by-block as the agent generates, instead of all-at-once.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import MarkdownBlocks from './markdown-blocks';

export interface AgentBlock {
  key: string;
  kind: 'text' | 'tool_use' | 'tool_result' | 'result';
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: string;
}

/** Pull the text out of a content-block array or string. */
function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b: any) => (typeof b === 'string' ? b : b?.text || '')).join('');
  return '';
}

/**
 * Flatten attempt-log events into ordered display blocks. Scope to events after
 * the last genuine user *prompt* (a user turn whose content is not a tool_result)
 * so replayed prior turns and the tool-result user turns don't duplicate output.
 */
export function flattenAgentBlocks(json: any[] | undefined): AgentBlock[] {
  if (!Array.isArray(json) || json.length === 0) return [];

  let start = 0;
  for (let i = json.length - 1; i >= 0; i--) {
    const e = json[i];
    if (e?.type === 'user' || e?.role === 'user') {
      const content = e.message?.content ?? e.content;
      const isToolResult = Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result');
      if (!isToolResult) {
        start = i + 1;
        break;
      }
    }
  }

  const blocks: AgentBlock[] = [];
  let k = 0;
  for (let i = start; i < json.length; i++) {
    const e = json[i];
    const type = e?.type || e?.role;

    if (type === 'assistant') {
      const content = e.message?.content ?? e.content;
      const arr = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
      for (const b of arr) {
        if ((b.type === 'text' || b.type === 'thinking') && (b.text || b.thinking)?.trim()) {
          blocks.push({ key: `b${k++}`, kind: 'text', text: b.text || b.thinking });
        } else if (b.type === 'tool_use') {
          blocks.push({ key: `b${k++}`, kind: 'tool_use', toolName: b.name, toolInput: b.input });
        }
      }
    } else if (type === 'user') {
      const arr = Array.isArray(e.message?.content ?? e.content) ? (e.message?.content ?? e.content) : [];
      for (const b of arr) {
        if (b?.type === 'tool_result') {
          blocks.push({ key: `b${k++}`, kind: 'tool_result', toolResult: contentToText(b.content) });
        }
      }
    } else if (type === 'result' && typeof e.result === 'string' && e.result.trim()) {
      blocks.push({ key: `b${k++}`, kind: 'result', text: e.result });
    }
  }

  // Drop consecutive duplicate text (Sandbox sometimes emits assistant text twice).
  return blocks.filter((b, i) => !(b.kind === 'text' && blocks[i - 1]?.kind === 'text' && blocks[i - 1]?.text === b.text));
}

/**
 * Reveal a (possibly still-growing) string progressively, like a typewriter.
 * The revealed length only ever advances, so re-renders with more text keep
 * typing from where they were instead of restarting.
 */
function TypedText({ text, speed = 18, done }: { text: string; speed?: number; done?: boolean }): ReactElement {
  const [shown, setShown] = useState(0);
  const targetRef = useRef(text);
  targetRef.current = text;

  useEffect(() => {
    if (done) {
      setShown(targetRef.current.length);
      return;
    }
    const id = setInterval(() => {
      setShown((n) => Math.min(targetRef.current.length, n + 3));
    }, speed);
    return () => clearInterval(id);
  }, [speed, done]);

  const visible = text.slice(0, done ? text.length : Math.min(shown, text.length));
  return <MarkdownBlocks text={visible} />;
}

function ToolCall({ name, input }: { name?: string; input: unknown }): ReactElement {
  return (
    <div className='agent-block agent-block-tool'>
      <div className='agent-block-label'>Tool · {name || 'unknown'}</div>
      {input !== undefined && input !== null && (
        <pre className='agent-block-pre'>{typeof input === 'string' ? input : JSON.stringify(input, null, 2)}</pre>
      )}
    </div>
  );
}

function ToolResult({ result }: { result?: string }): ReactElement {
  return (
    <details className='agent-block agent-block-result-box'>
      <summary className='agent-block-label'>Tool result</summary>
      <pre className='agent-block-pre'>{result || '(empty)'}</pre>
    </details>
  );
}

/** Render the ordered blocks; text/result blocks type out, tool blocks appear whole. */
export default function AgentBlocks({ json, streaming }: { json: any[] | undefined; streaming?: boolean }): ReactElement {
  const blocks = flattenAgentBlocks(json);
  return (
    <div className='agent-blocks'>
      {blocks.map((b, i) => {
        // Only the last block keeps typing while streaming; earlier ones are done.
        const isLast = i === blocks.length - 1;
        const done = !streaming || !isLast;
        if (b.kind === 'tool_use') return <ToolCall key={b.key} name={b.toolName} input={b.toolInput} />;
        if (b.kind === 'tool_result') return <ToolResult key={b.key} result={b.toolResult} />;
        return (
          <div key={b.key} className='agent-block agent-block-text'>
            <TypedText text={b.text || ''} done={done} />
          </div>
        );
      })}
    </div>
  );
}
