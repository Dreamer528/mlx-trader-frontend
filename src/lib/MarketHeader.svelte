<script>
  import { getContext } from "./api.js";

  let {
    symbol,
    liveTicker = null,
    tickerStreamConnected = false,
    tickerStreamError = null,
  } = $props();

  let ctx = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let refreshWarning = $state(null);

  async function load({ reset = false } = {}) {
    if (!symbol) return;
    const targetSymbol = symbol;
    if (reset) {
      ctx = null;
      error = null;
      refreshWarning = null;
    }
    loading = true;
    try {
      const data = await getContext(targetSymbol);
      if (targetSymbol !== symbol) return;
      ctx = data;
      error = null;
      refreshWarning = null;
    } catch (e) {
      if (targetSymbol !== symbol) return;
      if (ctx?.symbol === targetSymbol) {
        refreshWarning = e?.message || "Контекст временно не обновился";
      } else {
        error = e?.message || "Не удалось загрузить контекст";
      }
    } finally {
      if (targetSymbol === symbol) loading = false;
    }
  }

  $effect(() => {
    symbol;
    load({ reset: true });
    const id = setInterval(() => load(), 15_000);
    return () => clearInterval(id);
  });

  function fmt(n, digits = 2) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function fmtPrice(n) {
    if (n === null || n === undefined) return "—";
    const value = Number(n);
    const digits = value >= 1000 ? 2 : value >= 1 ? 3 : 5;
    return value.toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function pillClass(label) {
    if (!label) return "neutral";
    if (label.includes("bull") || label === "up_strong" || label === "up") return "bull";
    if (label.includes("bear") || label === "down_strong" || label === "down") return "bear";
    return "neutral";
  }
</script>

<header class="market-header">
  {#if loading && !ctx && !liveTicker}
    <div class="loading">Загружаю рынок…</div>
  {:else if error && !ctx}
    <div class="error">⚠ {error}</div>
  {:else if ctx || liveTicker}
    {@const tf15 = ctx?.timeframes?.["15m"]}
    {@const tf1h = ctx?.timeframes?.["1h"]}
    {@const tf4h = ctx?.timeframes?.["4h"]}
    {@const m = ctx?.extra_market_data || {}}
    {@const price = liveTicker?.last ?? tf15?.close ?? tf1h?.close}
    {@const change24h = liveTicker?.change24h_pct ?? tf15?.pct_change_24h ?? 0}

    <div class="row primary">
      <div class="symbol-block">
        <div class="symbol-name">{ctx?.symbol ?? symbol}</div>
        <div class="price">${fmtPrice(price)}</div>
      </div>
      <div class="changes">
        <div class={`change ${(tf15?.pct_change_1h ?? 0) >= 0 ? "up" : "down"}`}>
          <span class="change-label">1h</span>
          {(tf15?.pct_change_1h ?? 0) >= 0 ? "+" : ""}{fmt(tf15?.pct_change_1h, 2)}%
        </div>
        <div class={`change ${change24h >= 0 ? "up" : "down"}`}>
          <span class="change-label">24h</span>
          {change24h >= 0 ? "+" : ""}{fmt(change24h, 2)}%
        </div>
      </div>
    </div>

    <div class="row meta">
      {#if liveTicker?.bid != null && liveTicker?.ask != null}
        <span class="micro-pill neutral">bid ${fmtPrice(liveTicker.bid)} / ask ${fmtPrice(liveTicker.ask)}</span>
      {/if}
      {#if liveTicker?.high24h != null && liveTicker?.low24h != null}
        <span class="micro-pill neutral">
          24h range ${fmtPrice(liveTicker.low24h)} - ${fmtPrice(liveTicker.high24h)}
        </span>
      {/if}
      <span class={`micro-pill ${tickerStreamConnected ? "live" : "warn"}`}>
        {tickerStreamConnected ? "OKX live tick" : "stream reconnecting"}
      </span>
      {#if refreshWarning}
        <span class="micro-pill warn">Контекст временно не обновился</span>
      {/if}
      {#if !ctx}
        <span class="micro-pill neutral">Структура догружается…</span>
      {/if}
      {#if tickerStreamError && !tickerStreamConnected}
        <span class="micro-pill warn">{tickerStreamError}</span>
      {/if}
    </div>

    <div class="row pills">
      {#if tf4h?.smc?.trend_bias}
        <span class={`pill ${pillClass(tf4h.smc.trend_bias)}`}>
          <span class="pill-tf">4h</span>
          {tf4h.smc.trend_bias}
        </span>
      {/if}
      {#if tf1h?.smc?.trend_bias}
        <span class={`pill ${pillClass(tf1h.smc.trend_bias)}`}>
          <span class="pill-tf">1h</span>
          {tf1h.smc.trend_bias}
        </span>
      {/if}
      {#if tf15?.smc?.trend_bias}
        <span class={`pill ${pillClass(tf15.smc.trend_bias)}`}>
          <span class="pill-tf">15m</span>
          {tf15.smc.trend_bias}
        </span>
      {/if}
      {#if tf15?.smc?.impulse_state && tf15.smc.impulse_state !== "consolidation"}
        <span class={`pill ${pillClass(tf15.smc.impulse_state)}`}>
          ⚡ {tf15.smc.impulse_size_atr.toFixed(1)}atr
        </span>
      {/if}
      {#if m.funding_rate_pct !== undefined}
        <span class={`pill ${m.funding_rate_pct > 0 ? "bear" : "bull"}`}>
          funding {m.funding_rate_pct > 0 ? "+" : ""}{fmt(m.funding_rate_pct, 4)}%
        </span>
      {/if}
      {#if m.fear_greed_value !== undefined}
        <span class="pill neutral">F&G {m.fear_greed_value} · {m.fear_greed_label}</span>
      {/if}
      {#if m.btc_dominance_pct !== undefined}
        <span class="pill neutral">BTC.D {fmt(m.btc_dominance_pct, 2)}%</span>
      {/if}
    </div>

    <div class="row levels">
      {#if tf15?.smc?.nearest_support}
        <span class="level">
          <span class="lbl">support</span>
          <span class="val">${fmt(tf15.smc.nearest_support)}</span>
        </span>
      {/if}
      {#if tf15?.smc?.nearest_resistance}
        <span class="level">
          <span class="lbl">resistance</span>
          <span class="val">${fmt(tf15.smc.nearest_resistance)}</span>
        </span>
      {/if}
      {#if tf15?.smc?.recently_swept_liquidity?.length}
        <span class="level swept">
          <span class="lbl">⚡ recent sweep</span>
          <span class="val">{tf15.smc.recently_swept_liquidity.length}×</span>
        </span>
      {/if}
    </div>
  {/if}
</header>

<style>
  .market-header {
    padding: 16px 24px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .primary {
    justify-content: space-between;
  }
  .symbol-block {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .symbol-name {
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .price {
    font-size: 26px;
    font-weight: 600;
    font-feature-settings: "tnum", "ss01";
    background: linear-gradient(180deg, var(--text), var(--text-dim));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
  }
  .changes {
    display: flex;
    gap: 8px;
  }
  .meta {
    gap: 8px;
  }
  .change {
    font-size: 12.5px;
    padding: 5px 11px;
    border-radius: 999px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    font-feature-settings: "tnum";
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }
  .change-label {
    color: var(--text-faint);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .change.up {
    color: var(--green);
    border-color: rgba(34, 197, 94, 0.25);
    background: rgba(34, 197, 94, 0.06);
  }
  .change.down {
    color: var(--red);
    border-color: rgba(239, 68, 68, 0.25);
    background: rgba(239, 68, 68, 0.06);
  }

  .pill {
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.005em;
  }
  .pill-tf {
    color: var(--text-faint);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .pill.bull {
    color: var(--green);
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.08);
  }
  .pill.bear {
    color: var(--red);
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.08);
  }
  .pill.neutral {
    color: var(--text-dim);
  }
  .micro-pill {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 500;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: var(--text-dim);
  }
  .micro-pill.live {
    color: var(--green);
    border-color: rgba(34, 197, 94, 0.25);
    background: rgba(34, 197, 94, 0.08);
  }
  .micro-pill.warn {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.25);
    background: rgba(251, 191, 36, 0.08);
  }
  .micro-pill.neutral {
    color: var(--text-dim);
  }

  .level {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    font-feature-settings: "tnum";
  }
  .level .lbl {
    color: var(--text-faint);
    text-transform: uppercase;
    font-size: 9.5px;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .level .val {
    color: var(--text);
    font-weight: 500;
  }
  .level.swept .val {
    color: var(--yellow);
  }
  .loading,
  .error {
    color: var(--text-dim);
    font-size: 13px;
  }
  .error {
    color: var(--red);
  }
</style>
