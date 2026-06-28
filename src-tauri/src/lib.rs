// DevPilot Tauri main entry point.
//
// This file implements:
//   1. Sidecar backend spawning (port 3001)
//   2. System tray icon with click handler
//   3. Compact popup window anchored to tray icon position
//   4. Hide-to-tray on main window close (instead of quitting)
//   5. Native OS notifications for crash events (received from backend WS
//      via a Tauri command invoked from the frontend)

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent,
    Emitter,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent, TrayIconId},
    webview::WebviewUrl,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

// App state — holds the last known cursor position for tray popup placement
struct AppState {
    last_cursor_pos: Mutex<(i32, i32)>,
}

#[derive(Serialize, Clone)]
struct NotificationPayload {
    title: String,
    body: String,
    service_id: String,
    kind: String,
}

// ---------------------------------------------------------------------------
// Tray popup window management
// ---------------------------------------------------------------------------

fn show_tray_popup(app: &AppHandle, x: i32, y: i32) -> tauri::Result<()> {
    let popup_label = "tray-popup";

    // If the popup already exists, toggle it
    if let Some(window) = app.get_webview_window(popup_label) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            position_popup(&window, x, y)?;
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(());
    }

    // Create a new borderless always-on-top popup window
    let window = WebviewWindowBuilder::new(
        app,
        popup_label,
        WebviewUrl::App("/?tray=1".into()),
    )
    .title("")
    .inner_size(380.0, 520.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(true)
    .shadow(true)
    .build()?;

    position_popup(&window, x, y)?;
    Ok(())
}

fn position_popup(window: &WebviewWindow, x: i32, y: i32) -> tauri::Result<()> {
    // Position the popup near the cursor (or tray icon).
    // The popup is 380x520; nudge it so it stays on-screen.
    // On macOS the cursor is already near the menu bar (top-right), so the
    // popup appears below+left of the cursor.
    // On Linux/Windows the tray is usually bottom-right, so the popup appears
    // above+left of the cursor.
    let popup_w = 380.0;
    let popup_h = 520.0;

    // Get the monitor that contains the cursor so we can clamp
    let monitor = window.current_monitor()?;
    if let Some(monitor) = monitor {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let mon_right = monitor_pos.x as f64 + monitor_size.width as f64;
        let mon_bottom = monitor_pos.y as f64 + monitor_size.height as f64;

        let mut new_x = x as f64 - popup_w - 8.0;
        let mut new_y = y as f64 + 8.0;

        // If popup would go off left edge, put it to the right of cursor
        if new_x < monitor_pos.x as f64 {
            new_x = x as f64 + 8.0;
        }
        // If popup would go off bottom, put it above the cursor
        if new_y + popup_h > mon_bottom {
            new_y = y as f64 - popup_h - 8.0;
        }
        // Clamp
        if new_y < monitor_pos.y as f64 {
            new_y = monitor_pos.y as f64 + 8.0;
        }
        if new_x + popup_w > mon_right {
            new_x = mon_right - popup_w - 8.0;
        }

        let _ = window.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition { x: new_x as i32, y: new_y as i32 },
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tray icon + menu
// ---------------------------------------------------------------------------

fn build_tray_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let show_main = MenuItemBuilder::with_id("show_main", "Open Mir").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Mir").accelerator("Cmd+Q").build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;

    Menu::with_items(app, &[&show_main, &sep, &quit])
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;

    let _tray = TrayIconBuilder::with_id(TrayIconId::new("main"))
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Mir — click to manage services")
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show_main" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click → show popup window
            // Right-click → show native menu (default behavior)
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                rect: _,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_tray_popup(app, position.x as i32, position.y as i32);
            }
        })
        .build(app)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Frontend commands — called from JavaScript via invoke()
// ---------------------------------------------------------------------------

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn hide_tray_popup(app: AppHandle) {
    if let Some(window) = app.get_webview_window("tray-popup") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn show_native_notification(
    app: AppHandle,
    payload: NotificationPayload,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&payload.title)
        .body(&payload.body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            last_cursor_pos: Mutex::new((0, 0)),
        })
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            hide_tray_popup,
            show_native_notification,
            quit_app,
        ])
        .setup(|app| {
            // 1. Spawn the backend sidecar on app launch
            #[cfg(desktop)]
            {
                use tauri_plugin_shell::ShellExt;
                let sidecar = app.shell().sidecar("devpilot-backend")
                    .expect("failed to find devpilot-backend sidecar");
                let (mut rx, _child) = sidecar.spawn()
                    .expect("failed to spawn devpilot-backend sidecar");

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                log::info!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                log::error!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                            _ => {}
                        }
                    }
                });
            }

            // 2. Set up the system tray
            setup_tray(app.handle())?;

            // 3. Hide-to-tray on main window close (don't quit)
            let main_window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent the window from actually closing — hide it instead
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DevPilot");
}
