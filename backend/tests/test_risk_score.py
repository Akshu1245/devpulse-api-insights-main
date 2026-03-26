"""Tests for the unified risk scoring engine."""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.risk_score import calculate_risk_score


class TestCalculateRiskScore(unittest.TestCase):
    """Test suite for calculate_risk_score()."""

    # --- Boundary: zero inputs ---
    def test_all_zeros(self):
        result = calculate_risk_score(0.0, 0.0)
        self.assertEqual(result["combined_score"], 0.0)
        self.assertEqual(result["category"], "SAFE")

    # --- Boundary: max inputs ---
    def test_all_max(self):
        result = calculate_risk_score(10.0, 10.0)
        self.assertEqual(result["combined_score"], 100.0)
        self.assertEqual(result["category"], "CRITICAL")

    # --- Category thresholds ---
    def test_safe_below_25(self):
        result = calculate_risk_score(1.0, 1.0)
        # (0.6*1 + 0.4*1) * 10 = 10.0
        self.assertEqual(result["combined_score"], 10.0)
        self.assertEqual(result["category"], "SAFE")

    def test_warning_at_25(self):
        result = calculate_risk_score(2.5, 2.5)
        # (0.6*2.5 + 0.4*2.5) * 10 = 25.0
        self.assertEqual(result["combined_score"], 25.0)
        self.assertEqual(result["category"], "WARNING")

    def test_danger_at_50(self):
        result = calculate_risk_score(5.0, 5.0)
        # (0.6*5 + 0.4*5) * 10 = 50.0
        self.assertEqual(result["combined_score"], 50.0)
        self.assertEqual(result["category"], "DANGER")

    def test_critical_at_75(self):
        result = calculate_risk_score(7.5, 7.5)
        # (0.6*7.5 + 0.4*7.5) * 10 = 75.0
        self.assertEqual(result["combined_score"], 75.0)
        self.assertEqual(result["category"], "CRITICAL")

    # --- Custom weights ---
    def test_custom_weights_security_heavy(self):
        result = calculate_risk_score(8.0, 2.0, {"security": 0.8, "cost": 0.2})
        # (0.8*8 + 0.2*2) * 10 = 68.0
        self.assertEqual(result["combined_score"], 68.0)
        self.assertEqual(result["weights_used"]["security"], 0.8)
        self.assertEqual(result["weights_used"]["cost"], 0.2)

    def test_custom_weights_cost_heavy(self):
        result = calculate_risk_score(2.0, 8.0, {"security": 0.2, "cost": 0.8})
        # (0.2*2 + 0.8*8) * 10 = 68.0
        self.assertEqual(result["combined_score"], 68.0)

    def test_weights_auto_normalized(self):
        """Weights that don't sum to 1.0 are normalized."""
        result = calculate_risk_score(5.0, 5.0, {"security": 3.0, "cost": 1.0})
        # w1=0.75, w2=0.25 → (0.75*5 + 0.25*5)*10 = 50.0
        self.assertEqual(result["combined_score"], 50.0)
        self.assertAlmostEqual(result["weights_used"]["security"], 0.75)
        self.assertAlmostEqual(result["weights_used"]["cost"], 0.25)

    # --- Asymmetric inputs ---
    def test_high_security_low_cost(self):
        result = calculate_risk_score(9.0, 1.0)
        # (0.6*9 + 0.4*1) * 10 = 58.0
        self.assertEqual(result["combined_score"], 58.0)
        self.assertEqual(result["category"], "DANGER")

    def test_low_security_high_cost(self):
        result = calculate_risk_score(1.0, 9.0)
        # (0.6*1 + 0.4*9) * 10 = 42.0
        self.assertEqual(result["combined_score"], 42.0)
        self.assertEqual(result["category"], "WARNING")

    # --- Breakdown accuracy ---
    def test_breakdown_sums_to_total(self):
        result = calculate_risk_score(6.0, 4.0)
        total = (
            result["breakdown"]["security_contribution"]
            + result["breakdown"]["cost_contribution"]
        )
        self.assertAlmostEqual(total, result["combined_score"], places=1)

    # --- Input validation ---
    def test_security_negative_raises(self):
        with self.assertRaises(ValueError):
            calculate_risk_score(-1.0, 5.0)

    def test_security_over_10_raises(self):
        with self.assertRaises(ValueError):
            calculate_risk_score(11.0, 5.0)

    def test_cost_negative_raises(self):
        with self.assertRaises(ValueError):
            calculate_risk_score(5.0, -1.0)

    def test_cost_over_10_raises(self):
        with self.assertRaises(ValueError):
            calculate_risk_score(5.0, 11.0)

    def test_zero_weight_sum_raises(self):
        with self.assertRaises(ValueError):
            calculate_risk_score(5.0, 5.0, {"security": 0.0, "cost": 0.0})

    # --- Output structure ---
    def test_output_keys(self):
        result = calculate_risk_score(3.0, 3.0)
        self.assertIn("combined_score", result)
        self.assertIn("category", result)
        self.assertIn("inputs", result)
        self.assertIn("weights_used", result)
        self.assertIn("breakdown", result)
        self.assertIn("security_contribution", result["breakdown"])
        self.assertIn("cost_contribution", result["breakdown"])

    # --- Example from spec ---
    def test_example_low_risk(self):
        """Example: security=2.0, cost=1.0 → SAFE"""
        result = calculate_risk_score(2.0, 1.0)
        # (0.6*2 + 0.4*1) * 10 = 16.0
        self.assertEqual(result["combined_score"], 16.0)
        self.assertEqual(result["category"], "SAFE")

    def test_example_critical(self):
        """Example: security=9.0, cost=8.0, custom weights → CRITICAL"""
        result = calculate_risk_score(9.0, 8.0, {"security": 0.7, "cost": 0.3})
        # (0.7*9 + 0.3*8) * 10 = 87.0
        self.assertEqual(result["combined_score"], 87.0)
        self.assertEqual(result["category"], "CRITICAL")


if __name__ == "__main__":
    unittest.main()
