import { fetchEventSource } from "@microsoft/fetch-event-source";

const BACKEND_URL = "http://138.124.31.181:8765";

export async function getHealth() {
  const r = await fetch(`${BACKEND_URL}/health`);
  if (!r.ok) throw new Error("Backend unreachable");
  return r.json();
}

export async function getSymbols() {
  const r = await fetch(`${BACKEND_URL}/symbols`);
  return r.json();
}

export async function getContext(symbol) {
  const [base, quote] = symbol.split("/");
  const r = await fetch(`${BACKEND_URL}/context/${base}/${quote}`);
  if (!r.ok) throw new Error("Failed to load context");
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
  return r.json();
}

export async function setScannerEnabled(enabled) {
  await fetch(`${BACKEND_URL}/scanner/${enabled ? "start" : "stop"}`, {
    method: "POST",
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
    onmessage(ev) {
      if (ev.event === "meta") {
        try {
          onMeta?.(JSON.parse(ev.data));
        } catch {}
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
