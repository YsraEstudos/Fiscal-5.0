import asyncio
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = "test-token"
    os.environ["KM_MAX_FILE_SIZE_MB"] = "5"
    os.environ["KM_MAX_FILES_PER_ITEM"] = "20"
    os.environ["KM_OCR_PDF_STRATEGY"] = "max_compat"
    return load_reporting_modules()


class ReportingServiceSseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mod = load_service(self.tmp.name)
        self.client = TestClient(self.mod.app)
        self.headers = {"X-KM-Token": "test-token"}

    def tearDown(self):
        self.tmp.cleanup()

    def test_broadcast_sse_removes_dead_subscribers(self):
        ok_queue = asyncio.Queue()

        class DeadQueue:
            def put_nowait(self, _event):
                raise RuntimeError("dead queue")

        dead = DeadQueue()
        self.mod._extraction_subscribers.clear()
        self.mod._extraction_subscribers.extend([ok_queue, dead])
        asyncio.run(self.mod._broadcast_sse({"event": "x", "k": 1}))
        self.assertEqual(len(self.mod._extraction_subscribers), 1)
        self.assertIs(self.mod._extraction_subscribers[0], ok_queue)
        self.assertEqual(ok_queue.get_nowait()["k"], 1)

    def test_run_extraction_updates_status_sidecar_and_events(self):
        item_dir = Path(self.tmp.name) / "sess" / "item_1"
        media_dir = item_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        f1 = media_dir / "a.pdf"
        f2 = media_dir / "b.png"
        f1.write_bytes(b"x")
        f2.write_bytes(b"y")
        session_dir = item_dir.parent
        (session_dir / "index.jsonl").write_text("", encoding="utf-8")

        q = asyncio.Queue()
        self.mod._extraction_subscribers.clear()
        self.mod._extraction_subscribers.append(q)
        self.mod._active_extraction_tasks["sess/1"] = object()

        calls = [
            {"method": "pypdf", "text": "texto extraido", "chars": 13, "pages": 1},
            RuntimeError("boom"),
        ]

        def fake_extract(_path, _engine, _profile=None):
            out = calls.pop(0)
            if isinstance(out, Exception):
                raise out
            return out

        with patch.object(self.mod, "extract_media_text", side_effect=fake_extract):
            asyncio.run(self.mod._run_extraction(item_dir, "1", "sess", [f1, f2], "tesseract"))

        status = json.loads((item_dir / "extraction_status.json").read_text(encoding="utf-8"))
        self.assertEqual(status["files"]["a.pdf"]["status"], "done")
        self.assertEqual(status["files"]["b.png"]["status"], "error")
        self.assertIn("errorCode", status["files"]["b.png"])
        self.assertIn("pipeline", status["files"]["a.pdf"])
        self.assertTrue((media_dir / "a.pdf.extracted.txt").exists())
        self.assertNotIn("sess/1", self.mod._active_extraction_tasks)

    def test_api_extraction_events_stream_and_cleanup(self):
        async def run_case():
            self.mod._extraction_subscribers.clear()
            response = await self.mod.api_extraction_events()
            self.assertEqual(response.media_type, "text/event-stream")
            self.assertEqual(len(self.mod._extraction_subscribers), 1)
            q = self.mod._extraction_subscribers[0]
            q.put_nowait({"event": "extraction_progress", "itemId": "1"})
            chunk = await response.body_iterator.__anext__()
            self.assertIn("event: extraction_progress", chunk)
            await response.body_iterator.aclose()
            self.assertEqual(len(self.mod._extraction_subscribers), 0)

        asyncio.run(run_case())

    def test_api_extraction_events_heartbeat(self):
        async def fake_wait_for(awaitable, *_args, **_kwargs):
            try:
                awaitable.close()
            except Exception:
                pass
            raise asyncio.TimeoutError

        async def run_case():
            self.mod._extraction_subscribers.clear()
            with patch("asyncio.wait_for", side_effect=fake_wait_for):
                response = await self.mod.api_extraction_events()
                chunk = await response.body_iterator.__anext__()
                self.assertIn("event: heartbeat", chunk)
                await response.body_iterator.aclose()

        asyncio.run(run_case())

    def test_report_item_cancels_old_task_when_running(self):
        class OldTask:
            def __init__(self):
                self.cancel_called = False

            def done(self):
                return False

            def cancel(self):
                self.cancel_called = True

        class NewTask:
            def done(self):
                return False

        old_task = OldTask()
        self.mod._active_extraction_tasks["session_x/ITEM1"] = old_task

        manifest = {
            "manifestVersion": 2,
            "itemId": "ITEM1",
            "sessionRunId": "session_x",
            "ocrEnabled": True,
            "ocrEngine": "tesseract",
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 1, "imagens": 1, "pdfs": 0, "unsupported": 0},
        }
        files = [("files", ("img.png", b"fake-image", "image/png"))]

        def fake_create_task(coro):
            try:
                coro.close()
            except Exception:
                pass
            return NewTask()

        with patch("asyncio.create_task", side_effect=fake_create_task):
            resp = self.client.post(
                "/reports/item",
                data={"manifest": json.dumps(manifest)},
                files=files,
                headers=self.headers,
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(old_task.cancel_called)


if __name__ == "__main__":
    unittest.main()
