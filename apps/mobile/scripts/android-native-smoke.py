#!/usr/bin/env python3
"""Native Android QA against an installed APK, with no Metro or synthetic backend.

Default scope: clean emulator install, native login UI, local form validation,
read-only verified HTTPS requests, and raw startup diagnostics.
Authenticated QA is optional and requires an explicitly isolated HTTPS origin
and temporary account. It never targets the public production origin.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

PUBLIC_ORIGIN = "https://qurabia.com"
PACKAGE = "com.qurabia.tahaddi"
PRODUCTION_HOSTS = {"qurabia.com", "www.qurabia.com"}


def origin(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment):
        raise ValueError("QA origins must be bare HTTPS origins without credentials")
    return value.rstrip("/")


def authenticated_target(app_origin: str, qa_origin: str, email: str, password: str) -> str:
    if not qa_origin or not email or not password:
        raise ValueError("Optional authenticated QA requires an isolated origin and temporary credentials")
    target = origin(qa_origin)
    if urllib.parse.urlsplit(target).hostname.lower() in PRODUCTION_HOSTS:
        raise ValueError("Authenticated smoke refuses the production origin")
    if origin(app_origin) != target:
        raise ValueError("APK origin must match the explicitly isolated QA origin")
    for value in (email, password):
        if not re.fullmatch(r"[A-Za-z0-9@._+!-]{1,128}", value):
            raise ValueError("Use temporary ASCII QA credentials supported by adb input")
    return target


def center(node: ET.Element) -> tuple[int, int]:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not match:
        raise ValueError("UI node has no usable screen bounds")
    left, top, right, bottom = map(int, match.groups())
    if right <= left or bottom <= top:
        raise ValueError("UI node is not visible")
    return ((left + right) // 2, (top + bottom) // 2)


def find_node(xml: str, test_id: str) -> ET.Element | None:
    root = ET.fromstring(xml)
    for node in root.iter():
        resource = node.attrib.get("resource-id", "")
        if resource == test_id or resource.endswith("/" + test_id):
            try:
                center(node)
                return node
            except ValueError:
                pass
    return None


class Device:
    def __init__(self, serial: str | None):
        self.prefix = ["adb"] + (["-s", serial] if serial else [])

    def adb(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        result = subprocess.run(self.prefix + list(args), capture_output=True, text=True, timeout=45)
        if check and result.returncode:
            # Do not include arguments: input commands may contain temporary credentials.
            raise RuntimeError("An adb operation failed; inspect the saved diagnostics")
        return result

    def ui(self) -> str:
        self.adb("shell", "rm", "-f", "/sdcard/tahaddi-native-window.xml")
        self.adb("shell", "uiautomator", "dump", "/sdcard/tahaddi-native-window.xml")
        return self.adb("exec-out", "cat", "/sdcard/tahaddi-native-window.xml").stdout

    def wait_node(self, test_id: str, timeout: float = 45) -> ET.Element:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.adb("shell", "pidof", PACKAGE, check=False).returncode:
                raise RuntimeError("Application process exited during native smoke")
            try:
                node = find_node(self.ui(), test_id)
                if node is not None:
                    return node
            except (RuntimeError, ET.ParseError):
                pass
            time.sleep(1)
        raise RuntimeError("Timed out waiting for native UI: " + test_id)

    def tap(self, test_id: str):
        x, y = center(self.wait_node(test_id))
        self.adb("shell", "input", "tap", str(x), str(y))

    def enter(self, test_id: str, value: str):
        self.tap(test_id)
        self.adb("shell", "input", "text", shlex.quote(value))

    def hide_keyboard(self):
        self.adb("shell", "input", "keyevent", "KEYCODE_BACK")


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, base: str):
        self.allowed = urllib.parse.urlsplit(base)

    def redirect_request(self, request, fp, code, message, headers, new_url):
        target = urllib.parse.urlsplit(new_url)
        if target.scheme != "https" or target.netloc != self.allowed.netloc:
            raise RuntimeError("Read-only request attempted to leave the configured HTTPS origin")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def read_only_reachability(base: str) -> dict:
    results = {}
    opener = urllib.request.build_opener(SameOriginRedirect(base))
    for path, allowed in (("/api/auth/session", {200}), ("/api/voice/rooms", {200, 401})):
        request = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        started = time.monotonic()
        try:
            with opener.open(request, timeout=20) as response:
                status = response.status
                final_url = response.url
                payload = response.read(1_048_577)
        except urllib.error.HTTPError as error:
            status = error.code
            final_url = error.url
            payload = error.read(1_048_577)
        final = urllib.parse.urlsplit(final_url)
        initial = urllib.parse.urlsplit(base)
        if (final.scheme, final.netloc) != (initial.scheme, initial.netloc):
            raise RuntimeError("Read-only request left the configured HTTPS origin")
        if status not in allowed:
            raise RuntimeError("Read-only HTTPS endpoint returned unexpected status: " + path)
        if len(payload) > 1_048_576:
            raise RuntimeError("Read-only response exceeded the diagnostic size limit")
        json.loads(payload)
        results[path] = {
            "status": status,
            "elapsed_ms": round((time.monotonic() - started) * 1000, 1),
            "method": "GET",
            "tls_verification": True,
            "scope": "runner HTTPS reachability; not native authenticated integration",
        }
    return results


def diagnostics(device: Device, directory: pathlib.Path):
    commands = {
        "meminfo-startup.txt": ("shell", "dumpsys", "meminfo", PACKAGE),
        "cpuinfo-startup.txt": ("shell", "dumpsys", "cpuinfo"),
        "gfxinfo-startup.txt": ("shell", "dumpsys", "gfxinfo", PACKAGE),
        "emulator-api.txt": ("shell", "getprop", "ro.build.version.sdk"),
        "runtime-errors.txt": ("logcat", "-d", "-s", "AndroidRuntime:E", "ReactNativeJS:E", "*:S"),
    }
    for filename, command in commands.items():
        try:
            (directory / filename).write_text(device.adb(*command, check=False).stdout)
        except (OSError, subprocess.SubprocessError):
            pass
    try:
        (directory / "native-window.xml").write_text(device.ui())
    except (OSError, RuntimeError, subprocess.SubprocessError, ET.ParseError):
        pass
    try:
        capture = subprocess.run(device.prefix + ["exec-out", "screencap", "-p"],
                                 capture_output=True, timeout=20)
        if capture.returncode == 0:
            (directory / "native-window.png").write_bytes(capture.stdout)
    except (OSError, subprocess.SubprocessError):
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", default="apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk")
    parser.add_argument("--reports", default="android-reports/native")
    parser.add_argument("--serial", default=os.environ.get("ANDROID_SERIAL"))
    parser.add_argument("--app-origin", default=os.environ.get("TAHADDI_APP_ORIGIN", PUBLIC_ORIGIN))
    args = parser.parse_args()
    directory = pathlib.Path(args.reports)
    directory.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "failed",
        "scope": "native unauthenticated Android smoke with real read-only HTTPS reachability",
        "source_sha": os.environ.get("GITHUB_SHA"),
        "checks": {},
        "limitations": [
            "No physical Android device is exercised by this emulator script.",
            "Startup meminfo/cpuinfo/gfxinfo are diagnostic snapshots, not leak or battery measurements.",
            "Voice capture, SFU media, Bluetooth, calls, screen lock, network switching, 100-message delivery and long sessions are not tested here.",
        ],
    }
    device = Device(args.serial)
    try:
        base = origin(args.app_origin)
        qa_origin = os.environ.get("TAHADDI_QA_ORIGIN", "")
        email = os.environ.get("TAHADDI_QA_EMAIL", "")
        password = os.environ.get("TAHADDI_QA_PASSWORD", "")
        authenticated = bool(qa_origin or email or password)
        if authenticated:
            base = authenticated_target(base, qa_origin, email, password)
        report["origin"] = base
        if device.adb("shell", "getprop", "ro.kernel.qemu").stdout.strip() != "1":
            raise RuntimeError("This clean-install script requires an Android emulator")
        if not pathlib.Path(args.apk).is_file():
            raise RuntimeError("APK was not found")
        device.adb("logcat", "-c")
        device.adb("reverse", "--remove-all")
        device.adb("install", "-r", args.apk)
        device.adb("shell", "pm", "clear", PACKAGE)
        started = time.monotonic()
        launched = device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        (directory / "native-launch.txt").write_text(launched.stdout)
        for test_id in ("login-email", "login-password", "login-submit"):
            device.wait_node(test_id)
        report["checks"]["native_login_render"] = True
        report["login_render_observed_ms"] = round((time.monotonic() - started) * 1000, 1)
        device.tap("login-submit")
        device.wait_node("login-error")
        report["checks"]["empty_credentials_validation"] = True
        report["read_only_https"] = read_only_reachability(base)
        if authenticated:
            device.enter("login-email", email)
            device.enter("login-password", password)
            device.hide_keyboard()
            device.tap("login-submit")
            device.wait_node("rooms-list", timeout=60)
            report["checks"]["isolated_authenticated_room_listing"] = True
            device.tap("nav-profile")
            device.wait_node("settings-logout")
            device.tap("nav-rooms")
            device.wait_node("rooms-list")
            device.tap("nav-profile")
            device.tap("settings-logout")
            device.wait_node("login-submit")
            report["checks"]["authenticated_navigation_and_logout"] = True
            report["scope"] += "; temporary-account login/list/navigation/logout on explicitly isolated backend"
        else:
            report["checks"]["isolated_authenticated_flow"] = "not_run: no isolated HTTPS backend/account configured"
        diagnostics(device, directory)
        errors = device.adb("logcat", "-d", "-s", "AndroidRuntime:E", "ReactNativeJS:E", "*:S").stdout
        (directory / "runtime-errors.txt").write_text(errors)
        if device.adb("shell", "pidof", PACKAGE, check=False).returncode:
            raise RuntimeError("Application process exited before smoke completion")
        if re.search(r"FATAL EXCEPTION|Unable to load script|Could not connect to development server", errors):
            raise RuntimeError("Native runtime or standalone bundle failure found in diagnostics")
        report["checks"]["no_fatal_or_metro_error_observed"] = True
        report["status"] = "passed"
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, urllib.error.URLError) as error:
        # No credentials, request bodies or server payloads are written to the report.
        report["error"] = str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__
        return 1
    finally:
        diagnostics(device, directory)
        (directory / "native-smoke-result.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
