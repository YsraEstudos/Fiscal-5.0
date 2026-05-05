import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = "test-token"
    os.environ["KM_MAX_FILE_SIZE_MB"] = "25"
    os.environ["KM_MAX_FILES_PER_ITEM"] = "20"
    return load_reporting_modules()


class E2EIncrementalTests(unittest.TestCase):
    def test_lote_parcial_mantem_incremental(self):
        with tempfile.TemporaryDirectory() as tmp:
            mod = load_service(tmp)
            client = TestClient(mod.app)
            headers = {"X-KM-Token": "test-token"}
            session_run = "session_e2e_30_stop_15"

            for i in range(1, 16):
                manifest = {
                    "manifestVersion": 2,
                    "itemId": f"{250000 + i}",
                    "sessionRunId": session_run,
                    "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
                    "historicoSummary": {"criticalFiscalRework": i % 3 == 0, "fiscalTransitionsCount": 3 if i % 3 == 0 else 1},
                    "historicoTimeline": [],
                }
                resp = client.post(
                    "/reports/item",
                    data={"manifest": json.dumps(manifest)},
                    headers=headers,
                )
                self.assertEqual(resp.status_code, 200)

            session_dir = Path(tmp) / session_run
            self.assertTrue(session_dir.exists())
            idx = session_dir / "index.jsonl"
            self.assertTrue(idx.exists())
            lines = idx.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 15)

            item_dirs = [p for p in session_dir.iterdir() if p.is_dir() and p.name.startswith("item_")]
            self.assertEqual(len(item_dirs), 15)
            for d in item_dirs:
                self.assertTrue(any(d.glob("item_*.pdf")))
                self.assertTrue(any(d.glob("item_*.md")))


if __name__ == "__main__":
    unittest.main()
