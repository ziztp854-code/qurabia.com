"""Safety and instrumentation tests. No adb, backend or credentials are used."""
import importlib.util
import pathlib
import unittest
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

    def test_ui_text_does_not_substitute_for_the_expected_native_control(self):
        xml = """<hierarchy>
          <node text="login-submit" resource-id="different-control" bounds="[0,0][100,50]" />
        </hierarchy>"""
        self.assertIsNone(smoke.find_node(xml, "login-submit"))


if __name__ == "__main__":
    unittest.main()
