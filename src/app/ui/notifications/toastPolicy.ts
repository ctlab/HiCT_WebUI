/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { toast } from "vue-sonner";

type Kind = "success" | "info" | "warning" | "error";
type Action = { label: string; onClick: () => void };

const DURATION: Record<Kind, number> = { success: 4000, info: 6000, warning: 10000, error: Infinity };
const recent = new Map<string, { id: string | number; count: number; at: number }>();

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `hict-${h >>> 0}`;
}

export function notify(
  kind: Kind,
  title: string,
  description?: string,
  action?: Action,
  secondary?: Action,
  diagnosticsRecorded = false
): void {
  const key = `${kind}|${title}|${description ?? ""}`;
  const now = Date.now();
  for (const [cachedKey, item] of recent) {
    if (now - item.at >= 5000) recent.delete(cachedKey);
  }
  const previous = recent.get(key);
  const count = previous && now - previous.at < 5000 ? previous.count + 1 : 1;
  const id = previous && count > 1 ? previous.id : hash(key + now);
  recent.set(key, { id, count, at: now });
  const fn = kind === "success" ? toast.success : kind === "info" ? toast.info : kind === "warning" ? toast.warning : toast.error;
  const options = {
    diagnosticsRecorded,
    id,
    description,
    duration: DURATION[kind],
    action,
    cancel: secondary,
    class: `hict-toast-${kind}`,
  };
  fn(count > 1 ? `${title}  ×${count}` : title, options);
}

const JAVA_TEXT = /java\.|javax\.|Exception|Cannot invoke|Cannot read field|ClassCast|IndexOutOfBounds|For input string|ru\.itmo|io\.vertx/;

/** Map an HTTP failure from RequestManager to plain words (mockup 06, "Status → message"). */
export function describeHttpFailure(status: number | undefined, serverError: string | undefined, actionLabel: string): { title: string; description: string } {
  if (status === undefined || status === 0) {
    return { title: `Couldn’t ${actionLabel}`, description: "The server didn’t answer. Check that HiCT is still running, then try again." };
  }
  const safe = serverError && !JAVA_TEXT.test(serverError) ? serverError : undefined;
  if (status === 409 && /open a (hi-c )?(map|file)/i.test(serverError ?? "")) {
    return { title: "Open a map first", description: "This action needs an open contact map." };
  }
  if (status >= 500) {
    const ref = /\bref(?:erence)? ([0-9a-f]{8})\b/i.exec(serverError ?? "")?.[1];
    return {
      title: "Unexpected server error",
      description: ref ? `Please retry. If it happens again, report it with reference ${ref}.` : "Please retry. If it happens again, use Help → Report a bug…",
    };
  }
  if (status === 404) return { title: `Couldn’t ${actionLabel}`, description: safe ?? "The requested item was not found." };
  return { title: `Couldn’t ${actionLabel}`, description: safe ?? "The request was rejected. Nothing was changed." };
}
