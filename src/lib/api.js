import { fetchEventSource } from "@microsoft/fetch-event-source";

const configuredBackendUrl =
  import.meta.env?.VITE_BACKEND_URL ||
  import.meta.env?.VITE_MLX_BACKEND_URL ||
  "http://127.0.0.1:8765";

const BACKEND_URL = configuredBackendUrl.replace(/\/$/, "");

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
  const r = await fetch(`${BACKEND_URL}/health`);
  if (!r.ok) throw new Error(await readError(r, "Backend unreachable"));
  return r.json();
}

export async function getSymbols() {
  const r = await fetch(`${BACKEND_URL}/symbols`);
  if (!r.ok) throw new Error(await readError(r, "Failed to load symbols"));
  return r.json();
}

export async function getContext(symbol) {
  const [base, quote] = symbol.split("/");
  const r = await fetch(`${BACKEND_URL}/context/${base}/${quote}`);
  if (!r.ok) throw new Error(await readError(r, "Failed to load context"));
  return r.json();
}

export async function listSessions() {
  const r = await fetch(`${BACKEND_URL}/sessions`);
  return r.json();
}

export async function getSession(id) {
  const r = await fetch(`${BACKEND_URL}/sessions/${id}`);
  return r.json();
}

export async function createSession(symbol, title = "") {
  const r = await fetch(`${BACKEND_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, title }),
  });
  return r.json();
}

export async function deleteSession(id) {
  await fetch(`${BACKEND_URL}/sessions/${id}`, { method: "DELETE" });
}

export async function getAlerts(limit = 20) {
  const r = await fetch(`${BACKEND_URL}/alerts?limit=${limit}`);
  if (!r.ok) throw new Error(await readError(r, "Failed to load alerts"));
  return r.json();
}

export async function setScannerEnabled(enabled) {
  await fetch(`${BACKEND_URL}/scanner/${enabled ? "start" : "stop"}`, {
    method: "POST",
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
