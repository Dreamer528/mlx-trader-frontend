<script>
  let { elapsedSec, error, backendUrl } = $props();

  // Stage labels based on how long we've been waiting
  let stage = $derived(
    elapsedSec < 3
      ? "Запускаю движок…"
      : elapsedSec < 8
        ? "Подключаюсь к бэкенду…"
        : elapsedSec < 20
          ? "Проверяю сервер и туннель…"
          : "Жду ответ от backend…"
  );

  let mins = $derived(Math.floor(elapsedSec / 60));
  let secs = $derived(elapsedSec % 60);
</script>

<div class="splash" data-tauri-drag-region>
  <div class="card" data-tauri-drag-region>
    <div class="logo">
      <div class="eye"></div>
      <div class="eye"></div>
    </div>
    <h1>MLX Trader</h1>
    <p class="tag">SMC-аналитик · Claude API · OKX</p>

    {#if error}
      <div class="error">
        <div class="error-title">⚠ Не могу подключиться к бэкенду</div>
        <div class="error-body">{error}</div>
        <div class="hint">
          Проверь <code>VITE_BACKEND_URL</code>, SSH-туннель или доступность серверного API.
        </div>
        <div class="backend-url">
          Сейчас app пытается открыть <code>{backendUrl}</code>
        </div>
      </div>
    {:else}
      <div class="progress">
        <div class="bar">
          <div class="fill"></div>
        </div>
        <div class="stage">{stage}</div>
        <div class="elapsed">{mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 50% 30%, #1a1f2a 0%, #0b0d12 70%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    -webkit-app-region: drag;
  }
  .card {
    text-align: center;
    max-width: 440px;
    padding: 40px 50px;
  }
  .logo {
    display: flex;
    justify-content: center;
    gap: 18px;
    margin-bottom: 24px;
  }
  .eye {
    width: 28px;
    height: 28px;
    background: var(--accent);
    border-radius: 50%;
    box-shadow: 0 0 30px var(--accent-glow);
    animation: pulse 1.8s ease-in-out infinite;
  }
  .eye:nth-child(2) {
    animation-delay: 0.3s;
  }
  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
  }
  h1 {
    font-size: 34px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 6px;
    letter-spacing: -0.02em;
  }
  .tag {
    color: var(--text-faint);
    font-size: 13px;
    margin: 0 0 36px;
  }
  .progress {
    margin-top: 28px;
  }
  .bar {
    height: 3px;
    background: var(--bg-elev-2);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 18px;
  }
  .fill {
    height: 100%;
    width: 30%;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: slide 1.6s ease-in-out infinite;
  }
  @keyframes slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }
  .stage {
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.5;
    min-height: 38px;
  }
  .elapsed {
    color: var(--text-faint);
    font-size: 11px;
    font-feature-settings: "tnum";
    margin-top: 10px;
  }
  .error {
    margin-top: 28px;
    padding: 16px 20px;
    background: #261414;
    border: 1px solid #5b1f1f;
    border-radius: var(--radius);
    text-align: left;
  }
  .error-title {
    color: var(--red);
    font-weight: 500;
    margin-bottom: 6px;
  }
  .error-body {
    color: var(--text-dim);
    font-size: 12px;
    margin-bottom: 12px;
  }
  .hint {
    color: var(--text-faint);
    font-size: 11px;
  }
  .backend-url {
    color: var(--text-dim);
    font-size: 11px;
    margin-top: 10px;
    word-break: break-word;
  }
  .hint code {
    background: var(--bg-elev-2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }
  .backend-url code {
    background: var(--bg-elev-2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }
</style>
