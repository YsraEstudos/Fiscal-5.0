import importlib
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str, retention_days: int = 0):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = "test-token"
    os.environ["KM_MAX_FILE_SIZE_MB"] = "2"
    os.environ["KM_MAX_FILES_PER_ITEM"] = "5"
    os.environ["KM_REPORT_RETENTION_DAYS"] = str(retention_days)
    os.environ["KM_OCR_PDF_STRATEGY"] = "max_compat"
    return load_reporting_modules()


class ReportingServiceFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mod = load_service(self.tmp.name)
        self.client = TestClient(self.mod.app)
        self.headers = {"X-KM-Token": "test-token"}

    def tearDown(self):
        self.tmp.cleanup()

    def test_draw_wrapped_and_ensure_drawable_image_fallback_conversion(self):
        from reportlab.pdfgen import canvas

        pdf = Path(self.tmp.name) / "x.pdf"
        c = canvas.Canvas(str(pdf))
        y2 = self.mod.draw_wrapped(c, "texto longo de teste para quebra de linha", 10, 800, 80)
        self.assertLess(y2, 800)
        c.save()

        class FakeConverted:
            def save(self, path, format=None):
                Path(path).write_bytes(b"PNG")

        class FakeImg:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def convert(self, _mode):
                return FakeConverted()

        src = Path(self.tmp.name) / "img.any"
        src.write_bytes(b"raw")
        with patch.object(self.mod, "ImageReader", side_effect=RuntimeError("bad image")), patch.object(
            self.mod.Image, "open", return_value=FakeImg()
        ):
            out, converted = self.mod.ensure_drawable_image(src)
        self.assertTrue(converted)
        self.assertTrue(out.exists())
        self.assertEqual(out.suffix.lower(), ".png")

    def test_cleanup_old_reports_removes_only_expired_dirs(self):
        mod = load_service(self.tmp.name, retention_days=1)
        base = Path(self.tmp.name)
        old_dir = base / "session_old"
        new_dir = base / "session_new"
        old_dir.mkdir(parents=True, exist_ok=True)
        new_dir.mkdir(parents=True, exist_ok=True)
        (old_dir / "a.txt").write_text("x", encoding="utf-8")
        (new_dir / "b.txt").write_text("y", encoding="utf-8")

        old_ts = (datetime.now(timezone.utc) - timedelta(days=3)).timestamp()
        os.utime(old_dir, (old_ts, old_ts))
        os.utime(old_dir / "a.txt", (old_ts, old_ts))

        mod.cleanup_old_reports()
        self.assertFalse(old_dir.exists())
        self.assertTrue(new_dir.exists())

    def test_build_session_markdown_handles_invalid_lines_duplicates_and_missing_md(self):
        session_dir = Path(self.tmp.name) / "session_md_mix"
        session_dir.mkdir(parents=True, exist_ok=True)
        idx = session_dir / "index.jsonl"
        idx.write_text(
            "\n".join(
                [
                    "{",
                    json.dumps({"type": "SESSION_TOUCH", "itemId": "TOUCH"}),
                    json.dumps({"itemId": "A1", "timestamp": "2026-02-18T10:00:00"}),
                    json.dumps({"itemId": "A1", "timestamp": "2026-02-18T11:00:00"}),
                    json.dumps({"itemId": "A2", "timestamp": "2026-02-18T12:00:00", "mdPath": str(session_dir / "missing.md")}),
                ]
            ),
            encoding="utf-8",
        )
        item_a1 = session_dir / "item_A1"
        item_a1.mkdir(parents=True, exist_ok=True)
        (item_a1 / "item_A1.md").write_text("", encoding="utf-8")

        out = self.mod.build_session_markdown(session_dir, "session_md_mix")
        txt = out.read_text(encoding="utf-8")
        self.assertIn("itens consolidados: `2`", txt)
        self.assertIn("Markdown do item existe, mas está vazio", txt)
        self.assertIn("Markdown do item não encontrado", txt)

    def test_api_error_paths_for_md_and_rebuild(self):
        resp1 = self.client.get("/api/sessions/sessao_inexistente/md")
        self.assertEqual(resp1.status_code, 404)

        resp2 = self.client.post("/api/items/s1/i1/rebuild-md")
        self.assertEqual(resp2.status_code, 404)

        # item exists but markdown does not
        session_dir = Path(self.tmp.name) / "s2"
        item_dir = session_dir / "item_i2"
        item_dir.mkdir(parents=True, exist_ok=True)
        resp3 = self.client.post("/api/items/s2/i2/rebuild-md")
        self.assertEqual(resp3.status_code, 404)
        self.assertIn("item markdown not found", resp3.text)

    def test_touch_session_returns_500_when_metadata_write_fails(self):
        original_write_text = Path.write_text

        def fail_only_meta(path_obj, *args, **kwargs):
            if str(path_obj).endswith("session_meta.json"):
                raise OSError("disk failure")
            return original_write_text(path_obj, *args, **kwargs)

        with patch("pathlib.Path.write_text", side_effect=fail_only_meta):
            resp = self.client.post(
                "/reports/session/touch",
                json={"sessionRunId": "session_fail_meta"},
                headers=self.headers,
            )
        self.assertEqual(resp.status_code, 500)
        self.assertIn("falha ao atualizar metadados", resp.text)

    def test_report_item_unsupported_media_warning_and_generation_failure(self):
        manifest = {
            "manifestVersion": 2,
            "itemId": "FS01",
            "sessionRunId": "session_fs01",
            "ocrEngine": "invalid-engine",
            "ocrEnabled": True,
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 1, "imagens": 0, "pdfs": 0, "unsupported": 1},
        }
        files = [("files", ("planilha.txt", b"abc", "text/plain"))]
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            files=files,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertTrue(any("Mídia não suportada" in w for w in data["warnings"]))

        with patch.object(self.mod, "write_markdown", side_effect=RuntimeError("boom")):
            resp2 = self.client.post(
                "/reports/item",
                data={"manifest": json.dumps({**manifest, "itemId": "FS02"})},
                headers=self.headers,
            )
        self.assertEqual(resp2.status_code, 500)
        self.assertIn("falha ao gerar arquivos finais", resp2.text)


if __name__ == "__main__":
    unittest.main()
