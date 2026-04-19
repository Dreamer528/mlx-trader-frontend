<script>
  import { onMount, tick } from "svelte";
  import { marked } from "marked";
  import { getSession, streamChat } from "./api.js";

  let { sessionId, symbol, onSessionCreated } = $props();

  let messages = $state([]);
  let input = $state("");
  let streaming = $state(false);
  let thinking = $state(false);
  let thinkStart = $state(null);
  let thinkElapsed = $state(0);
  let abortController = $state(null);
  let scroller;
  let thinkTimer;

  marked.setOptions({ breaks: true, gfm: true });

  function formatThinkTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}с`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}м ${r}с`;
  }

  function startThinkTimer() {
    thinkStart = Date.now();
    thinkElapsed = 0;
    thinkTimer = setInterval(() => {
      thinkElapsed = Date.now() - thinkStart;
    }, 500);
  }

  function stopThinkTimer() {
    clearInterval(thinkTimer);
    thinkTimer = null;
    thinkStart = null;
  }

  async function loadSession(id) {
    if (!id) {
      messages = [];
      return;
    }
    try {
      const data = await getSession(id);
      messages = data.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
      await scrollToBottom();
    } catch (e) {
      console.error("loadSession failed", e);
      messages = [];
    }
  }

  async function scrollToBottom() {
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    input = "";
    streaming = true;
    thinking = true;
    startThinkTimer();

    messages = [...messages, { role: "user", content: text }];
    messages = [...messages, { role: "assistant", content: "", streaming: true }];
    await scrollToBottom();

    abortController = new AbortController();
    let createdSessionId = sessionId;
    let firstToken = false;

    try {
      await streamChat({
        symbol,
        message: text,
        sessionId,
        signal: abortController.signal,
        onMeta: (meta) => {
          if (!createdSessionId && meta.session_id) {
            createdSessionId = meta.session_id;
            onSessionCreated?.(meta.session_id);
          }
        },
        onToken: (chunk) => {
          if (!firstToken) {
            firstToken = true;
            thinking = false;
            stopThinkTimer();
          }
          const last = messages[messages.length - 1];
          last.content += chunk;
          messages = [...messages.slice(0, -1), last];
          scrollToBottom();
        },
        onDone: () => {
          const last = messages[messages.length - 1];
          last.streaming = false;
          messages = [...messages.slice(0, -1), last];
        },
        onError: (err) => {
          console.error("stream error", err);
          const last = messages[messages.length - 1];
          last.content = (last.content || "") + "\n\n_⚠ Ошибка соединения с бэкендом_";
          last.streaming = false;
          messages = [...messages.slice(0, -1), last];
        },
      });
    } finally {
      streaming = false;
      thinking = false;
      stopThinkTimer();
      abortController = null;
    }
  }

  function stop() {
    abortController?.abort();
    streaming = false;
    thinking = false;
    stopThinkTimer();
  }

  function onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  $effect(() => {
    // When a new chat starts, parent receives `session_id` from stream meta and
    // updates `sessionId` mid-stream. Reloading session at that moment drops the
    // local assistant placeholder, and incoming tokens end up in the user bubble.
    if (streaming) return;
    loadSession(sessionId);
  });

  const suggestions = [
    "что сейчас на рынке?",
    "разбери btc на 15m",
    "стоит ли ждать отката?",
    "где ключевая ликвидность?",
  ];
</script>

<div class="chat">
  <div class="messages" bind:this={scroller}>
    {#if messages.length === 0}
      <div class="empty">
        <div class="empty-icon">
          <div class="eye"></div>
          <div class="eye"></div>
        </div>
        <div class="empty-title">Готов читать рынок</div>
        <div class="empty-hint">
          Спроси про <strong>{symbol}</strong> — я разберу мульти-таймфреймовую структуру,
          ликвидность, FVG и ордер-блоки.
        </div>
        <div class="suggestions">
          {#each suggestions as s}
            <button class="suggestion" onclick={() => (input = s)}>{s}</button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as msg, i (i)}
        <div class={`bubble ${msg.role}`}>
          {#if msg.role === "assistant"}
            {#if thinking && !msg.content}
              <div class="thinking">
                <div class="thinking-dots">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
                <span class="thinking-label">
                  Анализирую рынок{thinkElapsed > 0 ? ` · ${formatThinkTime(thinkElapsed)}` : ""}
                </span>
              </div>
            {:else}
              <div class="md">{@html marked.parse(msg.content || "")}</div>
              {#if msg.streaming && msg.content}
                <span class="cursor">▍</span>
              {/if}
            {/if}
          {:else}
            <div class="user-text">{msg.content}</div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="composer-wrap">
    <div class="composer">
      <textarea
        bind:value={input}
        onkeydown={onKeydown}
        placeholder="Что по {symbol}?"
        rows="1"
        disabled={streaming}
      ></textarea>
      {#if streaming}
        <button class="action stop" onclick={stop} title="Остановить">
          <span class="square"></span>
        </button>
      {:else}
        <button class="action send" onclick={send} disabled={!input.trim()} title="Отправить">
          ↑
        </button>
      {/if}
    </div>
    <div class="hint-line">
      <kbd>Enter</kbd> отправить · <kbd>Shift+Enter</kbd> новая строка
    </div>
  </div>
</div>

<style>
  .chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 28px 32px 16px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .empty {
    margin: auto;
    text-align: center;
    color: var(--text-dim);
    max-width: 460px;
    padding-bottom: 60px;
  }
  .empty-icon {
    display: flex;
    justify-content: center;
    gap: 14px;
    margin-bottom: 22px;
  }
  .empty-icon .eye {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 24px var(--accent-glow);
    animation: pulse 2.4s ease-in-out infinite;
  }
  .empty-icon .eye:nth-child(2) {
    animation-delay: 0.4s;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  .empty-title {
    font-size: 22px;
    color: var(--text);
    font-weight: 600;
    margin-bottom: 10px;
    letter-spacing: -0.01em;
  }
  .empty-hint {
    font-size: 13.5px;
    line-height: 1.6;
    margin-bottom: 26px;
  }
  .empty-hint strong {
    color: var(--accent-2);
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .suggestion {
    background: var(--bg-elev);
    color: var(--text-dim);
    border: 1px solid var(--border);
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 12px;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    transition: all 0.18s ease;
  }
  .suggestion:hover {
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.14), rgba(95, 175, 255, 0.06));
    color: var(--text);
    border-color: rgba(124, 92, 255, 0.35);
    box-shadow: 0 4px 16px rgba(124, 92, 255, 0.15);
    transform: translateY(-1px);
  }

  .bubble {
    max-width: 86%;
    padding: 14px 18px;
    border-radius: 18px;
    line-height: 1.65;
    animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: 13.5px;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .bubble.user {
    align-self: flex-end;
    background: linear-gradient(135deg, var(--accent), #6a4cef);
    color: white;
    border-bottom-right-radius: 6px;
    box-shadow:
      0 6px 24px rgba(124, 92, 255, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
  .bubble.user .user-text {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .bubble.assistant {
    align-self: flex-start;
    background: var(--bg-elev);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--border);
    color: var(--text);
    border-bottom-left-radius: 6px;
  }

  .thinking {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }
  .thinking-dots {
    display: flex;
    gap: 5px;
  }
  .thinking-dots .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: thinkBounce 1.4s ease-in-out infinite;
  }
  .thinking-dots .dot:nth-child(2) { animation-delay: 0.16s; }
  .thinking-dots .dot:nth-child(3) { animation-delay: 0.32s; }
  @keyframes thinkBounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }
  .thinking-label {
    font-size: 13px;
    color: var(--text-dim);
    font-style: italic;
  }

  .cursor {
    display: inline-block;
    color: var(--accent);
    animation: blink 1s steps(2) infinite;
    margin-left: 2px;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }

  .composer-wrap {
    padding: 14px 32px 18px;
    flex-shrink: 0;
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    background: var(--bg-elev);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 8px 8px 8px 16px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .composer:focus-within {
    border-color: rgba(124, 92, 255, 0.4);
    box-shadow: 0 0 0 4px rgba(124, 92, 255, 0.08);
  }
  textarea {
    flex: 1;
    resize: none;
    font-size: 13.5px;
    line-height: 1.5;
    background: transparent;
    border: none;
    padding: 10px 0;
    max-height: 180px;
    backdrop-filter: none;
  }
  textarea:focus {
    box-shadow: none;
    border: none;
  }
  .action {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .action.send {
    background: linear-gradient(135deg, var(--accent), #6a4cef);
    border-color: rgba(124, 92, 255, 0.5);
    color: white;
    box-shadow: 0 4px 14px rgba(124, 92, 255, 0.3);
  }
  .action.send:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.1);
  }
  .action.send:disabled {
    background: var(--bg-elev-2);
    border-color: var(--border);
    color: var(--text-faint);
    box-shadow: none;
  }
  .action.stop {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: var(--red);
  }
  .action.stop:hover {
    background: var(--red);
    color: white;
    border-color: var(--red);
  }
  .action .square {
    width: 10px;
    height: 10px;
    background: currentColor;
    border-radius: 2px;
  }
  .hint-line {
    margin-top: 8px;
    text-align: center;
    font-size: 10.5px;
    color: var(--text-faint);
  }
  kbd {
    font-family: inherit;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    color: var(--text-dim);
  }
</style>
