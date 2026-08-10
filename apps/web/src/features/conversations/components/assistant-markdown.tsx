import React, { type ReactNode } from "react";

type InlineToken = {
  kind: "code" | "link" | "strong" | "emphasis" | "strike" | "text";
  value: string;
  href?: string;
};

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, "https://devstride.local");
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return trimmed;
  } catch {
    return null;
  }
  return null;
}

function inlineTokens(value: string): InlineToken[] {
  const pattern = /(`+[^`\n]+`+|\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
  const tokens: InlineToken[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ kind: "text", value: value.slice(cursor, start) });
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push({ kind: "code", value: token.replace(/^`+|`+$/g, "") });
    } else if (token.startsWith("[") && token.includes("](")) {
      const separator = token.indexOf("](");
      const label = token.slice(1, separator);
      const href = safeHref(token.slice(separator + 2, -1));
      tokens.push(href ? { kind: "link", value: label, href } : { kind: "text", value: token });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      tokens.push({ kind: "strong", value: token.slice(2, -2) });
    } else if (token.startsWith("~~")) {
      tokens.push({ kind: "strike", value: token.slice(2, -2) });
    } else {
      tokens.push({ kind: "emphasis", value: token.slice(1, -1) });
    }
    cursor = start + token.length;
  }
  if (cursor < value.length) tokens.push({ kind: "text", value: value.slice(cursor) });
  return tokens;
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  return inlineTokens(value).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.kind === "code") return <code className="inline-code" key={key}>{token.value}</code>;
    if (token.kind === "link") return <a href={token.href} key={key} target="_blank" rel="noreferrer">{token.value}</a>;
    if (token.kind === "strong") return <strong key={key}>{token.value}</strong>;
    if (token.kind === "strike") return <del key={key}>{token.value}</del>;
    if (token.kind === "emphasis") return <em key={key}>{token.value}</em>;
    return <React.Fragment key={key}>{token.value}</React.Fragment>;
  });
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isBlockStart(line: string): boolean {
  return /^\s*(#{1,6}\s|```|>|[-*+]\s|\d+[.)]\s|---\s*$)/.test(line);
}

function renderBlocks(lines: string[], keyPrefix: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      const language = fence[1];
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre className="code-block" key={`${keyPrefix}-code-${index}`}>
          <code className={language ? `language-${language}` : undefined}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const Heading = `h${heading[1].length}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Heading key={`${keyPrefix}-heading-${index}`}>{renderInline(heading[2], `${keyPrefix}-heading-${index}`)}</Heading>);
      index += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`${keyPrefix}-quote-${index}`}>{renderBlocks(quoteLines, `${keyPrefix}-quote-${index}`)}</blockquote>);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const items: string[] = [];
      const orderedList = Boolean(ordered);
      while (index < lines.length) {
        const item = lines[index].match(orderedList ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={`${keyPrefix}-list-${index}`}>{items.map((item, itemIndex) => <li key={`${keyPrefix}-item-${itemIndex}`}>{renderInline(item, `${keyPrefix}-item-${itemIndex}`)}</li>)}</List>);
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={`${keyPrefix}-table-${index}`}>
          <table className="markdown-table">
            <thead><tr>{headers.map((cell, cellIndex) => <th key={`${keyPrefix}-th-${cellIndex}`}>{renderInline(cell, `${keyPrefix}-th-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={`${keyPrefix}-tr-${rowIndex}`}>{headers.map((_, cellIndex) => <td key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}>{renderInline(row[cellIndex] ?? "", `${keyPrefix}-td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      blocks.push(<hr key={`${keyPrefix}-rule-${index}`} />);
      index += 1;
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`${keyPrefix}-paragraph-${index}`}>{paragraph.map((part, partIndex) => <React.Fragment key={`${keyPrefix}-line-${partIndex}`}>{partIndex > 0 && <br />}{renderInline(part, `${keyPrefix}-line-${partIndex}`)}</React.Fragment>)}</p>);
  }
  return blocks;
}

export function AssistantMarkdown({ content }: { content: string }) {
  return <div className="markdown-content">{renderBlocks(content.replaceAll("\r\n", "\n").split("\n"), "markdown")}</div>;
}
