"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  label?: string;
}

export function CodeBlock({ code, language = "bash", label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked in insecure contexts — fail silently.
    }
  }

  return (
    <div className="relative group">
      {label && <div className="text-xs font-mono text-muted-foreground mb-1">{label}</div>}
      <pre className="bg-muted rounded-lg p-4 pr-12 text-sm overflow-x-auto font-mono">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copié" : "Copier le code"}
        title={copied ? "Copié" : "Copier le code"}
        className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
