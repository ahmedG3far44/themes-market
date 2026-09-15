import { instructionHtml } from "../lib/instructions";

export function Instructions({ value, format }: { value: string; format?: "plain" | "html" }) {
  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: instructionHtml(value, format) }} />;
}
