"""Safety and instrumentation tests. No adb, backend or credentials are used."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch
import urllib.request

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "android-native-smoke.py"
SPEC = importlib.util.spec_from_file_location("android_native_smoke", SCRIPT)
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class NativeSmokeGuards(unittest.TestCase):
    def test_read_only_public_origin_still_requires_verified_https(self):
        self.assertEqual(smoke.origin("https://qurabia.com/"), "https://qurabia.com")
        for value in (
            "http://qurabia.com",
            "https://user:secret@qa.example.test",
            "https://qa.example.test/path",
            "https://qa.example.test?token=secret",
            "https://qa.example.test#fragment",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                smoke.origin(value)

    def test_optional_authenticated_flow_can_never_use_production(self):
        for value in ("https://qurabia.com", "https://www.qurabia.com"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                smoke.authenticated_target(value, value, "temporary@example.test", "TestOnly-123!")

    def test_optional_authenticated_flow_requires_matching_isolated_origin(self):
        with self.assertRaises(ValueError):
            smoke.authenticated_target(
                "https://qurabia.com", "https://qa.example.test",
                "temporary@example.test", "TestOnly-123!",
            )
        self.assertEqual(
            smoke.authenticated_target(
                "https://qa.example.test", "https://qa.example.test",
                "temporary@example.test", "TestOnly-123!",
            ),
            "https://qa.example.test",
        )

    def test_partial_or_unsupported_credentials_fail_before_device_interaction(self):
        for email, password in (("", "TestOnly-123!"), ("temporary@example.test", ""),
                                ("temporary@example.test", "shell;injection")):
            with self.subTest(email=email), self.assertRaises(ValueError):
                smoke.authenticated_target(
                    "https://qa.example.test", "https://qa.example.test", email, password,
                )

    def test_read_only_probes_use_canonical_paths_without_requiring_a_redirect(self):
        requested = []

        class Response:
            def __init__(self, url):
                self.url = url
                self.status = 200 if url.endswith("/api/auth/session/") else 401

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                return b"{}" if self.status == 200 else b'{"error":"unauthenticated"}'

        class Opener:
            def open(self, request, timeout):
                requested.append((request.get_method(), request.full_url))
                return Response(request.full_url)

        with patch.object(smoke.urllib.request, "build_opener", return_value=Opener()):
            result = smoke.read_only_reachability("https://qa.example.test")
        self.assertEqual(requested, [
            ("GET", "https://qa.example.test/api/auth/session/"),
            ("GET", "https://qa.example.test/api/voice/rooms/"),
        ])
        self.assertEqual(result["/api/auth/session/"]["status"], 200)
        self.assertEqual(result["/api/voice/rooms/"]["status"], 401)

    def test_redirect_cannot_follow_external_or_cleartext_targets(self):
        handler = smoke.SameOriginRedirect("https://qa.example.test")
        request = urllib.request.Request("https://qa.example.test/api/auth/session")
        for target in ("http://qa.example.test/api/auth/session",
                       "https://qurabia.com/api/auth/session"):
            with self.subTest(target=target), self.assertRaises(RuntimeError):
                handler.redirect_request(request, None, 302, "Found", {}, target)
        redirected = handler.redirect_request(
            request, None, 302, "Found", {}, "https://qa.example.test/api/auth/session/",
        )
        self.assertEqual(redirected.full_url, "https://qa.example.test/api/auth/session/")

    def test_selects_visible_native_test_id_and_ignores_hidden_nodes(self):
        xml = """<hierarchy>
          <node resource-id="login-submit" bounds="[0,0][0,0]" />
          <node resource-id="com.qurabia.tahaddi:id/login-submit" bounds="[20,40][100,80]" />
        </hierarchy>"""
        node = smoke.find_node(xml, "login-submit")
        self.assertIsNotNone(node)
        self.assertEqual(smoke.center(node), (60, 60))
        self.assertIsNone(smoke.find_node(xml, "missing-control"))

    def test_server_status_reads_nested_accessibility_text(self):
        xml = """<node resource-id="server-status" bounds="[0,0][100,50]">
          <node text="تم الاتصال بخادم تحدّي" />
        </node>"""
        self.assertIn("تم الاتصال بخادم تحدّي", smoke.node_label(smoke.find_node(xml, "server-status")))

    def test_native_connectivity_waits_for_real_online_status_instead_of_accepting_pending(self):
        pending = smoke.ET.fromstring('<node text="جارٍ التحقق من الاتصال بالخادم…" />')
        online = smoke.ET.fromstring('<node text="تم الاتصال بخادم تحدّي" />')

        class DeviceFixture:
            calls = 0

            def wait_node(self, test_id, timeout):
                self.calls += 1
                return pending if self.calls == 1 else online

        device = DeviceFixture()
        with patch.object(smoke.time, "sleep"):
            result = smoke.Device.connection_status(device, timeout=5)
        self.assertEqual(result["state"], "online")
        self.assertEqual(device.calls, 2)

    def test_failed_native_probe_is_reported_failed_without_becoming_runner_success(self):
        failed = smoke.ET.fromstring('<node text="تعذر الاتصال بخادم تحدّي" />')

        class DeviceFixture:
            def wait_node(self, test_id, timeout):
                return failed

        result = smoke.Device.connection_status(DeviceFixture(), timeout=5)
        self.assertEqual(result["state"], "failed")
        self.assertIn("تعذر الاتصال", result["label"])

    def test_ui_text_does_not_substitute_for_the_expected_native_control(self):
        xml = """<hierarchy>
          <node text="login-submit" resource-id="different-control" bounds="[0,0][100,50]" />
        </hierarchy>"""
        self.assertIsNone(smoke.find_node(xml, "login-submit"))


if __name__ == "__main__":
    unittest.main()
