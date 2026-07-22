import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tracker = load_module("llm_usage_tracker", "llm-usage-tracker.py")
slack_report = load_module("llm_usage_slack_report", "llm-usage-slack-report.py")


class BillingScopeTests(unittest.TestCase):
    def test_does_not_claim_account_total_without_api_key_breakdown(self):
        billing_day = {"cost_usd": 30, "estimated_cost_usd": 30}
        with patch.dict(os.environ, {"LLM_USAGE_FIREWORKS_API_KEY_MATCH": "Production"}, clear=False):
            scoped = tracker.scoped_fireworks_billing_day(billing_day)

        self.assertEqual(scoped["status"], "api_key_breakdown_missing")
        self.assertEqual(scoped["cost_usd"], 0)
        self.assertEqual(scoped["account_cost_usd"], 30)

    def test_scopes_account_cost_to_environment_api_key(self):
        billing_day = {
            "cost_usd": 30,
            "estimated_cost_usd": 30,
            "by_api_key": [
                {"name": "Growie (key_growie)", "cost_usd": 20, "estimated_cost_usd": 20},
                {"name": "SanchoCMO Staging (key_staging)", "cost_usd": 8, "estimated_cost_usd": 8},
                {"name": "SanchoCMO Production (key_prod)", "cost_usd": 2, "estimated_cost_usd": 2},
            ],
        }
        with patch.dict(os.environ, {"LLM_USAGE_FIREWORKS_API_KEY_MATCH": "Production"}, clear=False):
            scoped = tracker.scoped_fireworks_billing_day(billing_day)

        self.assertEqual(scoped["status"], "api_key_matched")
        self.assertEqual(scoped["cost_usd"], 2)
        self.assertEqual(scoped["account_cost_usd"], 30)


class UnifiedSlackReportTests(unittest.TestCase):
    def test_migrates_old_cost_report_channel_to_reportes(self):
        with patch.dict(
            os.environ,
            {"LLM_USAGE_SLACK_CHANNEL": slack_report.LEGACY_SLACK_CHANNEL},
            clear=False,
        ):
            self.assertEqual(slack_report.resolve_slack_channel(), "C0B7KH5SR5X")

    def test_normalizes_legacy_environment_labels(self):
        self.assertEqual(slack_report.display_environment_label("Produccion"), "Sancho Produccion")
        self.assertEqual(slack_report.display_environment_label("Staging"), "Sancho Staging")

    def source(self, label, cost, agents):
        report_date = "2026-07-20"
        billing_day = {
            "cost_usd": 30,
            "by_api_key": [
                {"name": "Growie (key_growie)", "cost_usd": 20},
                {"name": "SanchoCMO Staging (key_staging)", "cost_usd": 8},
                {"name": "SanchoCMO Production (key_prod)", "cost_usd": 2},
            ],
        }
        return {
            "label": label,
            "status": "ok",
            "data": {
                "currency": {"usd_to_eur_rate": 1},
                "sources": {"fireworks_billing_usage": {"status": "ok", "days": {report_date: billing_day}}},
                "days": {
                    report_date: {
                        "sancho_total_cost_usd": cost,
                        "sancho_cost_complete": True,
                        "fireworks_actual_cost_usd": cost,
                        "fireworks_cost_status": "actual",
                        "model_calls": 10,
                        "fireworks_calls": 10,
                        "tool_calls": 5,
                        "sessions": 1,
                        "by_provider": [
                            {"name": "fireworks", "total_cost_usd": cost, "model_calls": 10, "fireworks_calls": 10}
                        ],
                        "by_model": [
                            {"name": "accounts/fireworks/models/glm-5p2", "total_cost_usd": cost}
                        ],
                        "by_agent": agents,
                    }
                },
            },
        }

    def test_lists_three_projects_without_counting_growie_as_sancho(self):
        sources = [
            self.source("Sancho Produccion", 2, [{"name": "sancho", "total_cost_usd": 2, "model_calls": 10}]),
            self.source(
                "Sancho Staging",
                8,
                [
                    {"name": "sancho", "total_cost_usd": 5, "model_calls": 7},
                    {"name": "rocinante", "total_cost_usd": 3, "model_calls": 3},
                ],
            ),
        ]

        text, _ = slack_report.format_unified_report(sources, "2026-07-20")

        self.assertIn("Total Sancho: €10,00", text)
        self.assertIn("Sancho Produccion:* €2,00", text)
        self.assertIn("Sancho Staging:* €8,00", text)
        self.assertIn("Growie: €20,00", text)
        self.assertIn("Total cuenta Fireworks: €30,00", text)
        self.assertIn("Agente Sancho que mas consumio: sancho €7,00", text)


if __name__ == "__main__":
    unittest.main()
