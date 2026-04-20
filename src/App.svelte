<script>
  import { onMount, onDestroy } from "svelte";
  import Sidebar from "./lib/Sidebar.svelte";
  import MarketHeader from "./lib/MarketHeader.svelte";
  import ChatView from "./lib/ChatView.svelte";
  import AlertsPanel from "./lib/AlertsPanel.svelte";
  import Splash from "./lib/Splash.svelte";
  import { getHealth, getSymbols, streamTickers } from "./lib/api.js";

  const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"];

  let symbols = $state(DEFAULT_SYMBOLS);
  let activeSymbol = $state("BTC/USDT");
  let activeSessionId = $state(null);
  let backendReady = $state(false);
  let backendError = $state(null);
  let elapsedSec = $state(0);
  let sessionsRefreshKey = $state(0);
  let liveTickers = $state({});
  let tickerStreamConnected = $state(false);
  let tickerStreamError = $state(null);

  let pollTimer = null;
  let elapsedTimer = null;

  async function pollBackend() {
    try {
      const health = await getHealth();
      if (health?.ok) {
        backendReady = true;
        backendError = null;
        try {
          const data = await getSymbols();
          if (data?.symbols?.length) {
            symbols = data.symbols;
            if (!data.symbols.includes(activeSymbol)) activeSymbol = data.symbols[0];
          }
        } catch {}
        clearInterval(pollTimer);
        clearInterval(elapsedTimer);
      }
    } catch (e) {
      // Backend may still be warming up or the remote tunnel may be missing.
      if (elapsedSec > 20) {
        backendError =
          e?.message ||
          "Бэкенд недоступен. Проверь SSH-туннель, VITE_BACKEND_URL или доступность серверного API.";
      }
    }
  }

  onMount(() => {
    pollBackend();
    pollTimer = setInterval(pollBackend, 1500);
    elapsedTimer = setInterval(() => elapsedSec++, 1000);
  });

  onDestroy(() => {
    clearInterval(pollTimer);
    clearInterval(elapsedTimer);
  });

  $effect(() => {
    if (!backendReady || !symbols?.length) return;

    const controller = new AbortController();
    const targetSymbols = [...symbols];

    tickerStreamConnected = false;
    tickerStreamError = null;

    streamTickers({
      symbols: targetSymbols,
      signal: controller.signal,
      onSnapshot(data) {
        if (controller.signal.aborted) return;
        tickerStreamConnected = true;
        tickerStreamError = null;
        liveTickers = { ...(data?.tickers || {}) };
      },
      onTick(tick) {
        if (controller.signal.aborted || !tick?.symbol) return;
        tickerStreamConnected = true;
        tickerStreamError = null;
        liveTickers = { ...liveTickers, [tick.symbol]: tick };
      },
      onError(err) {
        if (controller.signal.aborted) return;
        tickerStreamConnected = false;
        tickerStreamError = err?.message || "Ticker stream disconnected";
      },
    }).catch((err) => {
      if (controller.signal.aborted) return;
      tickerStreamConnected = false;
      tickerStreamError = err?.message || "Ticker stream failed";
    });

    return () => controller.abort();
  });

  function handleNewSession() {
    activeSessionId = null;
  }
  function handleSessionSelect(id) {
    activeSessionId = id;
  }
  function handleSessionCreated(id) {
    activeSessionId = id;
    sessionsRefreshKey++;
  }

  function fmtPrice(n) {
    if (n === null || n === undefined) return "—";
    const value = Number(n);
    const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 5;
    return value.toLocaleString("en-US", { maximumFractionDigits: digits });
  }
</script>

{#if !backendReady}
  <Splash {elapsedSec} error={backendError} />
{:else}
  <div class="titlebar" data-tauri-drag-region>
    <div class="titlebar-spacer" data-tauri-drag-region></div>
    <div class="titlebar-center" data-tauri-drag-region>
      <span class="brand-mini" data-tauri-drag-region>
        <span class="brand-dot" data-tauri-drag-region></span>
        MLX Trader
      </span>
    </div>
    <div class="titlebar-right" data-tauri-drag-region></div>
  </div>

  <div class="shell">
    <Sidebar
      {activeSessionId}
      refreshKey={sessionsRefreshKey}
      onSelect={handleSessionSelect}
      onNew={handleNewSession}
    />

    <main class="main">
      <div class="symbol-bar">
        {#each symbols as sym (sym)}
          {@const ticker = liveTickers[sym]}
          <button
            class="tab"
            class:active={activeSymbol === sym}
            onclick={() => (activeSymbol = sym)}
          >
            <span class="tab-symbol">{sym}</span>
            <span class="tab-price" class:live={tickerStreamConnected && !!ticker?.last}>
              {ticker?.last ? `$${fmtPrice(ticker.last)}` : tickerStreamError ? "stream off" : "waiting"}
            </span>
          </button>
        {/each}
      </div>

      <MarketHeader
        symbol={activeSymbol}
        liveTicker={liveTickers[activeSymbol]}
        tickerStreamConnected={tickerStreamConnected}
        tickerStreamError={tickerStreamError}
      />

      <ChatView
        sessionId={activeSessionId}
        symbol={activeSymbol}
        onSessionCreated={handleSessionCreated}
      />
    </main>

    <AlertsPanel />
  </div>
{/if}

<style>
  .titlebar {
    height: 38px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: rgba(10, 10, 18, 0.6);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: 1px solid var(--border);
    user-select: none;
    -webkit-user-select: none;
    app-region: drag;
    -webkit-app-region: drag;
  }
  .titlebar-spacer {
    width: 80px; /* leave room for macOS traffic lights */
    height: 100%;
  }
  .titlebar-center {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .titlebar-right {
    width: 80px;
    height: 100%;
  }
  .brand-mini {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }
  .brand-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .shell {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .symbol-bar {
    display: flex;
    gap: 6px;
    padding: 14px 24px 0;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tab {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-faint);
    padding: 8px 14px;
    border-radius: 999px;
    font-weight: 500;
    font-size: 12px;
    backdrop-filter: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 110px;
    flex: 0 0 auto;
  }
  .tab:hover {
    background: var(--bg-elev);
    color: var(--text-dim);
    border-color: var(--border);
    transform: none;
    box-shadow: none;
  }
  .tab.active {
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.15), rgba(95, 175, 255, 0.1));
    color: var(--text);
    border-color: rgba(124, 92, 255, 0.35);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.08);
  }
  .tab-symbol {
    color: inherit;
    letter-spacing: 0.01em;
  }
  .tab-price {
    font-size: 11px;
    color: var(--text-faint);
    font-feature-settings: "tnum";
  }
  .tab-price.live {
    color: var(--text-dim);
  }
</style>
