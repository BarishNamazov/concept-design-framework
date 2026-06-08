"use client";

import { Bold, Code, Italic, Link2, List, Quote } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { MentionAutocomplete } from "@/components/forum/mention-autocomplete";
import { Spinner } from "@/components/forum/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ComposerProps {
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  minRows?: number;
  autoFocus?: boolean;
  session?: string;
  onSubmit: (content: string) => Promise<void> | void;
  onCancel?: () => void;
}

type Wrap = { before: string; after?: string; block?: boolean };

const TOOLS: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  wrap: Wrap;
}[] = [
  { icon: Bold, label: "Bold", wrap: { before: "**", after: "**" } },
  { icon: Italic, label: "Italic", wrap: { before: "_", after: "_" } },
  { icon: Link2, label: "Link", wrap: { before: "[", after: "](url)" } },
  { icon: Code, label: "Code", wrap: { before: "`", after: "`" } },
  { icon: Quote, label: "Quote", wrap: { before: "> ", block: true } },
  { icon: List, label: "List", wrap: { before: "- ", block: true } },
];

/**
 * A markdown composer with a light formatting toolbar. Content stays raw
 * markdown — the backend's Formatting concept renders and sanitizes it. Submits
 * on Ctrl/Cmd+Enter.
 */
export function Composer({
  initialValue = "",
  placeholder = "Share your thoughts… Markdown supported.",
  submitLabel = "Post",
  minRows = 6,
  autoFocus,
  session,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const mentionStartRef = useRef<number>(-1);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  /** Scan text before cursor for an active @mention and show the autocomplete. */
  const detectMention = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match && match.index !== undefined && match[1].length >= 1) {
      mentionStartRef.current = match.index + match[0].indexOf("@");
      setMentionQuery(match[1]);
    } else {
      mentionStartRef.current = -1;
      setMentionQuery(null);
    }
  }, []);

  function handleSelectMention(username: string) {
    const el = ref.current;
    if (!el || mentionStartRef.current === -1) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, mentionStartRef.current);
    const after = el.value.slice(pos);
    const next = `${before}@${username} ${after}`;
    setValue(next);
    mentionStartRef.current = -1;
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + username.length + 2;
      el.setSelectionRange(caret, caret);
    });
  }

  function handleCloseMention() {
    mentionStartRef.current = -1;
    setMentionQuery(null);
    ref.current?.focus();
  }

  function applyWrap(wrap: Wrap) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const before = wrap.before;
    const after = wrap.after ?? "";
    const insert = `${before}${selected}${after}`;
    const next = value.slice(0, start) + insert + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + before.length + selected.length;
      el.setSelectionRange(caret, caret);
    });
  }

  async function submit() {
    if (!value.trim() || busy) return;
    setMentionQuery(null);
    setBusy(true);
    try {
      await onSubmit(value.trim());
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        {TOOLS.map((tool) => (
          <Button
            key={tool.label}
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={tool.label}
            title={tool.label}
            onClick={() => applyWrap(tool.wrap)}
          >
            <tool.icon className="size-4" />
          </Button>
        ))}
        <span className="ml-auto pr-1 text-xs text-muted-foreground">
          Markdown · ⌘↵ to post
        </span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          requestAnimationFrame(detectMention);
        }}
        onKeyUp={detectMention}
        onSelect={detectMention}
        onClick={detectMention}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (mentionQuery && (e.key === "Enter" || e.key === "Tab")) {
            return;
          }
        }}
        placeholder={placeholder}
        className={cn(
          "resize-y rounded-none border-0 bg-transparent font-mono text-sm leading-6 shadow-none focus-visible:ring-0",
        )}
        style={{ minHeight: `${minRows * 1.5}rem` }}
      />
      {mentionQuery && session ? (
        <div className="relative">
          <MentionAutocomplete
            query={mentionQuery}
            session={session}
            onSelect={handleSelectMention}
            onClose={handleCloseMention}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !value.trim()}
        >
          {busy ? <Spinner className="size-4" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
