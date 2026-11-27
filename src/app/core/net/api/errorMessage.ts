const ERROR_FIELD_KEYS = [
  "error",
  "message",
  "detail",
  "reason",
  "info",
] as const;

const ERROR_PREFIX_RE =
  /^(AxiosError|Error|TypeError|ReferenceError|RangeError|URIError|SyntaxError|EvalError|AggregateError):\s*/;

export function formatHttpError(status: unknown, message: string): string {
  if (status === 409 && /^(?:no (?:open|active) (?:file|map)|open .{0,20}\b(?:map|file) first)/i.test(message)) {
    return "Open a map first";
  }
  if (typeof status === "number" && status >= 500) {
    const reference = /\bref(?:erence)? ([0-9a-f]{8})\b/i.exec(message)?.[1];
    return reference
      ? `Unexpected server error (ref ${reference}). Please retry. If it repeats, report it with this reference.`
      : "Unexpected server error. Please retry.";
  }
  return message;
}

const normalizeString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "[object Object]") {
    return "";
  }
  return trimmed.replace(ERROR_PREFIX_RE, "");
};

const decodeBinaryPayload = (value: unknown): string => {
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return new TextDecoder("utf-8").decode(new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder("utf-8").decode(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    );
  }
  return "";
};

const readErrorCandidate = (value: unknown): string => {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    if (normalized.length === 0) {
      return "";
    }
    try {
      const parsed = JSON.parse(normalized) as unknown;
      const nested = readFirstStringField(parsed);
      if (nested) {
        return nested;
      }
    } catch {
      // Ignore non-JSON strings.
    }
    return normalized;
  }
  const binary = decodeBinaryPayload(value);
  if (binary.length > 0) {
    return readErrorCandidate(binary);
  }
  return readFirstStringField(value);
};

const readFirstStringField = (value: unknown): string => {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const key of ERROR_FIELD_KEYS) {
    const candidate = record[key];
    const readable = readErrorCandidate(candidate);
    if (readable.length > 0) {
      return readable;
    }
  }
  return "";
};

export const extractErrorMessage = (
  error: unknown,
  fallback = "Request failed"
): string => {
  if (typeof error === "string") {
    return normalizeString(error) || fallback;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const response =
      record.response && typeof record.response === "object"
        ? (record.response as Record<string, unknown>)
        : undefined;
    const nested =
      readErrorCandidate(response?.data) || readFirstStringField(response?.data);
    if (response) return formatHttpError(response.status, nested || fallback);
    const direct = readFirstStringField(error);
    if (direct) {
      return direct;
    }
    if (
      typeof record.message === "string" &&
      record.message.trim().length > 0
    ) {
      return normalizeString(record.message) || fallback;
    }
    if (
      typeof record.statusText === "string" &&
      record.statusText.trim().length > 0
    ) {
      return normalizeString(record.statusText) || fallback;
    }
  }
  if (error instanceof Error) {
    return normalizeString(error.message) || fallback;
  }
  return fallback;
};
