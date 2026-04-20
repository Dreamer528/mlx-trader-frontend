#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

const BACKEND_PORT: u16 = 8765;
const BACKEND_LOG_PATH: &str = "/tmp/mlx-trader-backend.log";

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
}

impl BackendState {
    fn store_child(&self, child: Child) {
        if let Ok(mut guard) = self.child.lock() {
            *guard = Some(child);
        }
    }

    fn kill_spawned_child(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn append_backend_log(message: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(BACKEND_LOG_PATH)
    {
        let _ = writeln!(file, "{message}");
    }
}

fn backend_port_is_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], BACKEND_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn is_repo_root(path: &Path) -> bool {
    path.join("pyproject.toml").is_file()
        && path.join("src/mlx_trader/cli.py").is_file()
        && path.join(".venv").is_dir()
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(root) = std::env::var("MLX_TRADER_ROOT") {
        candidates.push(PathBuf::from(root));
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    candidates
}

fn find_repo_root() -> Option<PathBuf> {
    for start in candidate_roots() {
        for dir in start.ancestors().take(14) {
            if is_repo_root(dir) {
                return Some(dir.to_path_buf());
            }
        }
    }
    None
}

fn backend_command(repo_root: &Path) -> Option<(PathBuf, Vec<String>)> {
    let mlx_trader = repo_root.join(".venv/bin/mlx-trader");
    if mlx_trader.is_file() {
        return Some((mlx_trader, vec!["serve".into()]));
    }

    for python_name in ["python", "python3"] {
        let python = repo_root.join(format!(".venv/bin/{python_name}"));
        if python.is_file() {
            return Some((
                python,
                vec!["-m".into(), "mlx_trader.cli".into(), "serve".into()],
            ));
        }
    }

    None
}

fn ensure_backend_started(state: &BackendState) -> Result<(), String> {
    if backend_port_is_open() {
        append_backend_log("Backend already reachable on 127.0.0.1:8765; skip autostart.");
        return Ok(());
    }

    let repo_root = find_repo_root().ok_or_else(|| {
        "Could not locate MLX Trading System repo root near the app bundle.".to_string()
    })?;
    let (program, args) = backend_command(&repo_root).ok_or_else(|| {
        "Could not find a runnable backend executable in .venv/bin.".to_string()
    })?;

    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(BACKEND_LOG_PATH)
        .map_err(|err| format!("Failed to open backend log at {BACKEND_LOG_PATH}: {err}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|err| format!("Failed to clone backend log handle: {err}"))?;

    append_backend_log(&format!(
        "Starting backend from {:?} with cwd {:?}",
        program, repo_root
    ));

    let mut command = Command::new(&program);
    command
        .args(&args)
        .current_dir(&repo_root)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    if repo_root.join("src").is_dir() {
        command.env("PYTHONPATH", repo_root.join("src"));
    }

    let child = command.spawn().map_err(|err| {
        format!(
            "Failed to launch backend with {:?} {:?}: {err}",
            program, args
        )
    })?;

    state.store_child(child);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState::default();

    tauri::Builder::default()
        .manage(backend_state)
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            if let Err(err) = ensure_backend_started(app.state::<BackendState>().inner()) {
                append_backend_log(&format!("Backend autostart failed: {err}"));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                app_handle
                    .state::<BackendState>()
                    .inner()
                    .kill_spawned_child();
            }
        });
}
