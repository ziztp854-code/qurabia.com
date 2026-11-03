import json
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent

class IsolationTest(unittest.TestCase):
    def test_signaling_isolation_and_gateway_admission(self):
        result = subprocess.run(['node', str(HERE / 'run-isolation.mjs')], capture_output=True, text=True, timeout=180)
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(result.stdout)
        expected = {'noSfuPublished', 'loopbackGateway', 'trusted', 'blocked', 'admin', 'denied', 'allowed'}
        self.assertEqual(set(evidence), expected)
        for check in expected:
            self.assertIs(evidence[check], True, check)

if __name__ == '__main__':
    unittest.main()
