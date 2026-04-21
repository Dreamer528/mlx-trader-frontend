import { fetchEventSource } from "@microsoft/fetch-event-source";

const DEFAULT_BACKEND_URL = "https://quantorix-prime.ru/mlx";
const configuredBackendUrl =
  import.meta.env?.VITE_BACKEND_URL || import.meta.env?.VITE_MLX_BACKEND_URL || DEFAULT_BACKEND_URL;

let activeBackendUrl = configuredBackendUrl.trim().replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = Number(import.meta.env?.VITE_BACKEND_TIMEOUT_MS || 5000);

export function getBackendUrl() {
  return activeBackendUrl;
}

function buildTimeoutMessage(message, timeoutMs) {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `${message} (timeout after ${seconds}s)`;
}

function createTimedSignal(timeoutMs, upstreamSignal) {
  const controller = new AbortController();
  let cleanedUp = false;

  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  const abortFromTimeout = () =>
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "AbortError"));

  const timeoutId = setTimeout(abortFromTimeout, timeoutMs);

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener?.("abort", abortFromUpstream);
    },
  };
}

function normalizeNetworkError(error, fallbackMessage, timeoutMs) {
  if (error?.name === "AbortError") {
    return new Error(buildTimeoutMessage(fallbackMessage || "Request failed", timeoutMs));
  }

  const rawMessage = String(error?.message || "").trim();
  if (
    error instanceof TypeError ||
    /load failed|failed to fetch|networkerror|fetch failed|could not connect/i.test(rawMessage)
  ) {
    return new Error(fallbackMessage || "Request failed");
  }

  return error;
}

async function fetchJsonFromBase(
  baseUrl,
  path,
  { fallbackMessage, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = {}
) {
  const { signal, cleanup } = createTimedSignal(timeoutMs, init.signal);

  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal });
    if (!response.ok) {
      throw new Error(await readError(response, fallbackMessage));
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    throw normalizeNetworkError(error, fallbackMessage, timeoutMs);
  } finally {
    cleanup();
  }
}

async function fetchJson(path, options = {}) {
  return fetchJsonFromBase(activeBackendUrl, path, options);
}

async function readError(response, fallbackMessage) {
  const normalizedFallback = fallbackMessage || "Request failed";

  try {
    const data = await response.clone().json();
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail.trim().toLowerCase() === "not found" ? normalizedFallback : data.detail;
    }
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message.trim().toLowerCase() === "not found" ? normalizedFallback : data.message;
    }
  } catch {}

  try {
    const text = await response.text();
    if (text?.trim()) {
      return /not found/i.test(text.trim()) ? normalizedFallback : text.trim();
    }
  } catch {}

  return normalizedFallback;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.retryable = status >= 500;
  return error;
}

export async function getHealth() {
  return fetchJsonFromBase(activeBackendUrl, "/health", {
    fallbackMessage: "Backend unreachable",
    timeoutMs: 4000,
  });
}

export async function getSymbols() {
  return fetchJson("/symbols", { fallbackMessage: "Failed to load symbols" });
}

export async function getContext(symbol) {
  const [base, quote] = symbol.split("/");
  return fetchJson(`/context/${base}/${quote}`, {
    fallbackMessage: "Failed to load context",
    timeoutMs: 10000,
  });
}

export async function listSessions() {
  return fetchJson("/sessions", { fallbackMessage: "Failed to load sessions" });
}

export async function getSession(id) {
  return fetchJson(`/sessions/${id}`, { fallbackMessage: "Failed to load session" });
}

export async function createSession(symbol, title = "") {
  return fetchJson("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, title }),
    fallbackMessage: "Failed to create session",
  });
}

export async function deleteSession(id) {
  await fetchJson(`/sessions/${id}`, {
    method: "DELETE",
    fallbackMessage: "Failed to delete session",
  });
}

export async function getAlerts(limit = 20) {
  return fetchJson(`/alerts?limit=${limit}`, { fallbackMessage: "Failed to load alerts" });
}

export async function setScannerEnabled(enabled) {
  await fetchJson(`/scanner/${enabled ? "start" : "stop"}`, {
    method: "POST",
    fallbackMessage: "Failed to update scanner",
  });
}

export async function streamTickers({
  symbols,
  onSnapshot,
  onTick,
  onKeepalive,
  onError,
  signal,
}) {
  const qs = new URLSearchParams();
  if (symbols?.length) qs.set("symbols", symbols.join(","));

  const baseUrl = getBackendUrl();
  const url = qs.size ? `${baseUrl}/tickers/stream?${qs}` : `${baseUrl}/tickers/stream`;

  await fetchEventSource(url, {
    method: "GET",
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw httpError(response.status, await readError(response, "Live ticker stream unavailable"));
      }
    },
    onmessage(ev) {
      if (ev.event === "snapshot") {
        try {
          onSnapshot?.(JSON.parse(ev.data));
        } catch {}
      } else if (ev.event === "tick") {
        try {
          onTick?.(JSON.parse(ev.data));
        } catch {}
      } else if (ev.event === "keepalive") {
        try {
          onKeepalive?.(JSON.parse(ev.data));
        } catch {
          onKeepalive?.(ev.data);
        }
      }
    },
    onerror(err) {
      onError?.(err);
      // Do not throw here: fetchEventSource will retry automatically.
    },
  });
}

/**
 * Stream a chat completion from the analyst.
 *
 * @param {object} params
 * @param {string} params.symbol
 * @param {string} params.message
 * @param {number|null} params.sessionId
 * @param {(token: string) => void} params.onToken
 * @param {(meta: object) => void} params.onMeta
 * @param {(status: object|string) => void} params.onStatus
 * @param {(sessionId: number) => void} params.onDone
 * @param {(err: Error) => void} params.onError
 * @param {AbortSignal} [params.signal]
 */
export async function streamChat({
  symbol,
  message,
  sessionId,
  onToken,
  onMeta,
  onStatus,
  onDone,
  onError,
  signal,
}) {
  const baseUrl = getBackendUrl();

  await fetchEventSource(`${baseUrl}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, message, session_id: sessionId }),
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw new Error(`SSE open failed: ${response.status}`);
      }
    },
    onmessage(ev) {
      if (ev.event === "meta") {
        try {
          onMeta?.(JSON.parse(ev.data));
        } catch {}
      } else if (ev.event === "status") {
        try {
          onStatus?.(JSON.parse(ev.data));
        } catch {
          onStatus?.(ev.data);
        }
      } else if (ev.event === "token") {
        onToken?.(ev.data);
      } else if (ev.event === "done") {
        try {
          const data = JSON.parse(ev.data);
          onDone?.(data.session_id);
        } catch {
          onDone?.(sessionId);
        }
      }
    },
    onerror(err) {
      onError?.(err);
      throw err; // stop fetchEventSource from retrying
    },
  });
}
