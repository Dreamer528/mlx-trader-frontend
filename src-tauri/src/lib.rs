use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, State};

/// Holds the spawned Python backend process so we can kill it on shutdown.
struct BackendHandle(Mutex<Option<Child>>);

const PROJECT_DIR: &str = "/Users/vladislav/Documents/GitHub/MLX-trading-system";
const UV_BIN: &str = "/opt/homebrew/bin/uv";
const BACKEND_PORT: &str = "8765";

fn spawn_backend() -> Result<Child, String> {
    // GUI apps on macOS inherit a minimal PATH, so we hardcode the brew uv
    // location and explicitly set PATH for any child processes uv itself
    // may invoke. Run the FastAPI module directly via `python -m` instead of
    // the `mlx-trader serve` console script — the script depends on an
    // editable install entry that uv sync sometimes invalidates, while
    // `python -m mlx_trader.app.backend` works as long as PYTHONPATH points
    // at our `src` directory, which we set explicitly via env.
    let child = Command::new(UV_BIN)
        .args([
            "run",
            "--project",
            PROJECT_DIR,
            "python",
            "-m",
            "mlx_trader.app.backend",
        ])
        .current_dir(PROJECT_DIR)
        .env(
            "PATH",
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        )
        .env("PYTHONPATH", format!("{}/src", PROJECT_DIR))
        // Send backend logs to a file in /tmp so we can debug after the GUI
        // starts the model. Tail with: tail -f /tmp/mlx-trader-backend.log
        .stdout(
            std::fs::File::create("/tmp/mlx-trader-backend.log")
                .map(Stdio::from)
                .unwrap_or_else(|_| Stdio::null()),
        )
        .stderr(
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/tmp/mlx-trader-backend.log")
                .map(Stdio::from)
                .unwrap_or_else(|_| Stdio::null()),
        )
        .spawn()
        .map_err(|e| format!("Failed to spawn backend: {}", e))?;
    Ok(child)
}

#[tauri::command]
fn get_backend_url() -> String {
    format!("http://127.0.0.1:{}", BACKEND_PORT)
}

#[tauri::command]
fn backend_log_path() -> String {
    "/tmp/mlx-trader-backend.log".to_string()
}

#[tauri::command]
fn restart_backend(state: State<BackendHandle>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let child = spawn_backend()?;
    *guard = Some(child);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendHandle(Mutex::new(None)))
        .setup(|app| {
            // Spawn the Python backend immediately when the app boots.
            match spawn_backend() {
                Ok(child) => {
                    let state: State<BackendHandle> = app.state();
                    *state.0.lock().unwrap() = Some(child);
                    eprintln!("[mlx-trader] backend spawned, log: /tmp/mlx-trader-backend.log");
                }
                Err(e) => {
                    eprintln!("[mlx-trader] FAILED to spawn backend: {}", e);
                }
            }

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            backend_log_path,
            restart_backend
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill the Python backend when the GUI exits so we don't leak the
            // 5 GB model in RAM after the user quits.
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                let state: State<BackendHandle> = app_handle.state();
                let child_opt = {
                    let mut guard = state.0.lock().unwrap();
                    guard.take()
                };
                if let Some(mut child) = child_opt {
                    eprintln!("[mlx-trader] killing backend pid={}", child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
