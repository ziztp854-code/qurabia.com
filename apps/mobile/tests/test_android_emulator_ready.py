#!/usr/bin/env python3
"""Readiness must reject a system ANR even when launcher content is behind it."""
import importlib.util
import contextlib
import io
import json
import tempfile
import subprocess
import sys
from types import SimpleNamespace
from unittest import mock
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "android-emulator-ready.py"
SPEC = importlib.util.spec_from_file_location("emulator_readiness", SCRIPT)
ready = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ready)



LAUNCHER = '<hierarchy><node package="com.android.launcher3" bounds="[0,0][100,100]"/></hierarchy>'


class FakeClock:
    def __init__(self):
        self.now = 0

    def monotonic(self):
        return self.now

    def sleep(self, duration):
        self.now += duration


class AdbFixture:
    def __init__(self, transient=None, anr=False, boot=True):
        self.transient, self.anr, self.boot = transient, anr, boot
        self.dumps = self.reads = 0
        self.timeouts = []

    def run(self, command, **kwargs):
        self.timeouts.append(kwargs["timeout"])
        parts = command[3:] if command[1:2] == ["-s"] else command[1:]
        if parts == ["shell", "getprop", "ro.kernel.qemu"]:
            return SimpleNamespace(returncode=0, stdout="1")
        if parts == ["shell", "getprop", "sys.boot_completed"]:
            return SimpleNamespace(returncode=0, stdout="1" if self.boot else "0")
        if parts == ["shell", "getprop", "init.svc.bootanim"]:
            return SimpleNamespace(returncode=0, stdout="stopped")
        if parts[:2] == ["shell", "pidof"]:
            return SimpleNamespace(returncode=0, stdout="42")
        if parts[:3] == ["shell", "cmd", "package"]:
            return SimpleNamespace(returncode=0, stdout="package:/public/SystemUI.apk")
        if parts[:3] == ["shell", "uiautomator", "dump"]:
            self.dumps += 1
            if self.transient == "timeout" and self.dumps == 1:
                raise subprocess.TimeoutExpired("PRIVATE_COMMAND", 10, output="PRIVATE_OUTPUT")
            return SimpleNamespace(returncode=0, stdout="")
        if parts[:2] == ["exec-out", "cat"]:
            self.reads += 1
            value = LAUNCHER
            if self.transient == "xml" and self.reads == 1:
                value = "<hierarchy>PRIVATE_XML"
            if self.anr:
                value = '<hierarchy><node text="System UI isn’t responding"/>' + LAUNCHER + '</hierarchy>'
            return SimpleNamespace(returncode=0, stdout=value)
        if parts[:3] == ["shell", "rm", "-f"]:
            return SimpleNamespace(returncode=0, stdout="")
        raise AssertionError("Unexpected command: readiness must only observe")


def run_gate(adb):
    clock = FakeClock()
    output = io.StringIO()
    with tempfile.TemporaryDirectory() as directory:
        with mock.patch.object(sys, "argv", ["ready.py", "--reports", directory]), \
             mock.patch.object(ready.time, "monotonic", side_effect=clock.monotonic), \
             mock.patch.object(ready.time, "sleep", side_effect=clock.sleep), \
             mock.patch.object(ready.subprocess, "run", side_effect=adb.run), \
             contextlib.redirect_stdout(output):
            result = ready.main()
        report = json.loads((pathlib.Path(directory) / "emulator-ready.json").read_text())
    return result, report, output.getvalue()

class EmulatorReadinessGuards(unittest.TestCase):
    def test_explicit_system_anr_over_launcher_is_not_a_ready_home(self):
        xml = ('<hierarchy><node package="com.google.android.apps.nexuslauncher"/>'
               '<node package="android" text="System UI isn’t responding"/>'
               '<node text="Wait"/><node text="Close app"/></hierarchy>')
        anr, launcher, _ = ready.inspect_ui(xml)
        self.assertTrue(anr)
        self.assertTrue(launcher)

    def test_stability_fingerprint_ignores_changing_labels_and_keeps_layout_changes(self):
        first = '<hierarchy><node package="com.android.launcher3" bounds="[0,0][100,100]" text="12:00"/></hierarchy>'
        clock = first.replace("12:00", "12:01")
        resized = first.replace("[100,100]", "[100,200]")
        self.assertEqual(ready.inspect_ui(first)[2], ready.inspect_ui(clock)[2])
        self.assertNotEqual(ready.inspect_ui(first)[2], ready.inspect_ui(resized)[2])


    def test_transient_observation_then_stable_home_can_become_ready_within_original_budget(self):
        for mode, expected_type, expected_stage in [
            ("timeout", "TimeoutExpired", "ui_dump"), ("xml", "ParseError", "ui_parse"),
        ]:
            with self.subTest(transient=mode):
                adb = AdbFixture(transient=mode)
                status, report, output = run_gate(adb)
                self.assertEqual(status, 0)
                self.assertEqual(report["status"], "ready")
                self.assertEqual(report["transient_count"], 1)
                self.assertEqual(report["last_exception_type"], expected_type)
                self.assertEqual(report["last_exception_stage"], expected_stage)
                self.assertGreaterEqual(report["stable_seconds"], 10)
                self.assertLessEqual(report["elapsed_seconds"], 90)
                self.assertTrue(all(0 < timeout <= 30 for timeout in adb.timeouts))
                self.assertNotIn("PRIVATE_", output)

    def test_explicit_anr_is_terminal_without_observation_continuation(self):
        adb = AdbFixture(anr=True)
        status, report, _ = run_gate(adb)
        self.assertEqual(status, 1)
        self.assertEqual(report["reason"], "system_ui_anr_observed")
        self.assertEqual(report["observations"], 1)
        self.assertEqual(adb.dumps, 1)
        self.assertEqual(report["transient_count"], 0)

    def test_unready_system_reaches_original_deadline_and_never_passes(self):
        status, report, _ = run_gate(AdbFixture(boot=False))
        self.assertEqual(status, 1)
        self.assertEqual(report["reason"], "boot_readiness_timeout")
        self.assertFalse(report["conditions"]["boot_completed"])
        self.assertGreaterEqual(report["elapsed_seconds"], 90)
        self.assertLessEqual(report["elapsed_seconds"], 90)


if __name__ == "__main__":
    unittest.main()
