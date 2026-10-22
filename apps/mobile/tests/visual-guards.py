#!/usr/bin/env python3
"""Visual evidence must never capture a credential screen or missing marker."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "visual-native-smoke.py"
SPEC = importlib.util.spec_from_file_location("visual_capture", SCRIPT)
visual = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(visual)


class PublicVisualBoundary(unittest.TestCase):
    def test_wrong_entry_or_credential_screen_is_rejected_before_screencap(self):
        module = visual.load_device()
        for content in [
            '<node resource-id="visual-page-home" bounds="[0,0][100,100]"/>',
            '<node resource-id="visual-preview-public" bounds="[0,0][100,50]"/>'
            '<node resource-id="visual-page-home" bounds="[0,50][100,200]"/>'
            '<node resource-id="login-password" bounds="[0,60][100,100]"/>',
        ]:
            with self.subTest(case="credential_boundary"):
                device = mock.Mock()
                device.ui.return_value = "<hierarchy>" + content + "</hierarchy>"
                with tempfile.TemporaryDirectory() as directory:
                    path = pathlib.Path(directory) / "forbidden.png"
                    with mock.patch.object(visual.subprocess, "run") as command:
                        with self.assertRaises(visual.VisualFailure):
                            visual.capture_public(device, module, "home", path)
                        command.assert_not_called()
                    self.assertFalse(path.exists())

    def test_public_page_marker_alone_cannot_capture_the_wrong_page(self):
        module = visual.load_device()
        xml = ('<hierarchy><node resource-id="visual-preview-public" bounds="[0,0][100,50]"/>'
               '<node resource-id="visual-page-profile" bounds="[0,50][100,200]"/></hierarchy>')
        with self.assertRaises(visual.VisualFailure):
            visual.assert_public_page(xml, module, "home")

    def test_requested_display_metadata_must_match_the_device(self):
        device = mock.Mock()
        device.adb.side_effect = [
            mock.Mock(stdout="Physical size: 1080x2400\nOverride size: 1080x2160"),
            mock.Mock(stdout="Physical density: 420\nOverride density: 480"),
            mock.Mock(stdout="1.0"),
        ]
        with self.assertRaises(visual.VisualFailure):
            visual.verify_display(device, 1080, 2160, 480, "2.0")


if __name__ == "__main__":
    unittest.main()
