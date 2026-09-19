use tauri::Url;

#[derive(Debug, Eq, PartialEq)]
pub enum NavigationDecision {
    Internal,
    Retry,
    Fullscreen,
    External,
    Blocked,
}

pub fn classify_navigation(url: &Url) -> NavigationDecision {
    if !url.username().is_empty() || url.password().is_some() {
        return NavigationDecision::Blocked;
    }

    let host = url.host_str().unwrap_or_default();
    if (url.scheme() == "https" && host == "qurabia.com")
        || (["http", "https"].contains(&url.scheme()) && host == "tauri.localhost")
        || (url.scheme() == "tauri" && host == "localhost")
    {
        return NavigationDecision::Internal;
    }

    if url.scheme() == "tahaddi-retry" && host == "production" {
        return NavigationDecision::Retry;
    }

    if url.scheme() == "tahaddi-fullscreen" && host == "toggle" {
        return NavigationDecision::Fullscreen;
    }

    const EXTERNAL_HOSTS: &[&str] = &[
        "accounts.google.com",
        "discord.com",
        "instagram.com",
        "www.discord.com",
        "www.instagram.com",
        "www.youtube.com",
        "x.com",
        "youtube.com",
    ];

    if url.scheme() == "https" && EXTERNAL_HOSTS.contains(&host) {
        NavigationDecision::External
    } else {
        NavigationDecision::Blocked
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_navigation, NavigationDecision};
    use tauri::Url;

    fn decision(url: &str) -> NavigationDecision {
        classify_navigation(&Url::parse(url).expect("valid test URL"))
    }

    #[test]
    fn allows_only_tahaddi_and_the_bundled_recovery_page_inside_the_webview() {
        assert_eq!(
            decision("https://qurabia.com/games/"),
            NavigationDecision::Internal
        );
        assert_eq!(
            decision("http://tauri.localhost/"),
            NavigationDecision::Internal
        );
        assert_eq!(
            decision("https://tauri.localhost/"),
            NavigationDecision::Internal
        );
        assert_eq!(decision("tauri://localhost/"), NavigationDecision::Internal);
        assert_eq!(
            decision("tahaddi-retry://production"),
            NavigationDecision::Retry
        );
        assert_eq!(
            decision("tahaddi-fullscreen://toggle"),
            NavigationDecision::Fullscreen
        );
    }

    #[test]
    fn opens_only_explicit_external_hosts_in_the_default_browser() {
        for url in [
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://instagram.com/",
            "https://x.com/",
            "https://discord.com/",
            "https://youtube.com/",
        ] {
            assert_eq!(decision(url), NavigationDecision::External, "{url}");
        }
    }

    #[test]
    fn blocks_untrusted_insecure_or_credential_bearing_urls() {
        for url in [
            "https://example.com/",
            "http://qurabia.com/",
            "https://evil.qurabia.com/",
            "https://user:pass@qurabia.com/",
            "file:///C:/Windows/System32/calc.exe",
            "javascript:alert(1)",
        ] {
            assert_eq!(decision(url), NavigationDecision::Blocked, "{url}");
        }
    }
}
