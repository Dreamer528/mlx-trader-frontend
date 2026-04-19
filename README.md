# MLX Trader Frontend

Mac App (Tauri 2 + Svelte 5) for the MLX Trader AI crypto trading system.

Connects to the backend API from env:

```bash
VITE_BACKEND_URL=http://127.0.0.1:8765
```

Defaults to `https://quantorix-prime.ru/mlx` if `VITE_BACKEND_URL` is not set.

## Setup

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

Backend repo: [Dreamer528/MLX-trading-system](https://github.com/Dreamer528/MLX-trading-system)
