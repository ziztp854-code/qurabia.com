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



    def test_keyboard_input_must_fit_the_resized_app_and_keep_48dp_height(self):
        module = visual.load_device()
        for field in ("[20,800][1000,900]", "[20,1000][1000,1200]"):
            device = mock.Mock()
            device.adb.return_value = mock.Mock(returncode=0, stdout=(
                "mInputShown=true\n  Window #0 Window{abc u0 InputMethod}:\n"
                "    Frames: frame=[0,0][1080,2160]\n"
                "    InsetsSource: {3 mType=ime mFrame=[0,1400][1080,2160] mVisible=true}"))
            device.ui.return_value = (
                '<hierarchy><node resource-id="visual-preview-public" bounds="[0,0][1080,100]"/>'
                '<node resource-id="visual-page-room" bounds="[0,100][1080,1100]"/>'
                '<node resource-id="chat-input" visible-to-user="true" bounds="' + field + '"/></hierarchy>')
            with self.assertRaises(visual.VisualFailure):
                visual.assert_keyboard_input_visible(device, module, "room", "chat-input", 1080, 2160, 480)
        device.ui.return_value = (
            '<hierarchy><node resource-id="visual-preview-public" bounds="[0,0][1080,100]"/>'
            '<node resource-id="visual-page-room" bounds="[0,100][1080,1100]"/>'
            '<node resource-id="chat-input" visible-to-user="true" bounds="[20,800][900,1000]"/>'
            '<node resource-id="chat-send" visible-to-user="true" bounds="[910,800][1070,1000]"/></hierarchy>')
        result = visual.assert_keyboard_input_visible(device, module, "room", "chat-input", 1080, 2160, 480)
        self.assertTrue(result["fully_inside_app_viewport"])



    def test_anonymous_idle_capture_refuses_any_populated_login_field(self):
        module = visual.load_device()
        for populated in ("login-email", "login-password"):
            device = mock.Mock()
            device.ui.return_value = "<hierarchy>" + "".join(
                '<node resource-id="' + key + '" text="' + ("private-fixture-value" if key == populated else "") +
                '" bounds="[10,20][300,100]"/>' for key in ("login-email", "login-password")) + "</hierarchy>"
            with tempfile.TemporaryDirectory() as directory:
                with mock.patch.object(module.subprocess, "run") as command:
                    with self.assertRaises(RuntimeError):
                        module.capture_anonymous_idle(device, pathlib.Path(directory))
                    command.assert_not_called()
                self.assertFalse((pathlib.Path(directory) / "native-auth-idle.png").exists())


    def test_ime_overlap_prevents_public_keyboard_screenshot_even_inside_app_bounds(self):
        module = visual.load_device()
        for field, send in (
            ("[20,1600][900,1800]", "[910,1600][1070,1800]"),
            ("[20,900][900,1100]", "[910,1600][1070,1800]"),
        ):
            device = mock.Mock()
            device.ui.return_value = ('<hierarchy>'
                '<node resource-id="visual-preview-public" bounds="[0,0][1080,100]"/>'
                '<node resource-id="visual-page-room" bounds="[0,100][1080,2160]"/>'
                '<node resource-id="chat-input" bounds="' + field + '"/>'
                '<node resource-id="chat-send" bounds="' + send + '"/></hierarchy>')
            device.adb.return_value = mock.Mock(returncode=0, stdout=(
                "mInputShown=true\n  Window #0 Window{abc u0 InputMethod}:\n"
                "    Frames: frame=[0,0][1080,2160]\n"
                "    InsetsSource: {3 mType=ime mFrame=[0,1300][1080,2160] mVisible=true}\n"
                "PRIVATE_EDITOR_METADATA"))
            evidence = {}
            with tempfile.TemporaryDirectory() as directory:
                output = pathlib.Path(directory) / "blocked.png"
                with mock.patch.object(visual.subprocess, "run") as command:
                    with self.assertRaises(visual.VisualFailure):
                        visual.capture_public(device, module, "room", output,
                            before_capture=lambda: visual.assert_keyboard_input_visible(
                                device, module, "room", "chat-input", 1080, 2160, 480, evidence))
                    command.assert_not_called()
                self.assertFalse(output.exists())
            self.assertNotIn("PRIVATE_EDITOR_METADATA", str(evidence))


if __name__ == "__main__":
    unittest.main()
