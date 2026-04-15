<script>
  import { onMount, onDestroy } from "svelte";
  import Sidebar from "./lib/Sidebar.svelte";
  import MarketHeader from "./lib/MarketHeader.svelte";
  import ChatView from "./lib/ChatView.svelte";
  import AlertsPanel from "./lib/AlertsPanel.svelte";
  import Splash from "./lib/Splash.svelte";
  import { getHealth, getSymbols } from "./lib/api.js";

  let symbols = $state(["BTC/USDT", "ETH/USDT"]);
  let activeSymbol = $state("BTC/USDT");
  let activeSessionId = $state(null);
  let backendReady = $state(false);
  let backendError = $state(null);
  let elapsedSec = $state(0);
  let sessionsRefreshKey = $state(0);

  let pollTimer = null;
  let elapsedTimer = null;

  async function pollBackend() {
    try {
      const health = await getHealth();
      if (health?.ok) {
        backendReady = true;
        try {
          const data = await getSymbols();
          if (data?.symbols?.length) symbols = data.symbols;
        } catch {}
        clearInterval(pollTimer);
        clearInterval(elapsedTimer);
      }
    } catch (e) {
      // Backend not up yet — keep polling. Only surface error after ~3 minutes.
      if (elapsedSec > 180) {
        backendError = "Бэкенд не отвечает уже больше 3 минут.";
        clearInterval(pollTimer);
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
          <button
            class="tab"
            class:active={activeSymbol === sym}
            onclick={() => (activeSymbol = sym)}
          >
            {sym}
          </button>
        {/each}
      </div>

      <MarketHeader symbol={activeSymbol} />

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
  }
  .tab {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-faint);
    padding: 8px 16px;
    border-radius: 999px;
    font-weight: 500;
    font-size: 12.5px;
    backdrop-filter: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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
</style>
