"""Tests for the demo abuse guards. Stdlib only:  python -m unittest"""

import unittest

from app.guards import RateLimiter, client_ip


class RateLimiterTest(unittest.TestCase):
    def test_allows_up_to_the_limit_then_blocks(self) -> None:
        limiter = RateLimiter(max_per_minute=3)
        results = [limiter.is_allowed("1.2.3.4", now=0.0) for _ in range(4)]
        self.assertEqual(results, [True, True, True, False])

    def test_window_slides(self) -> None:
        limiter = RateLimiter(max_per_minute=2)
        self.assertTrue(limiter.is_allowed("ip", now=0.0))
        self.assertTrue(limiter.is_allowed("ip", now=10.0))
        self.assertFalse(limiter.is_allowed("ip", now=20.0))
        # 61s after the first hit: the first hit has aged out, room for one more.
        self.assertTrue(limiter.is_allowed("ip", now=61.0))

    def test_keys_are_independent(self) -> None:
        limiter = RateLimiter(max_per_minute=1)
        self.assertTrue(limiter.is_allowed("a", now=0.0))
        self.assertTrue(limiter.is_allowed("b", now=0.0))
        self.assertFalse(limiter.is_allowed("a", now=0.0))


class ClientIpTest(unittest.TestCase):
    def test_prefers_first_forwarded_for_entry(self) -> None:
        self.assertEqual(
            client_ip("203.0.113.7, 10.0.0.1", "10.0.0.1"), "203.0.113.7"
        )

    def test_falls_back_to_direct_peer(self) -> None:
        self.assertEqual(client_ip(None, "192.168.1.5"), "192.168.1.5")

    def test_unknown_when_nothing_available(self) -> None:
        self.assertEqual(client_ip(None, None), "unknown")

    def test_ignores_empty_forwarded_for(self) -> None:
        self.assertEqual(client_ip("", "192.168.1.5"), "192.168.1.5")


if __name__ == "__main__":
    unittest.main()
