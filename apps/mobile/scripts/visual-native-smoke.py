#!/usr/bin/env python3
"""CI-only visual capture of a separate APK containing public static presentation.

Never run against a signed-in app. This script clears a dedicated emulator,
requires a preview marker before every screenshot, and archives no UI XML/logs.
The preview APK itself must not be distributed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import time

PACKAGE = "com.qurabia.tahaddi"
PAGES = ("home", "rooms", "profile", "room")
MATRIX = (
    ("320dp", 960, 1920, 480, "1.0"),
    ("360dp", 1080, 2160, 480, "1.0"),
    ("427dp", 1280, 2560, 480, "1.0"),
    ("800dp", 1600, 2560, 320, "1.0"),
    ("360dp-font2", 1080, 2160, 480, "2.0"),
)


class VisualFailure(RuntimeError):
    pass


def load_device():
    spec = importlib.util.spec_from_file_location(
        "visual_native_device", pathlib.Path(__file__).with_name("android-native-smoke.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def assert_public_page(xml: str, module, page: str):
    if page not in PAGES:
        raise VisualFailure("invalid_page")
    if module.find_node(xml, "visual-preview-public") is None:
        raise VisualFailure("public_preview_marker_missing")
    if any(module.find_node(xml, key) is not None
           for key in ("login-email", "login-password", "login-submit")):
        raise VisualFailure("credential_screen_forbidden")
    if module.find_node(xml, "visual-page-" + page) is None:
        raise VisualFailure("expected_preview_page_missing")


def capture_public(device, module, page: str, filename: pathlib.Path):
    assert_public_page(device.ui(), module, page)
    capture = subprocess.run(device.prefix + ["exec-out", "screencap", "-p"],
                             capture_output=True, timeout=30)
    if capture.returncode or not capture.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
        raise VisualFailure("screenshot_failed")
    filename.write_bytes(capture.stdout)


def wait_public_page(device, module, page: str, timeout: float = 60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if device.adb("shell", "pidof", PACKAGE, check=False).returncode:
            raise VisualFailure("preview_process_exited")
        xml = device.ui()
        if module.find_node(xml, "visual-preview-public") is None:
            time.sleep(1)
            continue
        if any(module.find_node(xml, key) is not None
               for key in ("login-email", "login-password", "login-submit")):
            raise VisualFailure("credential_screen_forbidden")
        if module.find_node(xml, "visual-page-" + page) is not None:
            return
        time.sleep(1)
    raise VisualFailure("preview_page_timeout")


def keyboard_shown(device) -> bool:
    dump = device.adb("shell", "dumpsys", "input_method").stdout
    return bool(re.search(r"\b(?:mInputShown|mIsInputViewShown)=true\b", dump))


def assert_keyboard_input_visible(device, module, page: str, target: str,
                                  width: int, height: int, density: int) -> dict:
    xml = device.ui()
    assert_public_page(xml, module, page)
    def bounds(node):
        if node is None or node.attrib.get("visible-to-user", "true") == "false":
            raise VisualFailure("keyboard_input_not_visible")
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if not match:
            raise VisualFailure("keyboard_input_bounds_missing")
        return tuple(map(int, match.groups()))
    parent = bounds(module.find_node(xml, "visual-page-" + page))
    field = bounds(module.find_node(xml, target))
    left, top, right, bottom = field
    if (not (0 <= left < right <= width and 0 <= top < bottom <= height) or
            not (parent[0] <= left < right <= parent[2] and parent[1] <= top < bottom <= parent[3]) or
            bottom - top < round(48 * density / 160)):
        raise VisualFailure("keyboard_input_clipped")
    return {"bounds_px": list(field), "height_dp": round((bottom - top) * 160 / density, 2),
            "fully_inside_app_viewport": True}


def featured_room_visible(device, module) -> bool:
    xml = device.ui()
    def bounds(key):
        node = module.find_node(xml, key)
        if node is None or node.attrib.get("visible-to-user", "true") == "false":
            return None
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        return tuple(map(int, match.groups())) if match else None
    parent = bounds("visual-page-home")
    if parent is None:
        return False
    for key in ("featured-room-title", "featured-room-host"):
        child = bounds(key)
        if child is None or not (parent[0] <= child[0] < child[2] <= parent[2] and
                                 parent[1] <= child[1] < child[3] <= parent[3]):
            return False
    return True


def focus_search(device, module):
    from xml.etree import ElementTree as ET
    xml = device.ui()
    node = module.find_node(xml, "room-search")
    if node is None:
        node = next((item for item in ET.fromstring(xml).iter()
                     if item.attrib.get("content-desc") == "ابحث عن مجلس" and
                     item.attrib.get("class", "").endswith("EditText")), None)
    if node is None:
        raise VisualFailure("public_search_input_missing")
    x, y = module.center(node)
    device.adb("shell", "input", "tap", str(x), str(y))


def verify_display(device, width: int, height: int, density: int, font: str):
    sizes = re.findall(r"(\d+)x(\d+)", device.adb("shell", "wm", "size").stdout)
    densities = re.findall(r"density:\s*(\d+)", device.adb("shell", "wm", "density").stdout, re.I)
    actual_font = device.adb("shell", "settings", "get", "system", "font_scale").stdout.strip()
    if (not sizes or tuple(map(int, sizes[-1])) != (width, height) or
            not densities or int(densities[-1]) != density or
            not re.fullmatch(r"\d+(?:\.\d+)?", actual_font) or float(actual_font) != float(font)):
        raise VisualFailure("display_configuration_not_applied")


def emit_public_frames(directory: pathlib.Path, frames: list[dict]):
    # Original verified public PNGs only. Bound inline logs; all PNGs remain artifacts.
    budget = 8 * 1024 * 1024
    priority = {"360dp": 0, "800dp": 1, "360dp-font2": 2, "320dp": 3, "427dp": 4}
    for frame in sorted(frames, key=lambda item: priority[item["case"]]):
        data = (directory / frame["file"]).read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            continue
        encoded = base64.b64encode(data).decode("ascii")
        if len(encoded) > budget:
            print("VISUAL_PREVIEW_IMAGE_SKIPPED " + json.dumps({
                "name": frame["file"], "reason": "bounded_inline_log_budget"}))
            continue
        budget -= len(encoded)
        chunks = [encoded[index:index + 12000] for index in range(0, len(encoded), 12000)]
        for index, chunk in enumerate(chunks):
            print("VISUAL_PREVIEW_IMAGE " + json.dumps({
                "name": frame["file"], "index": index, "chunk": chunk}, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--source-sha", default=os.environ.get("GITHUB_SHA"))
    parser.add_argument("--reports", default="android-reports/visual")
    parser.add_argument("--label", default="current")
    parser.add_argument("--serial", default=os.environ.get("ANDROID_SERIAL"))
    args = parser.parse_args()
    if not args.source_sha or not re.fullmatch(r"[a-f0-9]{40}", args.source_sha):
        parser.error("--source-sha must be an immutable 40-character SHA")
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", args.label):
        parser.error("--label must be a short safe filename label")
    directory = pathlib.Path(args.reports)
    directory.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "failed", "source_sha": args.source_sha, "label": args.label,
        "scope": "emulated visual presentation with explicitly public static fixtures",
        "screens": [], "phase": "setup",
        "limitations": [
            "This is a separate non-distributed preview entry, not authenticated application evidence.",
            "No authentication, sessions, writes, voice, server connection or SFU operation is tested.",
            "Screenshots require human visual review; successful capture is not visual acceptance.",
            "Only public fixtures are captured; no UI XML or raw logs are archived.",
        ],
    }
    device = None
    old_font = old_airplane = None
    try:
        apk = pathlib.Path(args.apk)
        report["apk_sha256"] = hashlib.sha256(apk.read_bytes()).hexdigest()
        module = load_device()
        device = module.Device(args.serial)
        if device.adb("shell", "getprop", "ro.kernel.qemu").stdout.strip() != "1":
            raise VisualFailure("dedicated_emulator_required")
        old_font = device.adb("shell", "settings", "get", "system", "font_scale").stdout.strip()
        old_airplane = device.adb("shell", "settings", "get", "global", "airplane_mode_on").stdout.strip()
        report["device"] = {
            "model": device.adb("shell", "getprop", "ro.product.model").stdout.strip(),
            "android_api": device.adb("shell", "getprop", "ro.build.version.sdk").stdout.strip(),
        }
        device.adb("reverse", "--remove-all")
        device.adb("install", "-r", args.apk)
        device.adb("shell", "pm", "clear", PACKAGE)
        device.adb("logcat", "-c")
        device.adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
        for case, width, height, density, font in MATRIX:
            report["phase"] = "configure_" + case
            device.adb("shell", "wm", "size", str(width) + "x" + str(height))
            device.adb("shell", "wm", "density", str(density))
            device.adb("shell", "settings", "put", "system", "font_scale", font)
            verify_display(device, width, height, density, font)
            device.adb("shell", "am", "force-stop", PACKAGE)
            device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
            wait_public_page(device, module, "home")
            for page in PAGES:
                report["phase"] = case + "_" + page
                if page != "home":
                    device.tap("preview-live" if page == "room" else "nav-" + page)
                wait_public_page(device, module, page)
                filename = args.label + "-" + case + "-" + page + ".png"
                capture_public(device, module, page, directory / filename)
                if page == "home" and float(font) == 1.0:
                    report.setdefault("layout_checks", []).append({
                        "case": case, "first_room_title_and_host_above_fold": featured_room_visible(device, module),
                    })
                report["screens"].append({
                    "file": filename, "case": case, "page": page,
                    "width_px": width, "height_px": height, "density_dpi": density,
                    "width_dp": round(width * 160 / density, 2), "font_scale": float(font),
                    "public_fixture_only": True,
                })
        # Capture every viewport/font case before exercising keyboard overlays.
        # A keyboard failure must remain a failure without hiding other layouts.
        case, width, height, density, font = "360dp", 1080, 2160, 480, "1.0"
        report["phase"] = "configure_keyboard_cases"
        device.adb("shell", "wm", "size", "1080x2160")
        device.adb("shell", "wm", "density", "480")
        device.adb("shell", "settings", "put", "system", "font_scale", font)
        verify_display(device, width, height, density, font)
        device.adb("shell", "am", "force-stop", PACKAGE)
        device.adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        wait_public_page(device, module, "home")
        for page, kind in (("rooms", "search"), ("room", "chat")):
            report["phase"] = case + "_" + kind + "_keyboard"
            device.tap("preview-live" if page == "room" else "nav-rooms")
            wait_public_page(device, module, page)
            if kind == "search":
                focus_search(device, module)
            else:
                node = module.find_node(device.ui(), "chat-input")
                if node is None:
                    raise VisualFailure("chat_input_not_visible")
                x, y = module.center(node)
                if not (0 <= x < width and 0 <= y < height):
                    raise VisualFailure("chat_input_outside_viewport")
                device.adb("shell", "input", "tap", str(x), str(y))
            # Public constant draft only; never enter a password or account.
            device.adb("shell", "input", "text", "PublicPreview")
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline and not keyboard_shown(device):
                time.sleep(1)
            if not keyboard_shown(device):
                raise VisualFailure("keyboard_not_observed")
            geometry = assert_keyboard_input_visible(device, module, page,
                "room-search" if kind == "search" else "chat-input", width, height, density)
            filename = args.label + "-" + case + "-" + kind + "-keyboard.png"
            capture_public(device, module, page, directory / filename)
            report["screens"].append({
                "file": filename, "case": case, "page": page, "keyboard": kind,
                "width_px": width, "height_px": height, "density_dpi": density,
                "width_dp": round(width * 160 / density, 2),
                "font_scale": 1.0, "public_fixture_only": True, "input_geometry": geometry,
            })
            device.adb("shell", "input", "keyevent", "KEYCODE_BACK")
        errors = device.adb("logcat", "-d", "-s", "AndroidRuntime:E", "ReactNativeJS:E", "*:S").stdout
        if re.search(r"FATAL EXCEPTION|Unable to load script|Could not connect to development server", errors):
            raise VisualFailure("standalone_preview_runtime_failure")
        if any(not item["first_room_title_and_host_above_fold"] for item in report.get("layout_checks", [])):
            raise VisualFailure("featured_room_not_fully_visible_above_fold")
        report["phase"] = "captured"
        report["status"] = "passed"
        return 0
    except Exception as failure:
        report["failure"] = (failure.args[0] if isinstance(failure, VisualFailure) else
                             "command_timeout" if isinstance(failure, subprocess.TimeoutExpired) else
                             "preview_setup_or_capture_failed")
        return 1
    finally:
        if device is not None:
            try:
                device.adb("shell", "rm", "-f", "/sdcard/tahaddi-native-window.xml", check=False)
                device.adb("shell", "am", "force-stop", PACKAGE, check=False)
                device.adb("shell", "pm", "clear", PACKAGE, check=False)
                device.adb("shell", "wm", "size", "reset", check=False)
                device.adb("shell", "wm", "density", "reset", check=False)
                if old_font and re.fullmatch(r"\d+(?:\.\d+)?", old_font):
                    device.adb("shell", "settings", "put", "system", "font_scale", old_font, check=False)
                if old_airplane in ("0", "1"):
                    device.adb("shell", "cmd", "connectivity", "airplane-mode",
                               "enable" if old_airplane == "1" else "disable", check=False)
            except Exception:
                pass
        (directory / "visual-result.json").write_text(json.dumps(report, indent=2) + "\n")
        emit_public_frames(directory, report["screens"])
        print("PUBLIC_VISUAL_REVIEW " + json.dumps({
            "status": report["status"], "phase": report["phase"],
            "screens": len(report["screens"]), "source_sha": report["source_sha"],
            "failure": report.get("failure"), "layout_checks": report.get("layout_checks", []),
        }))


if __name__ == "__main__":
    sys.exit(main())
