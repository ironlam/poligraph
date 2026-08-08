import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  children: string;
  className?: string;
  /** When true, markdown links render as plain text (use inside <a>/<Link> to avoid nested <a> hydration errors) */
  disableLinks?: boolean;
}

type SafeLink =
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string }
  | { kind: "rejected" };

type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "link"; destination: string; children: InlineNode[] };

type BlockNode =
  | { type: "paragraph"; lines: InlineNode[][] }
  | { type: "heading"; children: InlineNode[] }
  | { type: "separator" }
  | { type: "list"; items: ListItemNode[] };

interface ListItemNode {
  children: InlineNode[];
  nested?: BlockNode & { type: "list" };
}

const LINK_CLASS = "text-primary underline decoration-primary/40 hover:decoration-primary";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Far above normal editorial use while keeping parsing and rendering resource-bounded. */
export const MAX_LIST_NESTING_DEPTH = 16;

/** Classify a destination before it can become a link. */
export function classifyMarkdownUrl(destination: string): SafeLink {
  if (!destination || destination !== destination.trim() || CONTROL_CHARACTERS.test(destination)) {
    return { kind: "rejected" };
  }

  if (destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\")) {
    try {
      const parsed = new URL(destination, "https://poligraph.invalid");
      if (parsed.origin === "https://poligraph.invalid") {
        return { kind: "internal", href: destination };
      }
    } catch {
      return { kind: "rejected" };
    }
  }

  try {
    const parsed = new URL(destination);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "external", href: destination };
    }
  } catch {
    // Invalid destinations remain text.
  }

  return { kind: "rejected" };
}

/**
 * Structural renderer for Poligraph's intentionally small Markdown subset.
 * Input remains text until React creates the corresponding elements.
 */
export function MarkdownText({ children, className, disableLinks = false }: MarkdownTextProps) {
  const blocks = parseBlocks(children);

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      {blocks.map((block, index) => renderBlock(block, disableLinks, `block-${index}`))}
    </div>
  );
}

function parseBlocks(text: string): BlockNode[] {
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (/^[-*_]{3,}$/.test(paragraph)) return { type: "separator" };

      const lines = paragraph.split("\n");
      const nonEmptyLines = lines.filter((line) => line.trim());
      if (nonEmptyLines.length > 0 && nonEmptyLines.every(isBulletLine)) {
        return parseList(nonEmptyLines, 1);
      }

      if (lines.length === 1 && /^\*\*[^*]+\*\*\s*$/.test(paragraph)) {
        return { type: "heading", children: parseInline(paragraph) };
      }

      return {
        type: "paragraph",
        lines: lines.map((line) => parseInline(line.trim())),
      };
    });
}

function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("•") ||
    trimmed.startsWith("- ") ||
    trimmed.startsWith("* ") ||
    trimmed === "-" ||
    trimmed === "*"
  );
}

function stripBullet(line: string): string {
  const trimmed = line.trim();
  const first = trimmed[0];
  if (first !== "•" && first !== "-" && first !== "*") return trimmed;
  return trimmed.slice(1).trimStart();
}

function indentLevel(line: string): number {
  let spaces = 0;
  while (line[spaces] === " ") spaces++;
  return Math.floor(spaces / 2);
}

function parseList(lines: string[], depth: number): BlockNode & { type: "list" } {
  if (depth >= MAX_LIST_NESTING_DEPTH) {
    return {
      type: "list",
      items: lines.map((line) => ({ children: parseInline(stripBullet(line)) })),
    };
  }

  const items: ListItemNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const nestedLines: string[] = [];
    let next = index + 1;
    while (next < lines.length && indentLevel(lines[next]!) > 0) {
      nestedLines.push(lines[next]!.slice(Math.min(2, lines[next]!.length)));
      next++;
    }

    items.push({
      children: parseInline(stripBullet(line)),
      nested: nestedLines.length > 0 ? parseList(nestedLines, depth + 1) : undefined,
    });
    index = next;
  }

  return { type: "list", items };
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plainText = "";
  let index = 0;

  const flushText = () => {
    if (plainText) nodes.push({ type: "text", value: plainText });
    plainText = "";
  };

  while (index < text.length) {
    const link = readLink(text, index);
    if (link) {
      flushText();
      nodes.push({
        type: "link",
        destination: link.destination,
        children: parseInline(link.label),
      });
      index = link.end;
      continue;
    }

    const strongDelimiter = text.startsWith("**", index)
      ? "**"
      : text.startsWith("__", index)
        ? "__"
        : null;
    if (strongDelimiter) {
      const end = text.indexOf(strongDelimiter, index + 2);
      if (end > index + 2) {
        flushText();
        nodes.push({
          type: "strong",
          children: parseInline(text.slice(index + 2, end)),
        });
        index = end + 2;
        continue;
      }
    }

    const emphasisDelimiter = text[index] === "*" || text[index] === "_" ? text[index]! : null;
    if (emphasisDelimiter) {
      const end = text.indexOf(emphasisDelimiter, index + 1);
      if (end > index + 1) {
        flushText();
        nodes.push({
          type: "emphasis",
          children: parseInline(text.slice(index + 1, end)),
        });
        index = end + 1;
        continue;
      }
    }

    plainText += text[index];
    index++;
  }

  flushText();
  return nodes;
}

function readLink(text: string, start: number) {
  if (text[start] !== "[") return null;
  const labelEnd = text.indexOf("](", start + 1);
  if (labelEnd < 0) return null;
  const destinationEnd = text.indexOf(")", labelEnd + 2);
  if (destinationEnd < 0) return null;

  return {
    label: text.slice(start + 1, labelEnd),
    destination: text.slice(labelEnd + 2, destinationEnd),
    end: destinationEnd + 1,
  };
}

function renderBlock(block: BlockNode, disableLinks: boolean, key: string): ReactNode {
  if (block.type === "separator") return <hr key={key} className="my-4 border-border" />;
  if (block.type === "heading") {
    return (
      <h4 key={key} className="font-semibold mt-4 mb-1">
        {renderInline(block.children, disableLinks, key)}
      </h4>
    );
  }
  if (block.type === "list") {
    return (
      <ul key={key} className="list-disc pl-4 space-y-1">
        {block.items.map((item, index) => (
          <li key={`${key}-item-${index}`}>
            {renderInline(item.children, disableLinks, `${key}-item-${index}`)}
            {item.nested && renderBlock(item.nested, disableLinks, `${key}-nested-${index}`)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p key={key}>
      {block.lines.map((line, index) => (
        <Fragment key={`${key}-line-${index}`}>
          {index > 0 && <br />}
          {renderInline(line, disableLinks, `${key}-line-${index}`)}
        </Fragment>
      ))}
    </p>
  );
}

function renderInline(nodes: InlineNode[], disableLinks: boolean, keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-inline-${index}`;
    if (node.type === "text") return <Fragment key={key}>{node.value}</Fragment>;
    if (node.type === "strong") {
      return <strong key={key}>{renderInline(node.children, disableLinks, key)}</strong>;
    }
    if (node.type === "emphasis") {
      return <em key={key}>{renderInline(node.children, disableLinks, key)}</em>;
    }

    const children = renderInline(node.children, disableLinks, key);
    if (disableLinks) return <Fragment key={key}>{children}</Fragment>;

    const link = classifyMarkdownUrl(node.destination);
    if (link.kind === "rejected") return <Fragment key={key}>{children}</Fragment>;
    if (link.kind === "internal") {
      return (
        <a key={key} href={link.href} className={LINK_CLASS}>
          {children}
        </a>
      );
    }
    return (
      <a
        key={key}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {children}
      </a>
    );
  });
}
