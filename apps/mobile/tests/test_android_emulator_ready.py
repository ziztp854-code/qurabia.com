#!/usr/bin/env python3
"""Readiness must reject a system ANR even when launcher content is behind it."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "android-emulator-ready.py"
SPEC = importlib.util.spec_from_file_location("emulator_readiness", SCRIPT)
ready = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ready)


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


if __name__ == "__main__":
    unittest.main()
