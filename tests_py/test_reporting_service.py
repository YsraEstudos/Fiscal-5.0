import importlib
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str, token: str = "test-token", max_mb: int = 1, max_files: int = 2):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = token
    os.environ["KM_MAX_FILE_SIZE_MB"] = str(max_mb)
    os.environ["KM_MAX_FILES_PER_ITEM"] = str(max_files)
    os.environ["KM_OCR_PDF_STRATEGY"] = "max_compat"
    os.environ["KM_OCR_PDF_TIMEOUT_SEC"] = "25"
    os.environ["KM_OCR_PDF_MAX_PAGES"] = "100"
    os.environ["KM_OCR_PDF_DPI"] = "260"
    os.environ["KM_OCR_PDF_ENABLE_REPAIR"] = "1"
    os.environ["KM_OCR_PDF_PASSWORDS"] = "abc123,senha2"
    return load_reporting_modules()


class ReportingServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mod = load_service(self.tmp.name, token="test-token", max_mb=1, max_files=2)
        self.client = TestClient(self.mod.app)
        self.headers = {"X-KM-Token": "test-token"}

    def tearDown(self):
        self.tmp.cleanup()

    def test_health_contract_contains_limits_and_auth(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertIn("maxFileSizeMb", data)
        self.assertIn("maxFilesPerItem", data)
        self.assertIn("authEnabled", data)
        self.assertIn("pdfBackends", data)
        self.assertIn("ocrCapabilities", data)
        self.assertIn("repairAvailable", data)

    def test_parse_manifest_valid_and_invalid(self):
        manifest = self.mod.parse_manifest(json.dumps({"itemId": "123", "sessionRunId": "abc"}))
        self.assertEqual(manifest["itemId"], "123")
        self.assertEqual(manifest["manifestVersion"], 1)
        with self.assertRaises(HTTPException):
            self.mod.parse_manifest("not-json")

    def test_requires_token_when_auth_enabled(self):
        resp = self.client.post("/reports/item", data={"manifest": json.dumps({"itemId": "A"})})
        self.assertEqual(resp.status_code, 401)
        self.assertIn("UNAUTHORIZED", " ".join(resp.json().get("errors", [])))

    def test_upload_size_limit_enforced(self):
        big_payload = b"x" * (1024 * 1024 + 100)
        files = [("files", ("big.pdf", big_payload, "application/pdf"))]
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps({"itemId": "S1", "manifestVersion": 2})},
            files=files,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 413)
        self.assertIn("UPLOAD_LIMIT_EXCEEDED", " ".join(resp.json().get("errors", [])))

    def test_upload_count_limit_enforced(self):
        files = [
            ("files", ("a.pdf", b"a", "application/pdf")),
            ("files", ("b.pdf", b"b", "application/pdf")),
            ("files", ("c.pdf", b"c", "application/pdf")),
        ]
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps({"itemId": "C1", "manifestVersion": 2})},
            files=files,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 413)
        self.assertIn("UPLOAD_LIMIT_EXCEEDED", " ".join(resp.json().get("errors", [])))

    def test_success_generates_pdf_md_and_index(self):
        manifest = {
            "manifestVersion": 2,
            "itemId": "251133",
            "sessionRunId": "session_test_success",
            "historicoSummary": {"criticalFiscalRework": True, "fiscalTransitionsCount": 3},
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
        }
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload["ok"])
        self.assertTrue(Path(payload["pdfPath"]).exists())
        self.assertTrue(Path(payload["mdPath"]).exists())
        idx = Path(self.tmp.name) / "session_test_success" / "index.jsonl"
        self.assertTrue(idx.exists())
        self.assertGreaterEqual(len(idx.read_text(encoding="utf-8").splitlines()), 1)

    def test_markdown_includes_ncm_mentions_from_historico(self):
        manifest = {
            "manifestVersion": 2,
            "itemId": "251135",
            "sessionRunId": "session_test_ncm_mentions",
            "historicoSummary": {
                "criticalFiscalRework": False,
                "fiscalTransitionsCount": 1,
                "ncmMentions": {
                    "found": True,
                    "keywordMentions": 2,
                    "formattedMatches": 1,
                    "unformattedMatchesWithContext": 1,
                    "codes": ["3926.90.40"],
                    "evidences": [
                        {
                            "dia": "13/02/2026",
                            "hora": "14:20",
                            "usuario": "TESTE.USER",
                            "codigo": "3926.90.40",
                            "trecho": "Classificação fiscal alterada para NCM 39269040"
                        }
                    ]
                }
            },
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
            "historicoTimeline": []
        }

        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        md_text = Path(payload["mdPath"]).read_text(encoding="utf-8")

        self.assertIn("## Menções a NCM (Acompanhamento)", md_text)
        self.assertIn("menção detectada: `sim`", md_text)
        self.assertIn("códigos identificados: `3926.90.40`", md_text)
        self.assertIn("Classificação fiscal alterada para NCM 39269040", md_text)

    def test_touch_session_creates_folder_metadata_and_index(self):
        payload = {
            "sessionRunId": "session_citrosuco_20260213_120000_ab12cd",
            "projectName": "citrosuco",
            "reason": "manual-stop",
            "itemRef": "251133",
        }
        resp = self.client.post("/reports/session/touch", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("ok"))

        session_dir = Path(data["sessionDir"])
        self.assertTrue(session_dir.exists())
        self.assertTrue((session_dir / "session_meta.json").exists())
        idx = session_dir / "index.jsonl"
        self.assertTrue(idx.exists())
        content = idx.read_text(encoding="utf-8")
        self.assertIn("SESSION_TOUCH", content)
        self.assertIn("sessionMdPath", data)
        session_md_path = Path(data["sessionMdPath"])
        self.assertTrue(session_md_path.exists())
        session_md = session_md_path.read_text(encoding="utf-8")
        self.assertIn(
            "[Analise este relatório contendo itens classificados. Com base nos dados técnicos apresentados (mídias, textos extraídos e histórico), verifique se as classificações atribuídas estão corretas. Você mudaria alguma classificação ou descrição? Se sim, justifique com base nas evidências do relatório.]",
            session_md,
        )

    def test_touch_session_generates_consolidated_md_with_all_items(self):
        session_id = "session_full_md_20260213_150310_rvejqg"

        for item_id in ["82938", "82939"]:
            manifest = {
                "manifestVersion": 2,
                "itemId": item_id,
                "sessionRunId": session_id,
                "historicoSummary": {"criticalFiscalRework": False, "fiscalTransitionsCount": 0},
                "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
            }
            resp_item = self.client.post(
                "/reports/item",
                data={"manifest": json.dumps(manifest)},
                headers=self.headers,
            )
            self.assertEqual(resp_item.status_code, 200)

        resp_touch = self.client.post(
            "/reports/session/touch",
            json={
                "sessionRunId": session_id,
                "projectName": "carmoenergy",
                "reason": "manual-stop",
                "itemRef": "82939",
            },
            headers=self.headers,
        )
        self.assertEqual(resp_touch.status_code, 200)
        payload = resp_touch.json()
        session_md = Path(payload["sessionMdPath"]).read_text(encoding="utf-8")

        self.assertIn("# Relatório Consolidado da Sessão", session_md)
        self.assertIn("itens consolidados: `2`", session_md)
        self.assertIn("## Item 82938", session_md)
        self.assertIn("## Item 82939", session_md)
        self.assertIn(
            "[Analise este relatório contendo itens classificados. Com base nos dados técnicos apresentados (mídias, textos extraídos e histórico), verifique se as classificações atribuídas estão corretas. Você mudaria alguma classificação ou descrição? Se sim, justifique com base nas evidências do relatório.]",
            session_md,
        )

    def test_index_lock_under_concurrency(self):
        session_dir = Path(self.tmp.name) / "session_lock_test"
        session_dir.mkdir(parents=True, exist_ok=True)
        total = 80

        def writer(i: int):
            self.mod.append_index(session_dir, {"i": i})

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(total)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        index_path = session_dir / "index.jsonl"
        self.assertTrue(index_path.exists())
        lines = index_path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), total)

    def test_merge_pdf_handles_invalid_and_encrypted(self):
        root = Path(self.tmp.name)
        base_pdf = root / "base.pdf"
        final_pdf = root / "final.pdf"
        encrypted_pdf = root / "encrypted.pdf"
        invalid_pdf = root / "invalid.pdf"

        base_writer = PdfWriter()
        base_writer.add_blank_page(width=300, height=300)
        with base_pdf.open("wb") as fp:
            base_writer.write(fp)

        enc_writer = PdfWriter()
        enc_writer.add_blank_page(width=300, height=300)
        enc_writer.encrypt("secret")
        with encrypted_pdf.open("wb") as fp:
            enc_writer.write(fp)

        invalid_pdf.write_text("not a pdf", encoding="utf-8")

        warnings = self.mod.merge_final_pdf(final_pdf, base_pdf, [invalid_pdf, encrypted_pdf])
        self.assertTrue(final_pdf.exists())
        joined = " | ".join(warnings)
        self.assertIn("PDF inválido", joined)
        self.assertTrue("criptografado" in joined or "decrypted" in joined)

    # ---- NEW: Extraction engine tests ----

    def test_extract_text_from_pdf_with_text_layer(self):
        """Create a PDF with reportlab containing known text, verify pypdf extracts it."""
        root = Path(self.tmp.name)
        pdf_path = root / "text_layer.pdf"
        c = rl_canvas.Canvas(str(pdf_path), pagesize=A4)
        c.drawString(72, 700, "Hello World Fiscal Report Test 12345")
        c.save()

        text = self.mod.extract_text_from_pdf(pdf_path)
        self.assertIn("Hello World", text)
        self.assertIn("12345", text)

    def test_extract_text_from_pdf_empty_for_no_text(self):
        """An empty PDF should return empty text."""
        root = Path(self.tmp.name)
        pdf_path = root / "empty.pdf"
        w = PdfWriter()
        w.add_blank_page(width=300, height=300)
        with pdf_path.open("wb") as fp:
            w.write(fp)

        text = self.mod.extract_text_from_pdf(pdf_path)
        self.assertEqual(text.strip(), "")

    def test_extract_media_text_pdf_with_text(self):
        """extract_media_text should use pypdf for text-rich PDFs."""
        root = Path(self.tmp.name)
        pdf_path = root / "rich.pdf"
        c = rl_canvas.Canvas(str(pdf_path), pagesize=A4)
        c.drawString(72, 700, "Este documento contém texto suficiente para pular OCR completamente xyz123")
        c.save()

        result = self.mod.extract_media_text(pdf_path, engine="tesseract")
        self.assertEqual(result["method"], "pypdf")
        self.assertIn("xyz123", result["text"])
        self.assertGreater(result["chars"], 50)

    def test_extract_media_text_unsupported_extension(self):
        """Unsupported file types should return empty result."""
        root = Path(self.tmp.name)
        txt_path = root / "notes.txt"
        txt_path.write_text("some text", encoding="utf-8")

        result = self.mod.extract_media_text(txt_path)
        self.assertEqual(result["method"], "none")
        self.assertEqual(result["chars"], 0)

    def test_extraction_status_json_created_on_upload(self):
        """Upload an item with a PDF file; verify extraction_status.json is eventually created."""
        root = Path(self.tmp.name)
        pdf_path = root / "test_upload.pdf"
        c = rl_canvas.Canvas(str(pdf_path), pagesize=A4)
        c.drawString(72, 700, "Test extraction status content abcdef ghijkl mnopqr stuvwxyz 1234567890")
        c.save()
        pdf_bytes = pdf_path.read_bytes()

        manifest = {
            "manifestVersion": 2,
            "itemId": "EXT001",
            "sessionRunId": "session_extraction_test",
            "ocrEnabled": True,
            "ocrEngine": "tesseract",
            "historicoSummary": {"criticalFiscalRework": False, "fiscalTransitionsCount": 0},
            "mediaSummary": {"status": "OK", "total": 1, "imagens": 0, "pdfs": 1, "unsupported": 0},
        }
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            files=[("files", ("doc.pdf", pdf_bytes, "application/pdf"))],
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("extractionLaunched", False))
        self.assertIn("extractionProfileUsed", payload)
        self.assertIn("extractionWarnings", payload)

        # Wait a bit for async extraction
        import asyncio
        time.sleep(1.5)

        item_dir = Path(self.tmp.name) / "session_extraction_test" / "item_EXT001"
        status_path = item_dir / "extraction_status.json"
        self.assertTrue(status_path.exists(), f"extraction_status.json not found at {status_path}")
        status = json.loads(status_path.read_text(encoding="utf-8"))
        self.assertIn("files", status)
        self.assertEqual(status["engine"], "tesseract")

    def test_root_returns_html_dashboard(self):
        """GET / should return HTML dashboard."""
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/html", resp.headers.get("content-type", ""))
        self.assertIn("KM Fiscal Reports", resp.text)

    def test_api_sessions_lists_sessions(self):
        """Create a session then verify /api/sessions returns it."""
        self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": "session_api_test", "projectName": "test"},
            headers=self.headers,
        )
        resp = self.client.get("/api/sessions")
        self.assertEqual(resp.status_code, 200)
        sessions = resp.json()
        found = next((s for s in sessions if s["sessionRunId"] == "session_api_test"), None)
        self.assertIsNotNone(found)
        self.assertIn("status", found)
        self.assertIn("startedAt", found)
        self.assertIn("endedAt", found)
        self.assertIn("lastEventAt", found)
        self.assertIn("itemsDone", found)
        self.assertIn("source", found)
        self.assertIn("durationSeconds", found)

    def test_api_session_items_returns_items(self):
        """Create items and verify /api/sessions/{id}/items returns them."""
        session_id = "session_items_api"
        for item_id in ["A1", "A2"]:
            manifest = {
                "manifestVersion": 2,
                "itemId": item_id,
                "sessionRunId": session_id,
                "ocrEnabled": False,
                "historicoSummary": {"criticalFiscalRework": False},
                "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
            }
            self.client.post(
                "/reports/item",
                data={"manifest": json.dumps(manifest)},
                headers=self.headers,
            )
        resp = self.client.get(f"/api/sessions/{session_id}/items")
        self.assertEqual(resp.status_code, 200)
        items = resp.json()
        item_ids = [it["itemId"] for it in items]
        self.assertIn("A1", item_ids)
        self.assertIn("A2", item_ids)
        self.assertTrue(all("hasMarkdown" in it for it in items))
        self.assertTrue(all("mdUpdatedAt" in it for it in items))

    def test_api_session_md_returns_text(self):
        """Touch a session and verify /api/sessions/{id}/md returns markdown text."""
        session_id = "session_md_api"
        self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "test"},
            headers=self.headers,
        )
        resp = self.client.get(f"/api/sessions/{session_id}/md")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Relatório Consolidado", resp.text)

    def test_api_session_preview_returns_html_and_toc(self):
        session_id = "session_preview_api"
        self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "preview"},
            headers=self.headers,
        )
        session_dir = Path(self.tmp.name) / session_id
        md_path = session_dir / f"session_{session_id}.md"
        md_path.write_text(
            "# Título Principal\n\n## Bloco A\n\n<script>alert('x')</script>\n\nTexto comum.",
            encoding="utf-8",
        )

        resp = self.client.get(f"/api/sessions/{session_id}/preview")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["scope"], "session")
        self.assertIn("html", data)
        self.assertIn("toc", data)
        self.assertIn("markdown", data)
        self.assertNotIn("<script", data["html"].lower())
        self.assertGreaterEqual(len(data["toc"]), 1)

    def test_api_item_preview_and_md(self):
        session_id = "session_item_preview_api"
        item_id = "IT001"
        manifest = {
            "manifestVersion": 2,
            "itemId": item_id,
            "sessionRunId": session_id,
            "ocrEnabled": False,
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
        }
        self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            headers=self.headers,
        )

        resp_md = self.client.get(f"/api/sessions/{session_id}/items/{item_id}/md")
        self.assertEqual(resp_md.status_code, 200)
        self.assertIn("Relatório do Item", resp_md.text)

        resp_preview = self.client.get(f"/api/sessions/{session_id}/items/{item_id}/preview")
        self.assertEqual(resp_preview.status_code, 200)
        payload = resp_preview.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["scope"], "item")
        self.assertEqual(payload["itemId"], item_id)
        self.assertIn("html", payload)
        self.assertIn("toc", payload)

    def test_delete_session_single(self):
        session_id = "session_delete_single"
        self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "delete"},
            headers=self.headers,
        )
        session_dir = Path(self.tmp.name) / session_id
        self.assertTrue(session_dir.exists())

        resp = self.client.delete(f"/api/sessions/{session_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertTrue(data["deleted"])
        self.assertFalse(session_dir.exists())

    def test_delete_sessions_bulk(self):
        ids = ["session_bulk_1", "session_bulk_2"]
        for sid in ids:
            self.client.post(
                "/reports/session/touch",
                json={"sessionRunId": sid, "projectName": "bulk"},
                headers=self.headers,
            )
        resp = self.client.post("/api/sessions/delete-bulk", json={"sessionIds": ids})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["deletedCount"], 2)
        self.assertEqual(len(data["results"]), 2)
        for sid in ids:
            self.assertFalse((Path(self.tmp.name) / sid).exists())

    def test_delete_session_busy_returns_409(self):
        session_id = "session_busy_delete"
        self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "busy"},
            headers=self.headers,
        )
        original = self.mod._cancel_active_session_tasks

        async def fake_cancel(_session_run_id):
            return 1, [f"{session_id}/item_X"]

        self.mod._cancel_active_session_tasks = fake_cancel
        try:
            resp = self.client.delete(f"/api/sessions/{session_id}")
        finally:
            self.mod._cancel_active_session_tasks = original
        self.assertEqual(resp.status_code, 409)
        data = resp.json()
        self.assertFalse(data["ok"])
        self.assertTrue(data["busy"])

    def test_rebuild_md_includes_extracted_text(self):
        """Place .extracted.txt sidecar files, call rebuild, verify markdown includes text."""
        session_id = "session_rebuild_test"
        item_id = "RB01"
        manifest = {
            "manifestVersion": 2,
            "itemId": item_id,
            "sessionRunId": session_id,
            "ocrEnabled": False,
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
        }
        self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            headers=self.headers,
        )

        # Manually place a sidecar extracted text file
        item_dir = Path(self.tmp.name) / session_id / f"item_{item_id}"
        media_dir = item_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        (media_dir / "documento.pdf").write_bytes(b"%PDF-fake")
        (media_dir / "documento.pdf.extracted.txt").write_text(
            "Texto extraído de teste do documento fiscal", encoding="utf-8"
        )

        # Write extraction status
        self.mod._write_extraction_status(item_dir, {
            "engine": "tesseract",
            "files": {"documento.pdf": {"status": "done", "method": "pypdf", "chars": 44}},
        })

        # Rebuild via API
        resp = self.client.post(f"/api/items/{session_id}/{item_id}/rebuild-md")
        self.assertEqual(resp.status_code, 200)

        md_text = (item_dir / f"item_{item_id}.md").read_text(encoding="utf-8")
        self.assertIn("## Texto Extraído das Mídias", md_text)
        self.assertIn("Texto extraído de teste do documento fiscal", md_text)
        self.assertIn("documento.pdf", md_text)

    def test_health_includes_ocr_engines(self):
        """Health endpoint should report OCR engine availability."""
        resp = self.client.get("/health")
        data = resp.json()
        self.assertIn("ocrEngines", data)
        engines = data["ocrEngines"]
        self.assertIn("tesseract", engines)
        self.assertIn("paddleocr", engines)
        self.assertIn("pdf2image", engines)

    def test_upload_with_ocr_disabled_skips_extraction(self):
        """When ocrEnabled=false in manifest, no extraction should launch."""
        manifest = {
            "manifestVersion": 2,
            "itemId": "NOOCR1",
            "sessionRunId": "session_noocr",
            "ocrEnabled": False,
            "ocrEngine": "none",
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 1, "imagens": 0, "pdfs": 1, "unsupported": 0},
        }
        pdf_bytes = b"%PDF-1.4 fake content"
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest)},
            files=[("files", ("test.pdf", pdf_bytes, "application/pdf"))],
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertFalse(payload.get("extractionLaunched", True))


if __name__ == "__main__":
    unittest.main()
