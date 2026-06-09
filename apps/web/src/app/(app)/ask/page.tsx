'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, ToolCallTrace } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAskQuery } from '@/lib/api/ai';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const SUGGESTED_QUESTIONS = [
  'Which interns are at risk this week?',
  "What's stalled right now?",
  'Who has the most overdue tasks?',
  'What does the lead funnel look like?',
  'Which leads from LinkedIn are stale?',
  'Show me the top 5 performers',
];

interface TurnEntry {
  user_message: string;
  assistant_message: string | null;
  tool_calls: ToolCallTrace[] | null;
  model: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number } | null;
  error: string | null;
}

export default function AskPage() {
  const me = useAuthStore((s) => s.user);
  const ask = useAskQuery();
  const [turns, setTurns] = useState<TurnEntry[]>([]);
  const [input, setInput] = useState('');
  const scrollAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  if (me?.role === 'intern') {
    return (
      <p className="text-sm text-muted-foreground">
        Conversational query is restricted to leaders and admins.
      </p>
    );
  }

  // Build the conversation we send to the API: every prior turn's user msg +
  // assistant answer, plus the new question on the bottom.
  function buildHistoryForRequest(nextUser: string): ChatMessage[] {
    const history: ChatMessage[] = [];
    for (const turn of turns) {
      history.push({ role: 'user', content: turn.user_message });
      if (turn.assistant_message) {
        history.push({ role: 'assistant', content: turn.assistant_message });
      }
    }
    history.push({ role: 'user', content: nextUser });
    return history;
  }

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const messages = buildHistoryForRequest(trimmed);

    // Optimistically render the user's message + a pending assistant slot.
    setTurns((prev) => [
      ...prev,
      {
        user_message: trimmed,
        assistant_message: null,
        tool_calls: null,
        model: null,
        usage: null,
        error: null,
      },
    ]);
    setInput('');

    try {
      const res = await ask.mutateAsync({ messages });
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last) {
          last.assistant_message = res.answer;
          last.tool_calls = res.tool_calls;
          last.model = res.model;
          last.usage = {
            input_tokens: res.usage.input_tokens,
            output_tokens: res.usage.output_tokens,
            cache_read_input_tokens: res.usage.cache_read_input_tokens,
          };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query failed';
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last) last.error = message;
        return next;
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ask.isPending) return;
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function reset() {
    setTurns([]);
    setInput('');
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-4">
      <PageHeader
        title="Ask DV-WMS"
        description="Conversational queries over your org's data. Powered by Claude."
        actions={
          turns.length > 0 && (
            <Button variant="outline" onClick={reset} disabled={ask.isPending}>
              New conversation
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4">
        {turns.length === 0 ? (
          <EmptyState onPick={(q) => send(q)} disabled={ask.isPending} />
        ) : (
          <div className="space-y-6">
            {turns.map((turn, idx) => (
              <TurnView key={idx} turn={turn} pending={ask.isPending && idx === turns.length - 1} />
            ))}
            <div ref={scrollAnchor} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything — 'Who is at risk?', 'What's stalled?', 'Which leads from LinkedIn are stale?'"
          rows={2}
          disabled={ask.isPending}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter to send · Shift+Enter for newline</span>
          <Button type="submit" disabled={ask.isPending || !input.trim()}>
            {ask.isPending ? 'Thinking…' : 'Send'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">
        Ask a question about your org — performance, leads, tasks, projects, teams.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Answers are scoped to what you can normally see in the app.
      </p>
      <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <Button
            key={q}
            variant="outline"
            size="sm"
            onClick={() => onPick(q)}
            disabled={disabled}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}

function TurnView({ turn, pending }: { turn: TurnEntry; pending: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
          {turn.user_message}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-2">
          {turn.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {turn.error}
            </div>
          ) : turn.assistant_message ? (
            <div className="rounded-md border bg-card px-3 py-2 text-sm">
              <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{turn.assistant_message}</ReactMarkdown>
              </article>
              {turn.tool_calls && turn.tool_calls.length > 0 && (
                <ToolCallsPanel calls={turn.tool_calls} />
              )}
              {turn.usage && (
                <div
                  className={cn(
                    'mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground',
                  )}
                >
                  <span>{turn.model}</span>
                  <span>in {turn.usage.input_tokens}</span>
                  <span>out {turn.usage.output_tokens}</span>
                  <span>cache hit {turn.usage.cache_read_input_tokens}</span>
                </div>
              )}
            </div>
          ) : pending ? (
            <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Thinking…
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolCallsPanel({ calls }: { calls: ToolCallTrace[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t pt-2 text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground"
      >
        {open ? '▾' : '▸'} Sources ({calls.length} tool call{calls.length === 1 ? '' : 's'})
      </button>
      {open && (
        <ul className="mt-1 space-y-1 pl-3 font-mono text-[11px]">
          {calls.map((c, i) => (
            <li key={i} className="text-muted-foreground">
              <Badge variant="muted" className="mr-1 text-[10px]">
                {c.name}
              </Badge>
              {c.result_summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
