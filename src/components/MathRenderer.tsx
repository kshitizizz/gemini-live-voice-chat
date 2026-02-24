import { useMemo } from "react";
import katex from "katex";

interface MathRendererProps {
  content: string;
  displayMode?: boolean;
  className?: string;
}

/**
 * Renders LaTeX/KaTeX math expressions. Handles $...$ (inline) and $$...$$ (block).
 * Mixed text and math is supported.
 */
export function MathRenderer({ content, displayMode = true, className = "" }: MathRendererProps) {
  const html = useMemo(() => {
    if (!content.trim()) return "";

    try {
      const result: string[] = [];
      let i = 0;

      // Match $$...$$ (block) or $...$ (inline)
      const regex = /\$\$([\s\S]*?)\$\$|\$([^$]+)\$/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(content)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
          result.push(content.slice(lastIndex, match.index).replace(/\n/g, "<br/>"));
        }

        const isBlock = !!match[1];
        const math = (match[1] || match[2] || "").trim();

        try {
          result.push(
            katex.renderToString(math, {
              displayMode: isBlock,
              throwOnError: false,
              output: "html",
            })
          );
        } catch {
          result.push(math);
        }

        lastIndex = regex.lastIndex;
      }

      if (result.length === 0) {
        // No math delimiters - try rendering whole as LaTeX
        try {
          return katex.renderToString(content, {
            displayMode,
            throwOnError: false,
            output: "html",
            strict: false,
          });
        } catch {
          return content.replace(/\n/g, "<br/>");
        }
      }

      if (lastIndex < content.length) {
        result.push(content.slice(lastIndex).replace(/\n/g, "<br/>"));
      }

      return result.join("");
    } catch {
      return content.replace(/\n/g, "<br/>");
    }
  }, [content, displayMode]);

  if (!html) return null;

  return (
    <div
      className={`prose prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
