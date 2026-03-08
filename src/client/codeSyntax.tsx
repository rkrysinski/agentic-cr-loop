import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

const FILE_EXTENSION_TO_LANGUAGE = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".json", "json"],
  [".css", "css"],
  [".html", "markup"],
  [".htm", "markup"],
  [".xml", "markup"],
  [".svg", "markup"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".java", "java"],
  [".py", "python"],
  [".sh", "bash"],
  [".yml", "yaml"],
  [".yaml", "yaml"]
]);

type DiffSyntaxLineProps = {
  filePath: string;
  lineText: string;
};

export function DiffSyntaxLine({ filePath, lineText }: DiffSyntaxLineProps) {
  if (lineText.length === 0) {
    return " ";
  }

  const language = resolveSyntaxLanguage(filePath);
  if (!language) {
    return lineText;
  }

  return (
    <SyntaxHighlighter
      language={language}
      useInlineStyles={false}
      wrapLongLines
      PreTag="div"
      className="diff-syntax"
      codeTagProps={{ className: "diff-syntax-code" }}
    >
      {lineText}
    </SyntaxHighlighter>
  );
}

export function resolveSyntaxLanguage(filePath: string): string | null {
  const normalizedPath = filePath.trim().toLowerCase();

  if (normalizedPath.length === 0) {
    return null;
  }

  const lastDotIndex = normalizedPath.lastIndexOf(".");
  if (lastDotIndex < 0) {
    return null;
  }

  return FILE_EXTENSION_TO_LANGUAGE.get(normalizedPath.slice(lastDotIndex)) ?? null;
}
