// Typewriter.tsx — a live-typing text with a caret, click-to-skip, human jitter.

"use client";

import { useEffect, useRef, useState } from "react";

interface TypewriterProps {
  text: string;
  speed?: number; // base ms per character
  className?: string;
  caret?: boolean;
  onTick?: (charCount: number) => void;
  onDone?: () => void;
}

export function Typewriter({ text, speed = 16, className, caret = true, onTick, onDone }: TypewriterProps) {
  const [count, setCount] = useState(0);
  const [prevText, setPrevText] = useState(text);

  const tickRef = useRef(onTick);
  const doneCbRef = useRef(onDone);

  useEffect(() => {
    tickRef.current = onTick;
  }, [onTick]);
  useEffect(() => {
    doneCbRef.current = onDone;
  }, [onDone]);

  // Derive internal progress from the incoming text (React's blessed pattern).
  if (text !== prevText) {
    setPrevText(text);
    setCount(0);
  }

  useEffect(() => {
    if (!text) return;
    if (count >= text.length) return;
    const jitter = () => speed * (0.55 + Math.random());
    const t = setTimeout(() => setCount((c) => Math.min(text.length, c + 1)), jitter());
    return () => clearTimeout(t);
  }, [count, text, speed]);

  const done = count >= text.length;
  const n = Math.min(count, text.length);

  useEffect(() => {
    if (done) doneCbRef.current?.();
  }, [done]);

  useEffect(() => {
    if (!done && n % 3 === 0) onTick?.(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const isTyping = !done && text.length > 0;

  return (
    <button
      type="button"
      onClick={() => {
        setCount(text.length);
        tickRef.current?.(text.length);
      }}
      className={`cursor-text text-left ${className ?? ""}`}
      aria-label="Reveal the line instantly"
      onMouseDown={(e) => e.preventDefault()}
    >
      {text.slice(0, n)}
      {isTyping && caret && <span className="type-caret" aria-hidden />}
    </button>
  );
}