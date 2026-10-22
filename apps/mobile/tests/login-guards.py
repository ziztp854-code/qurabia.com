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



class LocalFieldDevice:
    """Stateful accessibility fixture: input is impossible until focus settles."""
    def __init__(self, module, drop_attempts=0, field="login-email", secure=False):
        self.module = module
        self.field = field
        self.secure = secure
        self.value = "stale"
        self.focus_reads = 0
        self.tapped = False
        self.drop_attempts = drop_attempts
        self.entries = 0
        self.commands = []

    def node(self):
        from xml.etree.ElementTree import Element
        focused = self.tapped and self.focus_reads >= 2
        return Element("node", {"resource-id": self.field, "enabled": "true",
            "focused": "true" if focused else "false", "bounds": "[0,0][100,100]",
            "text": "•" * len(self.value) if self.secure else self.value})

    def reveal_node(self, test_id):
        if test_id != self.field:
            raise AssertionError("Local entry must not navigate to another control")
        return self.node()

    def ui(self):
        from xml.etree import ElementTree as ET
        if self.tapped:
            self.focus_reads += 1
        return ET.tostring(self.node(), encoding="unicode")

    def adb(self, *args):
        from types import SimpleNamespace
        import shlex
        self.commands.append(args[:3])
        if args[:3] == ("shell", "input", "tap"):
            self.tapped = True
            self.focus_reads = 0
        elif args[:3] == ("shell", "input", "text"):
            if self.focus_reads < 2:
                raise AssertionError("Input arrived before focused accessibility observations")
            self.entries += 1
            value = shlex.split(args[3])[0]
            self.value = value[1:] if self.entries <= self.drop_attempts else value
        elif args[:3] == ("shell", "input", "keyevent") and "KEYCODE_DEL" in args:
            self.value = ""
        return SimpleNamespace(returncode=0, stdout="")


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

    def test_room_suite_pregrants_only_notifications_on_android_13_and_later(self):
        from types import SimpleNamespace
        for sdk in ("33", "36"):
            with self.subTest(sdk=sdk):
                device = mock.Mock()
                device.adb.return_value = SimpleNamespace(stdout=sdk)
                self.assertEqual(smoke.prepare_notification_permission(device),
                                 "pregranted_for_room_command_test")
                self.assertEqual(device.adb.call_args_list, [
                    mock.call("shell", "getprop", "ro.build.version.sdk"),
                    mock.call("shell", "pm", "grant", smoke.PACKAGE,
                              "android.permission.POST_NOTIFICATIONS"),
                ])

    def test_room_suite_does_not_grant_notifications_on_older_android(self):
        from types import SimpleNamespace
        device = mock.Mock()
        device.adb.return_value = SimpleNamespace(stdout="32")
        self.assertEqual(smoke.prepare_notification_permission(device), "not_required")
        device.adb.assert_called_once_with("shell", "getprop", "ro.build.version.sdk")

    def test_unknown_api_level_and_failed_permission_setup_abort_the_test(self):
        from types import SimpleNamespace
        device = mock.Mock()
        for sdk in ("", "unknown", "36 private-metadata"):
            device.adb.return_value = SimpleNamespace(stdout=sdk)
            with self.assertRaises(ValueError):
                smoke.prepare_notification_permission(device)
        device.adb.side_effect = [SimpleNamespace(stdout="36"), RuntimeError("grant failed")]
        with self.assertRaises(RuntimeError):
            smoke.prepare_notification_permission(device)

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
        device.adb.return_value.stdout = "Physical size: 1080x2400"
        module = smoke.load_device()
        node = smoke.reveal_room_control(device, module, "room-save")
        self.assertEqual(node.attrib["resource-id"], "room-save")
        command = next(call.args for call in device.adb.call_args_list
                       if call.args[:3] == ("shell", "input", "swipe"))
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



    def test_room_title_display_allows_bidi_controls_but_not_different_text(self):
        self.assertTrue(smoke.room_title_display_matches("7315082649"))
        self.assertTrue(smoke.room_title_display_matches("\u200f7315082649"))
        self.assertTrue(smoke.room_title_display_matches("\u20677315082649\u2069"))
        self.assertFalse(smoke.room_title_display_matches("7315082649X"))
        self.assertFalse(smoke.room_title_display_matches(" 7315082649"))
        self.assertFalse(smoke.room_title_display_matches("7315082648"))

    def test_visible_editor_save_footer_can_be_outside_scroll_viewport(self):
        device = mock.Mock()
        device.ui.return_value = ('<hierarchy><node class="android.widget.ScrollView" scrollable="true" '
            'bounds="[24,300][1056,1800]"/><node resource-id="room-save" enabled="true" '
            'visible-to-user="true" bounds="[60,1900][1020,2050]"/></hierarchy>')
        device.adb.return_value.stdout = "Physical size: 1080x2400"
        node = smoke.reveal_room_control(device, smoke.load_device(), "room-save")
        self.assertEqual(node.attrib["resource-id"], "room-save")
        self.assertFalse(any(call.args[:3] == ("shell", "input", "swipe")
                             for call in device.adb.call_args_list))


    def test_entry_waits_for_focus_clears_stale_text_and_retries_only_locally(self):
        module = smoke.load_device()
        device = LocalFieldDevice(module, drop_attempts=1)
        diagnostics = []
        clock = iter(range(1000))
        with mock.patch.object(smoke.time, "monotonic", side_effect=lambda: next(clock)), \
             mock.patch.object(smoke.time, "sleep"), \
             mock.patch.object(smoke.urllib.request, "urlopen") as network:
            smoke.enter_local_field(device, module, "login-email", "public.preview@example.test", diagnostics)
        self.assertEqual(device.entries, 2)
        self.assertTrue(diagnostics[-1]["verified"])
        self.assertEqual(diagnostics[0]["initial_display_length"], 5)
        self.assertTrue(all(item["focused_before_input"] for item in diagnostics))
        network.assert_not_called()
        self.assertNotIn("public.preview@example.test", json.dumps(diagnostics))
        self.assertTrue(all(command[:2] == ("shell", "input") for command in device.commands))

    def test_unverified_local_entry_is_bounded_and_never_submits_or_exposes_value(self):
        module = smoke.load_device()
        device = LocalFieldDevice(module, drop_attempts=100)
        diagnostics = []
        clock = iter(range(1000))
        with mock.patch.object(smoke.time, "monotonic", side_effect=lambda: next(clock)), \
             mock.patch.object(smoke.time, "sleep"), \
             mock.patch.object(smoke.urllib.request, "urlopen") as network:
            with self.assertRaises(smoke.RoomCreateFailure) as failure:
                smoke.enter_local_field(device, module, "login-email", "public.preview@example.test", diagnostics)
        self.assertEqual(device.entries, 2)
        self.assertEqual(len(diagnostics), 2)
        self.assertEqual(failure.exception.kind, "local_field_verification_failed")
        self.assertNotIn("public.preview@example.test", json.dumps(diagnostics))
        self.assertNotIn("public.preview@example.test", str(failure.exception))
        network.assert_not_called()

    def test_title_shape_preserves_strict_numeric_fixture_without_private_normalization(self):
        self.assertTrue(smoke.room_title_display_matches("7315082649"))
        self.assertTrue(smoke.room_title_display_matches("\u200f7315082649"))
        self.assertFalse(smoke.room_title_display_matches("7315082649 "))
        shape = smoke.title_shape(" 7315082649\u200f ")
        self.assertEqual(shape["ascii_digits"], 10)
        self.assertEqual(shape["format_controls"], 1)
        self.assertEqual(shape["whitespace"], 2)
        self.assertEqual(shape["letters"], 0)


    def test_password_entry_checks_masked_length_without_recording_the_password(self):
        module = smoke.load_device()
        device = LocalFieldDevice(module, field="login-password", secure=True)
        diagnostics = []
        clock = iter(range(1000))
        value = "Aa42!+%25=&Public"
        with mock.patch.object(smoke.time, "monotonic", side_effect=lambda: next(clock)), \
             mock.patch.object(smoke.time, "sleep"), \
             mock.patch.object(smoke.urllib.request, "urlopen") as network:
            smoke.enter_local_field(device, module, "login-password", value, diagnostics)
        self.assertEqual(device.entries, 1)
        self.assertTrue(diagnostics[0]["verified"])
        self.assertEqual(diagnostics[0]["display_length"], len(value))
        self.assertNotIn(value, json.dumps(diagnostics))
        network.assert_not_called()


    def test_room_creation_uses_one_fixed_footer_save_without_modal_back(self):
        module = smoke.load_device()
        from xml.etree.ElementTree import Element
        node = Element("node", {"enabled": "true", "bounds": "[0,0][100,100]"})
        device = mock.Mock()
        device.wait_node.return_value = node
        device.ui.return_value = ('<hierarchy><node text="أنشئ مساحتك الصوتية"/>'
            '<node resource-id="room-save" enabled="true" bounds="[0,0][100,100]"/></hierarchy>')
        def response(*args):
            from types import SimpleNamespace
            value = ("Physical size: 1080x2400" if args == ("shell", "wm", "size") else
                     "mInputShown=true" if args == ("shell", "dumpsys", "input_method") else
                     "  Window #0 Window{abc u0 InputMethod}:\n    Frames: frame=[0,128][1080,2400]\n"
                     "    InsetsSource: {3 mType=ime mFrame=[0,1400][1080,2400] mVisible=true}")
            return SimpleNamespace(returncode=0, stdout=value)
        device.adb.side_effect = response
        report = {}
        with mock.patch.object(smoke, "reveal_room_control", return_value=node), \
             mock.patch.object(smoke, "enter_local_field"), \
             mock.patch.object(smoke, "safe_room_snapshot", return_value={
                 "room_name_matches": True, "modal_title_present": True,
                 "controls": {"room-save": {"present": True, "enabled": True,
                                             "visible": True, "center_on_screen": True}}}), \
             mock.patch.object(smoke.urllib.request, "urlopen") as network:
            smoke.create_native_host_room(device, module, report, "manual_create")
        back_sent = any(call.args[:4] == ("shell", "input", "keyevent", "KEYCODE_BACK")
                        for call in device.adb.call_args_list)
        self.assertFalse(back_sent)
        self.assertEqual(sum(call.args[:3] == ("shell", "input", "tap")
                             for call in device.adb.call_args_list), 2)
        self.assertEqual(report["keyboard_actions"]["manual_create_modal_save"],
                         {"keyboard": "shown", "action": "tap_fixed_footer_with_ime",
                          "sent_back": False, "modal_present": True})
        network.assert_not_called()

    def test_room_creation_stops_if_the_modal_disappears_before_save(self):
        module = smoke.load_device()
        from xml.etree.ElementTree import Element
        node = Element("node", {"enabled": "true", "bounds": "[0,0][100,100]"})
        device = mock.Mock()
        device.wait_node.return_value = node
        device.ui.return_value = "<hierarchy/>"
        device.adb.return_value.stdout = "mInputShown=true"
        report = {}
        with mock.patch.object(smoke, "reveal_room_control", return_value=node), \
             mock.patch.object(smoke, "enter_local_field"), \
             mock.patch.object(smoke, "safe_room_snapshot", return_value={
                 "room_name_matches": True, "modal_title_present": True,
                 "controls": {"room-save": {"present": True, "enabled": True,
                                             "visible": True, "center_on_screen": True}}}), \
             mock.patch.object(smoke.urllib.request, "urlopen") as network:
            with self.assertRaises(smoke.RoomCreateFailure) as failure:
                smoke.create_native_host_room(device, module, report, "manual_create")
        self.assertEqual(failure.exception.kind, "room_modal_not_present")
        self.assertFalse(report["keyboard_actions"]["manual_create_modal_save"]["modal_present"])
        self.assertEqual(sum(call.args[:3] == ("shell", "input", "tap")
                             for call in device.adb.call_args_list), 1)
        network.assert_not_called()


    def footer_device(self, bounds, windows):
        from types import SimpleNamespace
        device = mock.Mock()
        device.ui.return_value = ('<hierarchy><node resource-id="room-save" enabled="true" '
            'visible-to-user="true" bounds="' + bounds + '"/></hierarchy>')
        def response(*args):
            value = ("Physical size: 1080x2400" if args == ("shell", "wm", "size") else
                     "mInputShown=true" if args == ("shell", "dumpsys", "input_method") else windows)
            return SimpleNamespace(returncode=0, stdout=value)
        device.adb.side_effect = response
        return device

    def test_screen_visible_footer_behind_ime_never_receives_a_tap_or_request(self):
        device = self.footer_device("[20,1900][1060,2100]",
            "  Window #2 Window{abc u0 InputMethod}:\n"
            "    Frames: parent=[0,0][1080,2400] display=[0,0][1080,2400] frame=[0,128][1080,2400]\n"
            "    InsetsSource: {3 mType=ime mFrame=[0,1400][1080,2400] mVisible=true}\n"
            "    PRIVATE_EDITOR_METADATA")
        report = {}
        with mock.patch.object(smoke.urllib.request, "urlopen") as network:
            with self.assertRaises(smoke.RoomCreateFailure) as error:
                smoke.tap_room_save(device, smoke.load_device(), report, "manual")
        self.assertEqual(error.exception.kind, "room_save_field_overlaps_ime")
        self.assertTrue(report["room_save_geometry"]["manual"]["overlaps_ime"])
        self.assertFalse(any(call.args[:2] == ("shell", "input") for call in device.adb.call_args_list))
        self.assertNotIn("PRIVATE_EDITOR_METADATA", json.dumps(report))
        network.assert_not_called()

    def test_footer_above_visible_ime_receives_exactly_one_tap_without_back(self):
        device = self.footer_device("[20,1100][1060,1250]",
            "    InsetsSource: {mType=ime mFrame=[0,1400][1080,2400] mVisible=true}")
        report = {}
        with mock.patch.object(smoke.urllib.request, "urlopen") as network:
            smoke.tap_room_save(device, smoke.load_device(), report, "manual")
        inputs = [call.args for call in device.adb.call_args_list if call.args[:2] == ("shell", "input")]
        self.assertEqual(inputs, [("shell", "input", "tap", "540", "1175")])
        self.assertTrue(report["room_save_geometry"]["manual"]["reachable"])
        self.assertEqual(report["room_save_geometry"]["manual"]["ime_bounds_px"], [0, 1400, 1080, 2400])
        network.assert_not_called()

    def test_shown_ime_with_unknown_frame_refuses_unrelated_window_geometry(self):
        for windows in (
            "  Window #0 Window{abc u0 MainActivity}:\n    mFrame=[0,0][1080,2400]",
            "  Window #0 Window{abc u0 InputMethod}:\n    mFrame=[0,1400][20000,2400]",
            "PRIVATE_EDITOR_METADATA",
        ):
            with self.subTest(case="untrusted_geometry"):
                device = self.footer_device("[20,1100][1060,1250]", windows)
                report = {}
                with self.assertRaises(smoke.RoomCreateFailure) as error:
                    smoke.tap_room_save(device, smoke.load_device(), report, "manual")
                self.assertEqual(error.exception.kind, "room_save_ime_geometry_unknown")
                self.assertFalse(any(call.args[:2] == ("shell", "input") for call in device.adb.call_args_list))
                self.assertNotIn("PRIVATE_EDITOR_METADATA", json.dumps(report))


    def test_nearly_full_screen_ime_window_is_not_occupied_keyboard_evidence(self):
        from types import SimpleNamespace
        surface = "  Window #0 Window{abc u0 InputMethod}:\n    mFrame=[0,128][1080,2400]"
        self.assertIsNone(smoke.ime_geometry.ime_frame(surface, 1080, 2400))
        device = mock.Mock()
        def response(*args):
            if args == ("shell", "dumpsys", "input_method"):
                return SimpleNamespace(returncode=0, stdout="mInputShown=true")
            if args == ("shell", "dumpsys", "window", "displays"):
                return SimpleNamespace(returncode=0, stdout=surface + "\n"
                    "mRawInsetsState=InsetsState: {mSources= {InsetsSource: {3 mType=ime "
                    "mFrame=[0,1440][1080,2400] mVisible=true}}}")
            raise AssertionError("Valid display InsetsSource must not query stale window frames")
        device.adb.side_effect = response
        result = smoke.ime_geometry.observe(device, [66, 1231, 1014, 1378], 1080, 2400)
        self.assertTrue(result["reachable"])
        self.assertFalse(result["overlaps_ime"])
        self.assertEqual(result["ime_bounds_px"], [0, 1440, 1080, 2400])
        self.assertEqual(result["ime_source_query"], "displays")

    def test_visible_ime_insets_support_dump_formats_but_refuse_hidden_or_conflicting_sources(self):
        for text in (
            "InsetsSource: {3 mType=ime mFrame=[0,1440][1080,2400] mVisible=true}",
            "    InsetsSource id=3 type=ime frame=[0,1440][1080,2400] visible=true flags=[]",
            "InsetsSource: {3 mType=ime mFrame=Rect(0, 1440 - 1080, 2400) mVisible=true}",
        ):
            self.assertEqual(smoke.ime_geometry.ime_frame(text, 1080, 2400), [0, 1440, 1080, 2400])
        for text in (
            "InsetsSource: {1 mType=statusBars mFrame=[0,0][1080,128] mVisible=true}, "
            "InsetsSource: {3 mType=ime mFrame=[0,1440][1080,2400] mVisible=false}",
            "InsetsSource: {3 mType=ime mFrame=[0,1440][1080,2400] mVisible=true}, "
            "InsetsSource: {4 mType=ime mFrame=[0,1400][1080,2400] mVisible=true}",
            "InsetsSource: {3 mType=ime mFrame=[0,1440][20000,2400] mVisible=true}",
        ):
            frame, diagnostic = smoke.ime_geometry.inspect_ime_sources(text, 1080, 2400)
            self.assertIsNone(frame)
            self.assertLessEqual(diagnostic["source_records"], 32)


if __name__ == "__main__":
    unittest.main()
