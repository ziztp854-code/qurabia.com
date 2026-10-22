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
import subprocess
import xml.etree.ElementTree as ET
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


HOST_COUNTER_KEYS = {
    "room_create_ok", "room_close_ok", "leave_while_active", "signout_while_active",
    "owned_rooms", "active_rooms", "closed_rooms", "closed_with_members", "inconsistent_rooms",
}


def validate_host_counters(value: object) -> dict:
    if (not isinstance(value, dict) or set(value) != HOST_COUNTER_KEYS or
            any(type(number) is not int or number < 0 for number in value.values())):
        raise ValueError("Unexpected isolated host evidence")
    if value["owned_rooms"] != value["active_rooms"] + value["closed_rooms"]:
        raise ValueError("Inconsistent isolated host counts")
    if value["closed_with_members"] > value["closed_rooms"]:
        raise ValueError("Inconsistent isolated closed-room membership")
    return value


def host_counters(ca: str) -> dict:
    context = ssl.create_default_context(cafile=ca)
    with urllib.request.urlopen(ORIGIN + "/__mobile_host_evidence",
                                context=context, timeout=20) as response:
        return validate_host_counters(json.loads(response.read(8192)))


def assert_host_state(value: dict, baseline: dict, created: int, closed: int):
    if (value["owned_rooms"] != baseline["owned_rooms"] + created or
            value["active_rooms"] != baseline["active_rooms"] + created - closed or
            value["closed_rooms"] != baseline["closed_rooms"] + closed or
            value["room_create_ok"] != baseline["room_create_ok"] + created or
            value["room_close_ok"] != baseline["room_close_ok"] + closed or
            value["closed_with_members"] != 0 or value["inconsistent_rooms"] != 0 or
            value["leave_while_active"] != baseline["leave_while_active"] or
            value["signout_while_active"] != baseline["signout_while_active"]):
        raise RuntimeError("Native host action was not confirmed by the isolated database")


def confirm_native_alert(device, module, title: str, button: str, timeout: float = 30):
    # Match only the expected Android alert and its real system button, in memory.
    from xml.etree import ElementTree as ET
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        root = ET.fromstring(device.ui())
        title_matches = any(node.attrib.get("resource-id") in {"android:id/alertTitle", PACKAGE + ":id/alertTitle"} and
                            node.attrib.get("text") == title for node in root.iter())
        if title_matches:
            for node in root.iter():
                if (node.attrib.get("resource-id") in {"android:id/button1", "android:id/button2",
                                                      "android:id/button3", PACKAGE + ":id/button1",
                                                      PACKAGE + ":id/button2", PACKAGE + ":id/button3"} and
                        node.attrib.get("text") == button and node.attrib.get("enabled") == "true"):
                    x, y = module.center(node)
                    device.adb("shell", "input", "tap", str(x), str(y))
                    return
        time.sleep(1)
    raise RuntimeError("Expected native host confirmation was not observed")


CREATE_HTTP_KEYS = {"room_create_attempts", "room_create_response_status", "room_create_server_errors"}


def create_http_evidence(ca: str) -> dict:
    context = ssl.create_default_context(cafile=ca)
    with urllib.request.urlopen(ORIGIN + "/__mobile_create_evidence",
                                context=context, timeout=20) as response:
        value = json.loads(response.read(8192))
    if (not isinstance(value, dict) or set(value) != CREATE_HTTP_KEYS or
            any(type(number) is not int or number < 0 for number in value.values()) or
            value["room_create_response_status"] not in ({0} | set(range(100, 600))) or
            value["room_create_server_errors"] > value["room_create_attempts"]):
        raise ValueError("Unexpected safe room-create HTTP evidence")
    return value


class RoomCreateFailure(RuntimeError):
    def __init__(self, kind: str):
        super().__init__("Isolated room creation check failed")
        self.kind = kind


def rectangle(node) -> tuple[int, int, int, int] | None:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not match:
        return None
    left, top, right, bottom = map(int, match.groups())
    return (left, top, right, bottom) if right > left and bottom > top else None


def room_scroll_nodes(root) -> list:
    return [node for node in root.iter() if node.attrib.get("scrollable") == "true" and
            node.attrib.get("class", "").endswith(("ScrollView", "RecyclerView")) and
            node.attrib.get("visible-to-user", "true") != "false" and rectangle(node)]


def safe_room_snapshot(device, module) -> dict:
    root = ET.fromstring(device.ui())
    xml = ET.tostring(root, encoding="unicode")
    sizes = re.findall(r"(\d+)x(\d+)", device.adb("shell", "wm", "size").stdout)
    width, height = map(int, sizes[-1]) if sizes else (0, 0)
    scrolls = room_scroll_nodes(root)
    raw_scrolls = [node for node in root.iter() if node.attrib.get("scrollable") == "true" and
                   node.attrib.get("class", "").endswith(("ScrollView", "RecyclerView"))]
    viewports = [list(rectangle(node)) for node in scrolls][-4:]
    controls = {}
    for test_id in ("room-create", "room-name-input", "room-save", "room-title", "end-broadcast"):
        node = module.find_node(xml, test_id)
        bounds = rectangle(node) if node is not None else None
        cx, cy = ((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2) if bounds else (-1, -1)
        controls[test_id] = {
            "present": node is not None,
            "enabled": node is not None and node.attrib.get("enabled") == "true",
            "focused": node is not None and node.attrib.get("focused") == "true",
            "visible": node is not None and node.attrib.get("visible-to-user", "true") != "false",
            "center_on_screen": 0 <= cx < width and 0 <= cy < height,
            "center_inside_scroll": any(left <= cx < right and top <= cy < bottom
                                        for left, top, right, bottom in viewports),
        }
    name = module.find_node(xml, "room-name-input")
    # Room content remains in memory; report only length and equality.
    name_value = name.attrib.get("text", "") if name is not None else ""
    labels = {node.attrib.get("text", "") for node in root.iter()}
    return {
        "process_alive": device.adb("shell", "pidof", PACKAGE, check=False).returncode == 0,
        "modal_title_present": "أنشئ مساحتك الصوتية" in labels,
        "room_name_length": len(name_value),
        "room_name_matches": name_value == "MobileHostClose",
        "known_notice": {
            "name_required": "اكتب اسمًا للغرفة من ٣ أحرف على الأقل." in labels,
            "private_password_short": "كلمة المرور يجب أن تكون ٦ أحرف على الأقل." in labels,
            "generic_save_failure": "تعذر حفظ الغرفة." in labels,
        },
        "scroll_viewports": viewports,
        "scroll_candidate_count": len(raw_scrolls),
        "invalid_scroll_bounds": any(rectangle(node) is None for node in raw_scrolls),
        "controls": controls,
    }


def reveal_room_control(device, module, test_id: str):
    # Native Modal may have a short scroll viewport. Keep gestures inside its
    # real ScrollView rather than swiping at fixed full-display coordinates.
    for _ in range(16):
        root = ET.fromstring(device.ui())
        xml = ET.tostring(root, encoding="unicode")
        node = module.find_node(xml, test_id)
        scrolls = room_scroll_nodes(root)
        if node is not None and node.attrib.get("visible-to-user", "true") != "false":
            cx, cy = module.center(node)
            if not scrolls or any(left <= cx < right and top <= cy < bottom
                                  for left, top, right, bottom in map(rectangle, scrolls)):
                if node.attrib.get("enabled") == "true":
                    return node
        if not scrolls:
            raw_scrolls = [item for item in root.iter() if item.attrib.get("scrollable") == "true" and
                           item.attrib.get("class", "").endswith(("ScrollView", "RecyclerView"))]
            raise RoomCreateFailure("scroll_view_invalid_bounds" if raw_scrolls else "scroll_view_unavailable")
        left, top, right, bottom = rectangle(scrolls[-1])
        height = bottom - top
        if height < 40:
            raise RoomCreateFailure("scroll_view_too_short")
        cx = (left + right) // 2
        device.adb("shell", "input", "swipe", str(cx), str(bottom - height // 5),
                   str(cx), str(top + height // 5), "400")
    raise RoomCreateFailure("control_not_revealed")


def create_native_host_room(device, module, report: dict, prefix: str):
    def mark(stage: str):
        report["phase"] = prefix + "_" + stage
        try:
            report.setdefault("room_ui_snapshots", {})[report["phase"]] = safe_room_snapshot(device, module)
        except Exception:
            report.setdefault("room_ui_snapshots", {})[report["phase"]] = {"ui_readable": False}

    def tap(test_id: str):
        node = reveal_room_control(device, module, test_id)
        x, y = module.center(node)
        device.adb("shell", "input", "tap", str(x), str(y))

    mark("create_button")
    tap("room-create")
    mark("modal_opened")
    node = reveal_room_control(device, module, "room-name-input")
    mark("name_ready")
    x, y = module.center(node)
    device.adb("shell", "input", "tap", str(x), str(y))
    # Existing enter helper safely quotes the constant fixture title.
    device.enter("room-name-input", "MobileHostClose")
    mark("name_entered")
    state = report["room_ui_snapshots"][report["phase"]]
    if not state.get("room_name_matches"):
        raise RoomCreateFailure("room_name_not_entered")
    hide_keyboard_if_shown(device)
    mark("keyboard_dismissed")
    mark("save_reveal")
    node = reveal_room_control(device, module, "room-save")
    mark("save_ready")
    x, y = module.center(node)
    device.adb("shell", "input", "tap", str(x), str(y))
    mark("save_tapped")
    report["phase"] = prefix + "_wait_room"
    device.wait_node("room-title", timeout=90)
    mark("room_observed")
    report["phase"] = prefix + "_wait_host_control"
    device.wait_node("end-broadcast", timeout=45)
    mark("host_ready")


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
        "scope": "real native HTTPS + NextAuth + isolated PostgreSQL account + owned room closure",
        "server_mode": "Next development, explicit VITEST=1 local URL preservation; nonproduction limiter",
        "checks": {}, "phase": "fixture",
        "limitations": [
            "Separate test APK trusts an ephemeral localhost CA; distributed production APK does not.",
            "Emulator authentication does not prove physical-device or production deployment behavior.",
            "No SFU is configured: room commands/database closure are tested, not audio capture or SFU participant eviction.",
            "Production rate limiter, real-user credentials and production writes are not exercised.",
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
        host_initial = host_counters(args.ca)
        report["host_counter_snapshots"] = {"initial": host_initial}
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
        report["phase"] = "manual_host_room_create"
        create_native_host_room(device, module, report, "manual_create")
        manual_active = host_counters(args.ca)
        report["host_counter_snapshots"]["manual_active"] = manual_active
        assert_host_state(manual_active, host_initial, created=1, closed=0)
        report["phase"] = "manual_host_room_end"
        device.tap("end-broadcast")
        confirm_native_alert(device, module, "إنهاء البث للجميع", "إنهاء البث")
        device.wait_node("rooms-list", timeout=90)
        manual_closed = host_counters(args.ca)
        report["host_counter_snapshots"]["manual_closed"] = manual_closed
        assert_host_state(manual_closed, host_initial, created=1, closed=1)
        report["checks"]["native_host_end_closes_database_room_and_clears_membership"] = True
        report["phase"] = "logout_host_room_create"
        create_native_host_room(device, module, report, "logout_create")
        logout_active = host_counters(args.ca)
        report["host_counter_snapshots"]["logout_active"] = logout_active
        assert_host_state(logout_active, host_initial, created=2, closed=1)
        report["phase"] = "logout"
        device.tap("nav-profile")
        device.tap("settings-logout")
        confirm_native_alert(device, module, "إنهاء البث وتسجيل الخروج", "إنهاء البث والخروج")
        device.wait_node("login-email", timeout=90)
        logged_out = wait_counter(args.ca, "signout_ok", reopened["signout_ok"])
        wait_counter(args.ca, "anonymous_sessions", reopened["anonymous_sessions"])
        report["checks"]["real_signout_and_anonymous_session"] = True
        logout_closed = host_counters(args.ca)
        report["host_counter_snapshots"]["logout_closed"] = logout_closed
        assert_host_state(logout_closed, host_initial, created=2, closed=2)
        report["checks"]["native_host_logout_closes_room_before_leave_or_signout"] = True
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
    except Exception as failure:
        report["failure_category"] = (failure.kind if isinstance(failure, RoomCreateFailure) else
            "command_timeout" if isinstance(failure, subprocess.TimeoutExpired) else
            "invalid_ui_xml" if isinstance(failure, ET.ParseError) else
            "invalid_evidence" if isinstance(failure, ValueError) else
            "runtime_check_failed" if isinstance(failure, RuntimeError) else
            "os_error" if isinstance(failure, OSError) else "unexpected_error")
        if device is not None and "account" in locals() and "module" in locals():
            try:
                report.setdefault("ui_snapshots", {})["failure_observed"] = safe_ui_snapshot(
                    device, module, account["email"], len(account["password"]))
            except Exception:
                report.setdefault("ui_snapshots", {})["failure_observed"] = {"ui_readable": False}
        if device is not None and "module" in locals():
            try:
                report.setdefault("room_ui_snapshots", {})["failure_observed"] = safe_room_snapshot(device, module)
            except Exception:
                report.setdefault("room_ui_snapshots", {})["failure_observed"] = {"ui_readable": False}
        # Exception text can contain native command arguments or server data.
        report["error"] = "Isolated native login check failed at the recorded phase"
        return 1
    finally:
        try:
            report["create_http_evidence"] = create_http_evidence(args.ca)
        except Exception:
            report["create_http_evidence"] = {"available": False}
        try:
            report["server_counters"] = counters(args.ca)
            report["host_server_counters"] = host_counters(args.ca)
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
