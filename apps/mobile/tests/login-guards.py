#!/usr/bin/env python3
"""Guards around credentialed QA: isolation, encoding and report privacy."""
import contextlib
import importlib.util
import io
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


if __name__ == "__main__":
    unittest.main()
