mod navigation;

use navigation::{classify_navigation, NavigationDecision};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    utils::config::WebviewUrl,
    webview::{NewWindowResponse, WebviewWindowBuilder},
    Manager,
};
use tauri_plugin_opener::OpenerExt;

const PRODUCTION_URL: &str = "https://qurabia.com/";
const HOST_URL: &str = "https://qurabia.com/host/";
const DISPLAY_URL: &str = "https://qurabia.com/display/";
const DISPLAY_WINDOW_LABEL: &str = "display";

#[derive(Debug, Eq, PartialEq)]
enum MenuDestination {
    Main(&'static str),
    Display(&'static str),
}

fn menu_destination(id: &str) -> Option<MenuDestination> {
    match id {
        "host" => Some(MenuDestination::Main(HOST_URL)),
        "display" => Some(MenuDestination::Display(DISPLAY_URL)),
        _ => None,
    }
}

fn toggle_fullscreen(window: &tauri::WebviewWindow) {
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!fullscreen);
}

fn navigate_main(app: &tauri::AppHandle, url: &str) {
    if let (Some(window), Ok(url)) = (app.get_webview_window("main"), url.parse()) {
        let _ = window.navigate(url);
        let _ = window.set_focus();
    }
}

fn open_display_window(app: &tauri::AppHandle, url: &str) -> tauri::Result<()> {
    let url = url.parse().expect("desktop display URL must be valid");
    if let Some(window) = app.get_webview_window(DISPLAY_WINDOW_LABEL) {
        window.navigate(url)?;
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let navigation_handle = app.clone();
    let new_window_handle = app.clone();
    let _ = WebviewWindowBuilder::new(app, DISPLAY_WINDOW_LABEL, WebviewUrl::External(url))
        .title("تحدي - شاشة العرض")
        .inner_size(1280.0, 720.0)
        .min_inner_size(960.0, 540.0)
        .resizable(true)
        .maximizable(true)
        .minimizable(true)
        .focused(true)
        .center()
        .initialization_script(include_str!("offline-overlay.js"))
        .on_navigation(move |url| match classify_navigation(url) {
            NavigationDecision::Internal => true,
            NavigationDecision::Retry => {
                retry_production(navigation_handle.clone(), DISPLAY_WINDOW_LABEL, DISPLAY_URL);
                false
            }
            NavigationDecision::Fullscreen => {
                if let Some(window) = navigation_handle.get_webview_window(DISPLAY_WINDOW_LABEL) {
                    toggle_fullscreen(&window);
                }
                false
            }
            NavigationDecision::External => {
                let _ = navigation_handle
                    .opener()
                    .open_url(url.as_str(), None::<&str>);
                false
            }
            NavigationDecision::Blocked => false,
        })
        .on_new_window(move |url, _| {
            if classify_navigation(&url) == NavigationDecision::External {
                let _ = new_window_handle
                    .opener()
                    .open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .build()?;

    Ok(())
}

fn retry_production(app: tauri::AppHandle, window_label: &'static str, target_url: &'static str) {
    tauri::async_runtime::spawn_blocking(move || {
        use std::{net::ToSocketAddrs, time::Duration};

        let reachable = ("qurabia.com", 443)
            .to_socket_addrs()
            .ok()
            .and_then(|mut addresses| {
                addresses
                    .any(|address| {
                        std::net::TcpStream::connect_timeout(&address, Duration::from_secs(4))
                            .is_ok()
                    })
                    .then_some(())
            })
            .is_some();

        if reachable {
            if let (Some(window), Ok(url)) =
                (app.get_webview_window(window_label), target_url.parse())
            {
                let _ = window.navigate(url);
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let reload = MenuItem::with_id(app, "reload", "إعادة تحميل", true, Some("Ctrl+R"))?;
            let fullscreen = MenuItem::with_id(app, "fullscreen", "ملء الشاشة", true, Some("F11"))?;
            let host = MenuItem::with_id(app, "host", "لوحة المضيف", true, Some("Ctrl+Shift+H"))?;
            let display = MenuItem::with_id(
                app,
                "display",
                "شاشة العرض في نافذة مستقلة",
                true,
                Some("Ctrl+Shift+D"),
            )?;
            let view = Submenu::with_items(app, "عرض", true, &[&reload, &fullscreen])?;
            let live = Submenu::with_items(app, "البث", true, &[&host, &display])?;
            app.set_menu(Menu::with_items(app, &[&view, &live])?)?;

            let navigation_handle = app.handle().clone();
            let new_window_handle = app.handle().clone();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("تحدي")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .resizable(true)
                .maximizable(true)
                .minimizable(true)
                .fullscreen(false)
                .center()
                .initialization_script(include_str!("offline-overlay.js"))
                .on_navigation(move |url| match classify_navigation(url) {
                    NavigationDecision::Internal => true,
                    NavigationDecision::Retry => {
                        retry_production(navigation_handle.clone(), "main", PRODUCTION_URL);
                        false
                    }
                    NavigationDecision::Fullscreen => {
                        if let Some(window) = navigation_handle.get_webview_window("main") {
                            toggle_fullscreen(&window);
                        }
                        false
                    }
                    NavigationDecision::External => {
                        let _ = navigation_handle
                            .opener()
                            .open_url(url.as_str(), None::<&str>);
                        false
                    }
                    NavigationDecision::Blocked => false,
                })
                .on_new_window(move |url, _| {
                    if classify_navigation(&url) == NavigationDecision::External {
                        let _ = new_window_handle
                            .opener()
                            .open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                })
                .build()?;

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "reload" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.location.reload()");
                }
            }
            "fullscreen" => {
                if let Some(window) = app.get_webview_window("main") {
                    toggle_fullscreen(&window);
                }
            }
            id => match menu_destination(id) {
                Some(MenuDestination::Main(url)) => navigate_main(app, url),
                Some(MenuDestination::Display(url)) => {
                    if let Err(error) = open_display_window(app, url) {
                        eprintln!("failed to open Tahaddi display window: {error}");
                    }
                }
                None => {}
            },
        })
        .run(tauri::generate_context!())
        .expect("failed to run Tahaddi desktop");
}

#[cfg(test)]
mod tests {
    use super::{menu_destination, MenuDestination};

    #[test]
    fn desktop_menu_opens_the_host_and_second_display_routes() {
        assert_eq!(
            menu_destination("host"),
            Some(MenuDestination::Main("https://qurabia.com/host/"))
        );
        assert_eq!(
            menu_destination("display"),
            Some(MenuDestination::Display("https://qurabia.com/display/"))
        );
        assert_eq!(menu_destination("unknown"), None);
    }
}
