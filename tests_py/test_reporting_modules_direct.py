import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ReportingDirectModuleTests(unittest.TestCase):
    def test_ocr_paddle_cache_is_owned_by_ocr_module(self):
        import reporting.ocr as ocr

        original = ocr._paddleocr_cls
        try:
            ocr._paddleocr_cls = "cached-engine"
            self.assertEqual(ocr._get_paddleocr(), "cached-engine")
        finally:
            ocr._paddleocr_cls = original

    def test_pdf_module_generates_and_merges_without_entrypoint(self):
        import reporting.pdf as pdf

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base_pdf = root / "base.pdf"
            final_pdf = root / "final.pdf"
            manifest = {
                "itemId": "PDF01",
                "historicoSummary": {"criticalFiscalRework": False, "fiscalTransitionsCount": 0},
                "mediaSummary": {"status": "OK", "total": 0},
            }

            pdf.generate_base_pdf(base_pdf, manifest, [], [])
            warnings = pdf.merge_final_pdf(final_pdf, base_pdf, [])

            self.assertEqual(warnings, [])
            self.assertTrue(final_pdf.exists())
            self.assertGreater(final_pdf.stat().st_size, 0)

    def test_markdown_module_rebuilds_with_storage_status(self):
        import reporting.markdown as markdown
        import reporting.storage as storage

        with tempfile.TemporaryDirectory() as tmp:
            item_dir = Path(tmp) / "item_MD01"
            media_dir = item_dir / "media"
            media_dir.mkdir(parents=True)
            (item_dir / "item_MD01.md").write_text(
                "# Item MD01\n\n## Acompanhamento (Apêndice Completo)\n", encoding="utf-8"
            )
            (media_dir / "doc.pdf.extracted.txt").write_text("texto extraido", encoding="utf-8")
            storage._write_extraction_status(
                item_dir, {"files": {"doc.pdf": {"method": "pypdf"}}, "engine": "tesseract"}
            )

            out = markdown.rebuild_item_markdown(item_dir, "MD01")

            self.assertIsNotNone(out)
            content = out.read_text(encoding="utf-8")
            self.assertIn("## Texto Extraído das Mídias", content)
            self.assertIn("- método: `pypdf`", content)

    def test_storage_status_helpers_are_directly_importable(self):
        import reporting.storage as storage

        with tempfile.TemporaryDirectory() as tmp:
            item_dir = Path(tmp) / "item_ST01"
            item_dir.mkdir()
            storage._write_extraction_status(item_dir, {"engine": "none", "files": {}})

            self.assertEqual(storage._read_extraction_status(item_dir)["engine"], "none")

    def test_extraction_module_runs_with_patched_domain_dependencies(self):
        import reporting.extraction as extraction

        with tempfile.TemporaryDirectory() as tmp:
            item_dir = Path(tmp) / "item_EX01"
            media_dir = item_dir / "media"
            media_dir.mkdir(parents=True)
            media_file = media_dir / "doc.pdf"
            media_file.write_bytes(b"%PDF-1.4 fake")
            events = []

            async def fake_broadcast(payload):
                events.append(payload)

            with patch.object(
                extraction,
                "extract_media_text",
                return_value={"status": "done", "method": "pypdf", "text": "abc", "chars": 3},
            ), patch.object(extraction, "rebuild_item_markdown", return_value=item_dir / "item_EX01.md"), patch.object(
                extraction, "build_session_markdown", return_value=item_dir / "session.md"
            ), patch.object(
                extraction, "_broadcast_sse", side_effect=fake_broadcast
            ):
                asyncio.run(
                    extraction._run_extraction(
                        item_dir, "EX01", "session_ex", [media_file], "tesseract", {"strategy": "max_compat"}
                    )
                )

            self.assertTrue((media_file.with_suffix(media_file.suffix + ".extracted.txt")).exists())
            self.assertTrue(any(event.get("event") == "extraction_complete" for event in events))

    def test_routes_module_owns_api_router(self):
        import reporting.routes as routes

        paths = {route.path for route in routes.router.routes}

        self.assertIn("/reports/item", paths)
        self.assertIn("/health", paths)
