import { fetchEventSource } from "@microsoft/fetch-event-source";

const configuredBackendUrl =
  import.meta.env?.VITE_BACKEND_URL ||
  import.meta.env?.VITE_MLX_BACKEND_URL ||
  "http://127.0.0.1:8765";

export const BACKEND_URL = configuredBackendUrl.replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = Number(import.meta.env?.VITE_BACKEND_TIMEOUT_MS || 5000);

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

async function fetchJson(path, { fallbackMessage, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = {}) {
  const { signal, cleanup } = createTimedSignal(timeoutMs, init.signal);

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, { ...init, signal });
    if (!response.ok) {
      throw new Error(await readError(response, fallbackMessage));
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    if (signal.aborted && error?.name === "AbortError") {
      throw new Error(buildTimeoutMessage(fallbackMessage || "Request failed", timeoutMs));
    }
    throw error;
  } finally {
    cleanup();
  }
}

async function readError(response, fallbackMessage) {
  try {
    const data = await response.clone().json();
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {}

  try {
    const text = await response.text();
    if (text?.trim()) return text.trim();
  } catch {}

  return fallbackMessage;
}

export async function getHealth() {
  return fetchJson("/health", { fallbackMessage: "Backend unreachable", timeoutMs: 4000 });
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

  const url = qs.size ? `${BACKEND_URL}/tickers/stream?${qs}` : `${BACKEND_URL}/tickers/stream`;

  await fetchEventSource(url, {
    method: "GET",
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) {
        throw new Error(await readError(response, "Ticker stream failed"));
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
  await fetchEventSource(`${BACKEND_URL}/chat/stream`, {
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
