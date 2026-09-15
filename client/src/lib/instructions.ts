import DOMPurify from "dompurify";

export function instructionHtml(value: string, format?: "plain" | "html") {
  if (format !== "html") {
    const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return escaped.split(/\r?\n/).map((line) => `<p>${line || "<br>"}</p>`).join("");
  }
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "s", "del", "u", "ul", "ol", "li", "pre", "code", "blockquote", "hr", "a"],
    ALLOWED_ATTR: ["href", "title", "start"],
  });
}
