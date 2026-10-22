#!/usr/bin/env python3
"""Guards around credentialed QA: isolation, encoding and report privacy."""
import contextlib
import importlib.util
import io
import html
import json
import pathlib
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "login-native-smoke.py"
SPEC = importlib.util.spec_from_file_location("login_smoke", SCRIPT)
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)
SUFFIX = "12345678-1234-1234-1234-123456789abc"


class LoginIsolationGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = pathlib.Path(self.temp.name)
        self.file = self.directory / "credentials.json"
        self.account = {
            "origin": smoke.ORIGIN,
            "email": "mobile_login_" + SUFFIX + "+ci@example.test",
            "password": "MobileAa42!+%25=&" + SUFFIX,
        }
        self.write()

    def tearDown(self):
        self.temp.cleanup()

    def write(self):
        self.file.write_text(json.dumps(self.account))
        self.file.chmod(0o600)

    def test_encoding_sensitive_password_and_dedicated_account_are_accepted(self):
        self.assertEqual(smoke.load_credentials(self.file), self.account)

    def test_public_production_and_remote_origins_are_refused(self):
        for origin in ["https://qurabia.com", "https://staging.example.test", "http://localhost:3443"]:
            with self.subTest(origin=origin):
                self.account["origin"] = origin
                self.write()
                with self.assertRaises(ValueError):
                    smoke.load_credentials(self.file)

    def test_real_or_unscoped_users_are_refused(self):
        self.account["email"] = "member@example.test"
        self.write()
        with self.assertRaises(ValueError):
            smoke.load_credentials(self.file)

    def test_password_cannot_silently_drop_encoding_edgecases(self):
        self.account["password"] = "SimpleAa42!"
        self.write()
        with self.assertRaises(ValueError):
            smoke.load_credentials(self.file)

    def test_publicly_readable_credentials_are_refused(self):
        self.file.chmod(0o644)
        with self.assertRaises(ValueError):
            smoke.load_credentials(self.file)

    def test_fixture_counters_reject_foreign_identity(self):
        values = dict.fromkeys(["csrf_ok", "credentials_ok", "credentials_rejected",
            "authenticated_sessions", "anonymous_sessions", "foreign_sessions", "signout_ok", "rooms_ok"], 0)
        values["foreign_sessions"] = 1
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(values).encode()
        with mock.patch.object(smoke.ssl, "create_default_context"), \
             mock.patch.object(smoke.urllib.request, "urlopen", return_value=response):
            with self.assertRaises(ValueError):
                smoke.counters("local-fixture-ca.pem")

    def test_failed_native_command_never_leaks_credentials_in_report(self):
        secret = self.account["password"]
        device = mock.Mock()
        device.adb.side_effect = RuntimeError(secret)
        module = mock.Mock()
        module.Device.return_value = device
        report_dir = self.directory / "safe-reports"
        argv = ["login-native-smoke.py", "--apk", "test.apk", "--credentials", str(self.file),
                "--ca", "ca.pem", "--reports", str(report_dir)]
        output = io.StringIO()
        with mock.patch.object(smoke.sys, "argv", argv), \
             mock.patch.object(smoke, "load_device", return_value=module), \
             contextlib.redirect_stdout(output):
            self.assertEqual(smoke.main(), 1)
        report = (report_dir / "login-result.json").read_text()
        self.assertNotIn(secret, report + output.getvalue())
        self.assertNotIn(self.account["email"], report + output.getvalue())
        self.assertEqual(json.loads(report)["phase"], "fixture")
        self.assertEqual(list(report_dir.iterdir()), [report_dir / "login-result.json"])
        device.adb.assert_any_call("shell", "rm", "-f", "/sdcard/tahaddi-native-window.xml", check=False)


    def test_back_is_sent_only_when_ime_is_explicitly_shown(self):
        for dump, expected in [
            ("mInputShown=true", "shown"),
            ("mInputShown=false mIsInputViewShown=false", "hidden"),
            ("unrecognized private IME metadata", "unknown"),
        ]:
            with self.subTest(state=expected):
                device = mock.Mock()
                device.adb.return_value.stdout = dump
                result = smoke.hide_keyboard_if_shown(device)
                self.assertEqual(result, {"before": expected, "sent_back": expected == "shown"})
                back = mock.call("shell", "input", "keyevent", "KEYCODE_BACK")
                self.assertEqual(back in device.adb.call_args_list, expected == "shown")

    def test_ui_snapshot_reports_flags_lengths_and_known_notice_kind_only(self):
        from xml.etree.ElementTree import Element
        secret = self.account["password"]
        attrs = {"enabled": "true", "focused": "true", "clickable": "true"}
        nodes = {
            "login-email": Element("node", {**attrs, "text": self.account["email"]}),
            "login-password": Element("node", {**attrs, "text": secret}),
            "login-submit": Element("node", attrs),
        }
        module = mock.Mock()
        module.find_node.side_effect = lambda xml, name: nodes[name]
        module.scoped_error_labels.return_value = [secret, self.account["email"]]
        device = mock.Mock()
        device.ui.return_value = "private XML retained in memory only"
        device.adb.return_value.returncode = 0
        result = smoke.safe_ui_snapshot(device, module, self.account["email"], len(secret))
        self.assertTrue(result["email_matches"])
        self.assertEqual(result["password_display_length"], len(secret))
        self.assertEqual(result["notice_kind"], "unrecognized")
        encoded = json.dumps(result)
        self.assertNotIn(secret, encoded)
        self.assertNotIn(self.account["email"], encoded)
        module.scoped_error_labels.return_value = [smoke.REJECTED_ERROR]
        self.assertEqual(smoke.safe_ui_snapshot(device, module, self.account["email"], len(secret))
                         ["notice_kind"], "invalid_credentials")


    def test_host_audit_refuses_extra_fields_or_inconsistent_database_counts(self):
        valid = dict.fromkeys(smoke.HOST_COUNTER_KEYS, 0)
        self.assertEqual(smoke.validate_host_counters(valid), valid)
        for invalid in [
            {**valid, "email": self.account["email"]},
            {**valid, "owned_rooms": 1},
            {**valid, "closed_with_members": 1},
            {**valid, "room_close_ok": True},
        ]:
            with self.assertRaises(ValueError):
                smoke.validate_host_counters(invalid)

    def test_host_closure_requires_database_membership_and_correct_logout_order(self):
        baseline = dict.fromkeys(smoke.HOST_COUNTER_KEYS, 0)
        closed = {**baseline, "owned_rooms": 2, "closed_rooms": 2,
                  "room_create_ok": 2, "room_close_ok": 2}
        smoke.assert_host_state(closed, baseline, created=2, closed=2)
        for changed in [
            {"closed_with_members": 1},
            {"active_rooms": 1, "closed_rooms": 1},
            {"inconsistent_rooms": 1},
            {"leave_while_active": 1},
            {"signout_while_active": 1},
            {"room_close_ok": 1},
        ]:
            with self.assertRaises(RuntimeError):
                smoke.assert_host_state({**closed, **changed}, baseline, created=2, closed=2)

    def test_native_host_confirmation_requires_the_expected_system_alert(self):
        for namespace in ["android:id/", smoke.PACKAGE + ":id/"]:
            with self.subTest(namespace=namespace):
                device = mock.Mock()
                device.ui.return_value = (
                    '<hierarchy><node resource-id="' + namespace + 'alertTitle" '
                    'text="إنهاء البث للجميع"/><node resource-id="' + namespace + 'button1" '
                    'text="إنهاء البث" enabled="true" bounds="[0,0][100,100]"/></hierarchy>')
                module = mock.Mock()
                module.center.return_value = (50, 50)
                with mock.patch.object(smoke.time, "monotonic", side_effect=[0, 0]):
                    smoke.confirm_native_alert(device, module, "إنهاء البث للجميع", "إنهاء البث")
                device.adb.assert_called_once_with("shell", "input", "tap", "50", "50")
        device = mock.Mock()
        device.ui.return_value = ('<hierarchy><node resource-id="android:id/alertTitle" text="Unrelated"/>'
            '<node resource-id="android:id/button1" text="إنهاء البث" enabled="true"/></hierarchy>')
        with mock.patch.object(smoke.time, "monotonic", side_effect=[0, 0, 2]), \
             mock.patch.object(smoke.time, "sleep"):
            with self.assertRaises(RuntimeError):
                smoke.confirm_native_alert(device, module, "إنهاء البث للجميع", "إنهاء البث", timeout=1)
        device.adb.assert_not_called()


    def test_room_scroll_stays_inside_the_actual_short_modal_viewport(self):
        first = ('<hierarchy><node class="android.widget.ScrollView" scrollable="true" '
                 'bounds="[0,1600][1080,2100]"/></hierarchy>')
        second = ('<hierarchy><node class="android.widget.ScrollView" scrollable="true" '
                  'bounds="[0,1600][1080,2100]"><node resource-id="room-save" '
                  'enabled="true" bounds="[100,1800][980,1950]"/></node></hierarchy>')
        device = mock.Mock()
        device.ui.side_effect = [first, second]
        module = smoke.load_device()
        node = smoke.reveal_room_control(device, module, "room-save")
        self.assertEqual(node.attrib["resource-id"], "room-save")
        command = device.adb.call_args.args
        self.assertEqual(command[:3], ("shell", "input", "swipe"))
        for x, y in [(int(command[3]), int(command[4])), (int(command[5]), int(command[6]))]:
            self.assertTrue(0 < x < 1080 and 1600 < y < 2100)
        self.assertGreater(int(command[4]), int(command[6]))

    def test_room_snapshot_discards_values_and_create_http_rejects_private_fields(self):
        module = smoke.load_device()
        device = mock.Mock()
        device.ui.return_value = ('<hierarchy><node class="android.widget.ScrollView" '
            'scrollable="true" bounds="[0,1600][1080,2100]"><node resource-id="room-name-input" '
            'enabled="true" text="' + self.account["email"] + '" bounds="[100,1700][980,1800]"/>'
            '<node text="' + html.escape(self.account["password"], quote=True) + '"/></node></hierarchy>')
        device.adb.return_value.stdout = "Physical size: 1080x2400"
        device.adb.return_value.returncode = 0
        state = smoke.safe_room_snapshot(device, module)
        encoded = json.dumps(state)
        self.assertNotIn(self.account["email"], encoded)
        self.assertNotIn(self.account["password"], encoded)
        self.assertFalse(state["room_name_matches"])
        self.assertEqual(state["scroll_viewports"], [[0, 1600, 1080, 2100]])
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({
            "room_create_attempts": 1, "room_create_response_status": 400,
            "room_create_server_errors": 0, "email": self.account["email"],
        }).encode()
        with mock.patch.object(smoke.ssl, "create_default_context"), \
             mock.patch.object(smoke.urllib.request, "urlopen", return_value=response):
            with self.assertRaises(ValueError):
                smoke.create_http_evidence("local-fixture-ca.pem")


if __name__ == "__main__":
    unittest.main()
