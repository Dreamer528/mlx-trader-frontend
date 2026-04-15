<script>
  import { getAlerts, setScannerEnabled } from "./api.js";

  let alerts = $state([]);
  let scannerOn = $state(true);
  let loading = $state(false);

  async function load() {
    loading = true;
    try {
      alerts = await getAlerts(15);
    } finally {
      loading = false;
    }
  }

  async function toggleScanner() {
    scannerOn = !scannerOn;
    await setScannerEnabled(scannerOn);
  }

  $effect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  });

  function severityColor(s) {
    if (s === "alert") return "var(--red)";
    if (s === "warn") return "var(--yellow)";
    return "var(--accent-2)";
  }

  function timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "сейчас";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
</script>

<aside class="alerts glass">
  <div class="header">
    <div class="title">
      <span class="bolt">⚡</span>
      Сканер
    </div>
    <button class="toggle" class:on={scannerOn} onclick={toggleScanner}>
      <span class="toggle-dot"></span>
      {scannerOn ? "ON" : "OFF"}
    </button>
  </div>

  <div class="list">
    {#if alerts.length === 0}
      <div class="empty">
        <div class="empty-icon">∅</div>
        <div>{loading ? "Загрузка…" : "Нет событий"}</div>
        <div class="empty-sub">
          Жду паттернов:<br />sweep · BOS · импульс · funding
        </div>
      </div>
    {:else}
      {#each alerts as a (a.id)}
        <div class="alert" style="--bar: {severityColor(a.severity)}">
          <div class="row1">
            <span class="symbol">{a.symbol}</span>
            <span class="time">{timeAgo(a.created_at)}</span>
          </div>
          <div class="headline">{a.headline}</div>
          {#if a.body && a.body !== a.headline}
            <div class="body">{a.body}</div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .alerts {
    width: 280px;
    border-left: 1px solid var(--border);
    border-top: none;
    border-bottom: none;
    border-right: none;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 14px;
    border-bottom: 1px solid var(--border);
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.005em;
  }
  .bolt {
    font-size: 14px;
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }
  .toggle {
    padding: 4px 11px 4px 8px;
    font-size: 10.5px;
    border-radius: 999px;
    font-weight: 600;
    background: var(--bg-elev-2);
    border-color: var(--border);
    color: var(--text-faint);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    backdrop-filter: none;
  }
  .toggle:hover {
    background: var(--bg-elev-2);
    transform: none;
    box-shadow: none;
    border-color: var(--border-strong);
    filter: none;
  }
  .toggle-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .toggle.on {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.35);
    color: var(--green);
  }
  .toggle.on .toggle-dot {
    background: var(--green);
    box-shadow: 0 0 8px var(--green-glow);
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .empty {
    color: var(--text-faint);
    font-size: 11.5px;
    text-align: center;
    padding: 30px 16px;
    line-height: 1.6;
  }
  .empty-icon {
    font-size: 32px;
    color: var(--text-faint);
    opacity: 0.5;
    margin-bottom: 10px;
  }
  .empty-sub {
    margin-top: 8px;
    font-size: 10.5px;
    color: var(--text-faint);
    opacity: 0.8;
  }
  .alert {
    background: var(--bg-elev-2);
    border-radius: var(--radius-sm);
    padding: 11px 13px 11px 14px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--bar, var(--accent));
    font-size: 12px;
    transition: all 0.15s ease;
  }
  .alert:hover {
    border-color: var(--border-strong);
    transform: translateX(1px);
  }
  .row1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }
  .symbol {
    font-weight: 600;
    color: var(--text);
    font-size: 11px;
  }
  .time {
    color: var(--text-faint);
    font-size: 10px;
    font-feature-settings: "tnum";
  }
  .headline {
    color: var(--text);
    line-height: 1.45;
  }
  .body {
    color: var(--text-dim);
    font-size: 11px;
    margin-top: 7px;
    line-height: 1.55;
    max-height: 80px;
    overflow: hidden;
  }
</style>
