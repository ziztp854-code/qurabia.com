#!/usr/bin/env python3
"""Fail-closed readiness for a dedicated CI emulator, before app installation.

No dialog dismissal, app/test retry, screenshots, archived UI XML or raw logs.
A stable launcher does not establish the cause or remediation of a prior ANR.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import time
import xml.etree.ElementTree as ET

REMOTE_XML = "/sdcard/tahaddi-ready-window.xml"
LAUNCHERS = {"com.google.android.apps.nexuslauncher", "com.android.launcher3", "com.android.launcher"}


class ReadinessFailure(RuntimeError):
    pass


def inspect_ui(xml: str) -> tuple[bool, bool, str]:
    root = ET.fromstring(xml)
    nodes = list(root.iter())
    labels = " ".join(node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")
                      for node in nodes).casefold().replace("’", "'")
    anr = (("system ui" in labels and ("isn't responding" in labels or "is not responding" in labels))
           or ("واجهة مستخدم النظام" in labels and "لا تستجيب" in labels))
    launcher = any(node.attrib.get("package") in LAUNCHERS for node in nodes)
    # Exclude labels, editable values and changing clock text from the fingerprint.
    shape = [(node.attrib.get("package", ""), node.attrib.get("class", ""),
              node.attrib.get("resource-id", ""), node.attrib.get("bounds", "")) for node in nodes]
    return anr, launcher, hashlib.sha256(repr(shape).encode()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", default=os.environ.get("ANDROID_SERIAL"))
    parser.add_argument("--reports", default="android-reports/emulator-ready")
    args = parser.parse_args()
    prefix = ["adb"] + (["-s", args.serial] if args.serial else [])
    report = {"status": "failed", "reason": "not_ready", "observations": 0,
              "required_stable_seconds": 10, "timeout_seconds": 90, "conditions": {},
              "transient_count": 0, "stage": "emulator_guard",
              "scope": "CI emulator boot readiness; no app or ANR remediation claim"}
    started = time.monotonic()
    deadline = started + 90

    def adb(stage, *command):
        report["stage"] = stage
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ReadinessFailure("boot_readiness_timeout")
        return subprocess.run(prefix + list(command), capture_output=True, text=True,
                              timeout=min(30, remaining))

    try:
        if adb("emulator_guard", "shell", "getprop", "ro.kernel.qemu").stdout.strip() != "1":
            raise ReadinessFailure("dedicated_emulator_required")
        stable_since = None
        fingerprint = None
        while time.monotonic() < deadline:
            report["observations"] += 1
            conditions = {"boot_completed": False, "boot_animation_stopped": False,
                          "system_ui_alive": False, "package_manager_ready": False,
                          "launcher_visible": False}
            report["conditions"] = conditions
            try:
                conditions["boot_completed"] = adb(
                    "boot_completed", "shell", "getprop", "sys.boot_completed").stdout.strip() == "1"
                conditions["boot_animation_stopped"] = adb(
                    "boot_animation", "shell", "getprop", "init.svc.bootanim").stdout.strip() == "stopped"
                conditions["system_ui_alive"] = adb(
                    "system_ui_process", "shell", "pidof", "com.android.systemui").returncode == 0
                package = adb("package_manager", "shell", "cmd", "package", "path", "com.android.systemui")
                conditions["package_manager_ready"] = (
                    package.returncode == 0 and package.stdout.strip().startswith("package:"))
                current = None
                if conditions["boot_completed"] and conditions["system_ui_alive"]:
                    dumped = adb("ui_dump", "shell", "uiautomator", "dump", REMOTE_XML)
                    if dumped.returncode == 0:
                        xml = adb("ui_read", "exec-out", "cat", REMOTE_XML)
                        if xml.returncode == 0:
                            report["stage"] = "ui_parse"
                            anr, launcher, current = inspect_ui(xml.stdout)
                            conditions["launcher_visible"] = launcher
                            if anr:
                                raise ReadinessFailure("system_ui_anr_observed")
                now = time.monotonic()
                if all(conditions.values()):
                    if current != fingerprint:
                        stable_since, fingerprint = now, current
                    if stable_since is not None and now - stable_since >= 10:
                        report.update(status="ready", reason="stable_launcher",
                                      stable_seconds=round(now - stable_since, 1))
                        return 0
                else:
                    stable_since = fingerprint = None
            except (subprocess.TimeoutExpired, ET.ParseError) as error:
                # Retry only observation within the original budget, never app tests.
                report["transient_count"] += 1
                report["last_exception_type"] = (
                    "TimeoutExpired" if isinstance(error, subprocess.TimeoutExpired) else "ParseError")
                report["last_exception_stage"] = report["stage"]
                stable_since = fingerprint = None
            time.sleep(min(1, max(0, deadline - time.monotonic())))
        raise ReadinessFailure("boot_readiness_timeout")
    except ReadinessFailure as error:
        report["reason"] = error.args[0]
        return 1
    except (subprocess.SubprocessError, OSError, ET.ParseError) as error:
        report["reason"] = "readiness_observation_failed"
        report["last_exception_type"] = (
            "TimeoutExpired" if isinstance(error, subprocess.TimeoutExpired) else
            "ParseError" if isinstance(error, ET.ParseError) else
            "OSError" if isinstance(error, OSError) else "SubprocessError")
        report["last_exception_stage"] = report["stage"]
        return 1
    finally:
        try:
            subprocess.run(prefix + ["shell", "rm", "-f", REMOTE_XML],
                           capture_output=True, timeout=5)
        except (subprocess.SubprocessError, OSError):
            pass
        report["elapsed_seconds"] = round(time.monotonic() - started, 1)
        directory = pathlib.Path(args.reports)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "emulator-ready.json").write_text(json.dumps(report, indent=2) + "\n")
        print("ANDROID_EMULATOR_READY " + json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    raise SystemExit(main())
