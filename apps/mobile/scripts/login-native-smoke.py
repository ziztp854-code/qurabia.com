#!/usr/bin/env python3
"""Credentialed Android test, restricted to the isolated local HTTPS fixture.

No UI dumps, screenshots, credentials, cookie values, tokens or raw logs are
archived. Temporary on-device UIAutomator XML is removed during cleanup. The only report contains phase names, booleans and server counters.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import re
import ssl
import stat
import sys
import time
import urllib.request

PACKAGE = "com.qurabia.tahaddi"
ORIGIN = "https://localhost:3443"


def load_credentials(filename: pathlib.Path) -> dict:
    metadata = filename.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise ValueError("Credentials must be a private regular file")
    account = json.loads(filename.read_text())
    if account.get("origin") != ORIGIN:
        raise ValueError("Only the isolated local HTTPS login fixture is allowed")
    if not re.fullmatch(r"mobile_login_[a-f0-9-]{36}\+ci@example\.test", account.get("email", "")):
        raise ValueError("Only the dedicated fixture account is allowed")
    password = account.get("password", "")
    if not re.fullmatch(r"MobileAa42!\+%25=&[a-f0-9-]{36}", password):
        raise ValueError("Fixture password must exercise form encoding")
    return account


def load_device():
    spec = importlib.util.spec_from_file_location(
        "login_native_device", pathlib.Path(__file__).with_name("android-native-smoke.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def counters(ca: str) -> dict:
    context = ssl.create_default_context(cafile=ca)
    with urllib.request.urlopen(ORIGIN + "/__mobile_login_evidence",
                                context=context, timeout=20) as response:
        value = json.loads(response.read(8192))
    keys = ("csrf_ok", "credentials_ok", "credentials_rejected",
            "authenticated_sessions", "anonymous_sessions", "foreign_sessions",
            "signout_ok", "rooms_ok")
    if not isinstance(value, dict) or set(value) != set(keys) or any(
            type(value[key]) is not int or value[key] < 0 for key in keys):
        raise ValueError("Unexpected fixture evidence")
    if value["foreign_sessions"]:
        raise ValueError("Unexpected session identity")
    return value


def wait_counter(ca: str, key: str, previous: int, timeout: float = 30) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = counters(ca)
        if value[key] > previous:
            return value
        time.sleep(1)
    raise RuntimeError("Expected isolated server operation was not observed")



EMPTY_ERROR = "أدخل البريد الإلكتروني وكلمة المرور."
REJECTED_ERROR = "لم يقبل الخادم تسجيل الدخول بهذه البيانات. راجع البريد وكلمة المرور، أو حاول لاحقًا."


def keyboard_state(device) -> str:
    # Inspect in memory only: dumpsys can contain editor metadata.
    flags = re.findall(r"\b(?:mInputShown|mIsInputViewShown)=(true|false)\b",
                       device.adb("shell", "dumpsys", "input_method").stdout)
    return "shown" if "true" in flags else "hidden" if flags else "unknown"


def hide_keyboard_if_shown(device) -> dict:
    before = keyboard_state(device)
    sent_back = before == "shown"
    if sent_back:
        device.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    # BACK without a visible IME can exit the app. Never guess for unknown state.
    return {"before": before, "sent_back": sent_back}


def safe_ui_snapshot(device, module, email: str, expected_password_length: int) -> dict:
    xml = device.ui()
    controls = {}
    nodes = {}
    for test_id in ("login-email", "login-password", "login-submit"):
        node = module.find_node(xml, test_id)
        nodes[test_id] = node
        controls[test_id] = {
            "present": node is not None,
            "enabled": node is not None and node.attrib.get("enabled") == "true",
            "focused": node is not None and node.attrib.get("focused") == "true",
            "clickable": node is not None and node.attrib.get("clickable") == "true",
            "visible": node is not None and node.attrib.get("visible-to-user", "true") != "false",
        }
    email_node, password_node = nodes["login-email"], nodes["login-password"]
    password_length = len(password_node.attrib.get("text", "")) if password_node is not None else 0
    labels = module.scoped_error_labels(xml, "login-error")
    notice = ("empty_credentials" if EMPTY_ERROR in labels else
              "invalid_credentials" if REJECTED_ERROR in labels else
              "unrecognized" if labels else "none")
    return {
        "process_alive": device.adb("shell", "pidof", PACKAGE, check=False).returncode == 0,
        "email_matches": email_node is not None and email_node.attrib.get("text", "") == email,
        "password_display_length": password_length,
        "password_display_length_matches": password_length == expected_password_length,
        "notice_kind": notice, "controls": controls,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--ca", required=True)
    parser.add_argument("--reports", default="android-reports/login")
    parser.add_argument("--serial", default=os.environ.get("ANDROID_SERIAL"))
    args = parser.parse_args()
    report = {
        "status": "failed", "source_sha": os.environ.get("GITHUB_SHA"),
        "scope": "real native HTTPS + NextAuth + isolated PostgreSQL account",
        "server_mode": "Next development, explicit VITEST=1 local URL preservation; nonproduction limiter",
        "checks": {}, "phase": "fixture",
        "limitations": [
            "Separate test APK trusts an ephemeral localhost CA; distributed production APK does not.",
            "Emulator authentication does not prove physical-device or production deployment behavior.",
            "Voice/media, production rate limiter, real-user credentials and production writes are not exercised.",
        ],
    }
    directory = pathlib.Path(args.reports)
    directory.mkdir(parents=True, exist_ok=True)
    device = None
    try:
        account = load_credentials(pathlib.Path(args.credentials))
        module = load_device()
        device = module.Device(args.serial)
        if device.adb("shell", "getprop", "ro.kernel.qemu").stdout.strip() != "1":
            raise ValueError("Credentialed clean-install test requires an emulator")
        initial = counters(args.ca)
        report["counter_snapshots"] = {"initial": initial}
        report["ui_snapshots"] = {}
        report["keyboard_actions"] = {}

        def snapshot(label: str, expected_length: int) -> dict:
            report["phase"] = label
            state = safe_ui_snapshot(device, module, account["email"], expected_length)
            report["ui_snapshots"][label] = state
            return state

        def hide(label: str):
            report["keyboard_actions"][label] = hide_keyboard_if_shown(device)

        report["phase"] = "clean_install"
        device.adb("reverse", "--remove-all")
        # No Metro connection: only the real isolated HTTPS backend is forwarded.
        device.adb("reverse", "tcp:3443", "tcp:3443")
        device.adb("install", "-r", args.apk)
        device.adb("shell", "pm", "clear", PACKAGE)
        device.adb("logcat", "-c")
        device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        device.wait_node("login-email")
        if device.connection_status(timeout=60)["state"] != "online":
            raise RuntimeError("Native isolated HTTPS connection did not succeed")
        report["checks"]["native_isolated_https"] = True
        report["phase"] = "rejected_credentials"
        # Values stay in memory and subprocess arguments, never reports or console.
        device.reveal_node("login-email")
        device.enter("login-email", account["email"])
        snapshot("wrong_email_entered", 0)
        hide("after_email")
        device.reveal_node("login-password")
        device.enter("login-password", account["password"] + "-incorrect")
        snapshot("wrong_password_entered", len(account["password"] + "-incorrect"))
        hide("after_wrong_password")
        device.reveal_node("login-submit")
        ready = snapshot("wrong_submit_ready", len(account["password"] + "-incorrect"))
        report["counter_snapshots"]["before_wrong_submit"] = counters(args.ca)
        if not ready["email_matches"] or not ready["process_alive"] or not all(
                ready["controls"]["login-submit"][key] for key in ("present", "enabled", "visible")):
            raise RuntimeError("Native login controls were not ready for credential submission")
        device.tap("login-submit")
        snapshot("wrong_submit_tapped", len(account["password"] + "-incorrect"))
        report["counter_snapshots"]["after_wrong_submit"] = counters(args.ca)
        rejected = wait_counter(args.ca, "credentials_rejected", initial["credentials_rejected"])
        report["phase"] = "rejected_credentials"
        expected_error = REJECTED_ERROR
        if not device.validation_status(expected_error, timeout=30)["matched"]:
            raise RuntimeError("Rejected login did not show the required safe Arabic error")
        device.reveal_node("login-email")
        email_node = module.find_node(device.ui(), "login-email")
        if email_node is None or email_node.attrib.get("text", "") != account["email"]:
            raise RuntimeError("Rejected login did not preserve the email field")
        if rejected["authenticated_sessions"] != initial["authenticated_sessions"]:
            raise RuntimeError("Incorrect password unexpectedly authenticated a session")
        report["checks"]["wrong_password_rejected_with_safe_arabic_error"] = True
        report["checks"]["email_preserved_after_rejected_login"] = True
        report["phase"] = "credential_submit"
        device.reveal_node("login-password")
        device.tap("login-password")
        device.adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
        device.adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * 128))
        device.enter("login-password", account["password"])
        snapshot("correct_password_entered", len(account["password"]))
        hide("after_correct_password")
        device.reveal_node("login-submit")
        ready = snapshot("correct_submit_ready", len(account["password"]))
        report["counter_snapshots"]["before_correct_submit"] = counters(args.ca)
        if not ready["email_matches"] or not ready["process_alive"] or not all(
                ready["controls"]["login-submit"][key] for key in ("present", "enabled", "visible")):
            raise RuntimeError("Native login controls were not ready for credential submission")
        device.tap("login-submit")
        report["phase"] = "correct_submit_tapped"
        report["counter_snapshots"]["after_correct_submit"] = counters(args.ca)
        device.wait_node("rooms-list", timeout=90)
        signed_in = wait_counter(args.ca, "authenticated_sessions", initial["authenticated_sessions"])
        if signed_in["credentials_ok"] <= initial["credentials_ok"]:
            raise RuntimeError("Native credentials POST was not observed")
        if signed_in["csrf_ok"] <= initial["csrf_ok"]:
            raise RuntimeError("Native CSRF acquisition was not observed")
        wait_counter(args.ca, "rooms_ok", initial["rooms_ok"])
        report["checks"]["real_csrf_credentials_session_and_rooms"] = True
        report["phase"] = "force_stop_reopen"
        before_reopen = counters(args.ca)
        device.adb("shell", "am", "force-stop", PACKAGE)
        # Deliberately retain app data and SecureStore. A new native process must
        # restore the cookie and the server must validate the same dedicated user.
        device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        device.wait_node("rooms-list", timeout=90)
        reopened = wait_counter(args.ca, "authenticated_sessions", before_reopen["authenticated_sessions"])
        if reopened["credentials_ok"] != before_reopen["credentials_ok"]:
            raise RuntimeError("App reopened by reauthenticating instead of restoring its session")
        report["checks"]["secure_session_survives_process_restart"] = True
        report["phase"] = "logout"
        device.tap("nav-profile")
        device.tap("settings-logout")
        device.wait_node("login-email", timeout=60)
        logged_out = wait_counter(args.ca, "signout_ok", reopened["signout_ok"])
        wait_counter(args.ca, "anonymous_sessions", reopened["anonymous_sessions"])
        report["checks"]["real_signout_and_anonymous_session"] = True
        report["phase"] = "logout_persistence"
        before_logout_reopen = counters(args.ca)
        device.adb("shell", "am", "force-stop", PACKAGE)
        device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        device.wait_node("login-email", timeout=60)
        if device.connection_status(timeout=60)["state"] != "online":
            raise RuntimeError("Native anonymous session after reopen did not succeed")
        final = wait_counter(args.ca, "anonymous_sessions", before_logout_reopen["anonymous_sessions"])
        if final["authenticated_sessions"] != before_logout_reopen["authenticated_sessions"]:
            raise RuntimeError("Logged-out session returned after reopen")
        report["checks"]["logout_survives_process_restart"] = True
        errors = device.adb("logcat", "-d", "-s", "AndroidRuntime:E", "ReactNativeJS:E", "*:S").stdout
        if re.search(r"FATAL EXCEPTION|Unable to load script|Could not connect to development server", errors):
            raise RuntimeError("Standalone native runtime failure")
        report["checks"]["standalone_runtime"] = True
        report["server_counters"] = final
        report["phase"] = "complete"
        report["status"] = "passed"
        return 0
    except Exception:
        if device is not None and "account" in locals() and "module" in locals():
            try:
                report.setdefault("ui_snapshots", {})["failure_observed"] = safe_ui_snapshot(
                    device, module, account["email"], len(account["password"]))
            except Exception:
                report.setdefault("ui_snapshots", {})["failure_observed"] = {"ui_readable": False}
        # Exception text can contain native command arguments or server data.
        report["error"] = "Isolated native login check failed at the recorded phase"
        return 1
    finally:
        try:
            report["server_counters"] = counters(args.ca)
        except Exception:
            pass
        if device is not None:
            # Remove the test APK's session/credential UI after collecting only
            # safe counters. No screenshot/XML/log upload from credentialed runs.
            try:
                device.adb("shell", "rm", "-f", "/sdcard/tahaddi-native-window.xml", check=False)
                device.adb("shell", "am", "force-stop", PACKAGE, check=False)
                device.adb("shell", "pm", "clear", PACKAGE, check=False)
            except Exception:
                pass
        (directory / "login-result.json").write_text(json.dumps(report, indent=2) + "\n")
        print("ISOLATED_NATIVE_LOGIN " + json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    sys.exit(main())
