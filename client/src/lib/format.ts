export function money(minor: number, currency = "USD") { try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100); } catch { return `${currency} ${(minor / 100).toFixed(2)}`; } }
export function dateTime(value?: string) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
