<script>
  import { listSessions, deleteSession } from "./api.js";

  let { activeSessionId, onSelect, onNew, refreshKey } = $props();

  let sessions = $state([]);
  let loading = $state(false);

  async function load() {
    loading = true;
    try {
      sessions = await listSessions();
    } finally {
      loading = false;
    }
  }

  async function remove(id, ev) {
    ev.stopPropagation();
    await deleteSession(id);
    if (id === activeSessionId) onSelect(null);
    await load();
  }

  $effect(() => {
    refreshKey;
    load();
  });
</script>

<aside class="sidebar glass">
  <button class="new-btn" onclick={() => onNew()}>
    <span class="plus">+</span>
    Новый чат
  </button>

  <div class="section-label">История</div>

  <div class="sessions">
    {#if loading && sessions.length === 0}
      <div class="empty">Загрузка…</div>
    {:else if sessions.length === 0}
      <div class="empty">Пока пусто</div>
    {:else}
      {#each sessions as s (s.id)}
        <div
          class="session"
          class:active={s.id === activeSessionId}
          onclick={() => onSelect(s.id)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
          role="button"
          tabindex="0"
        >
          <div class="title">{s.title || `Чат #${s.id}`}</div>
          <div class="meta">
            <span class="symbol-chip">{s.symbol}</span>
            <span class="date">{new Date(s.created_at).toLocaleDateString()}</span>
          </div>
          <button class="del" onclick={(e) => remove(s.id, e)} title="Удалить">×</button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="footer">
    <div class="status">
      <span class="dot live"></span>
      Локальный режим · M4
    </div>
  </div>
</aside>

<style>
  .sidebar {
    width: 268px;
    border-right: 1px solid var(--border);
    border-top: none;
    border-bottom: none;
    border-left: none;
    display: flex;
    flex-direction: column;
    padding: 18px 14px 14px;
    gap: 14px;
    flex-shrink: 0;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
  }

  .new-btn {
    width: 100%;
    background: linear-gradient(135deg, var(--accent), #6a4cef);
    border-color: rgba(124, 92, 255, 0.5);
    color: white;
    font-weight: 500;
    padding: 11px 14px;
    box-shadow:
      0 4px 16px rgba(124, 92, 255, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .new-btn:hover {
    filter: brightness(1.08);
    box-shadow:
      0 6px 24px rgba(124, 92, 255, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
  .plus {
    font-size: 18px;
    line-height: 1;
    font-weight: 400;
  }

  .section-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    padding: 6px 8px 0;
    font-weight: 600;
  }

  .sessions {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0 -4px;
    padding: 0 4px;
  }

  .empty {
    color: var(--text-faint);
    font-size: 12.5px;
    padding: 14px 8px;
    text-align: center;
  }

  .session {
    position: relative;
    padding: 11px 13px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }
  .session:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--border);
  }
  .session.active {
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.14), rgba(95, 175, 255, 0.06));
    border-color: rgba(124, 92, 255, 0.35);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .title {
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 22px;
    font-weight: 500;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 5px;
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .symbol-chip {
    color: var(--accent-2);
    font-weight: 500;
    font-feature-settings: "tnum";
  }
  .date {
    font-feature-settings: "tnum";
  }

  .del {
    position: absolute;
    top: 8px;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-size: 18px;
    line-height: 1;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    opacity: 0;
    transition: all 0.15s;
    backdrop-filter: none;
  }
  .session:hover .del {
    opacity: 1;
  }
  .del:hover {
    background: rgba(239, 68, 68, 0.18);
    color: var(--red);
    border: none;
    box-shadow: none;
    transform: none;
  }

  .footer {
    padding: 10px 8px 4px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    color: var(--text-faint);
    font-weight: 500;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green-glow);
  }
</style>
