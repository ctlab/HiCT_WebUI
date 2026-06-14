const ERROR_FIELD_KEYS = ["error", "message", "detail", "reason", "info"] as const;

const ERROR_PREFIX_RE = /^(AxiosError|Error|TypeError|ReferenceError|RangeError|URIError|SyntaxError|EvalError|AggregateError):\s*/;

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
    const responseData =
      record.response && typeof record.response === "object"
        ? (record.response as Record<string, unknown>).data
        : undefined;
    const nested = readErrorCandidate(responseData) || readFirstStringField(responseData);
    if (nested) {
      return nested;
    }
    const direct = readFirstStringField(error);
    if (direct) {
      return direct;
    }
    if (typeof record.message === "string" && record.message.trim().length > 0) {
      return normalizeString(record.message) || fallback;
    }
    if (typeof record.statusText === "string" && record.statusText.trim().length > 0) {
      return normalizeString(record.statusText) || fallback;
    }
  }
  if (error instanceof Error) {
    return normalizeString(error.message) || fallback;
  }
  return fallback;
};
