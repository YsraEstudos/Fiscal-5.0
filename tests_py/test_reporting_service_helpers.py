import asyncio
import importlib
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = "test-token"
    os.environ["KM_MAX_FILE_SIZE_MB"] = "2"
    os.environ["KM_MAX_FILES_PER_ITEM"] = "10"
    os.environ["KM_OCR_PDF_STRATEGY"] = "max_compat"
    os.environ["KM_OCR_PDF_TIMEOUT_SEC"] = "20"
    os.environ["KM_OCR_PDF_MAX_PAGES"] = "50"
    os.environ["KM_OCR_PDF_DPI"] = "220"
    os.environ["KM_OCR_PDF_ENABLE_REPAIR"] = "1"
    os.environ["KM_OCR_PDF_PASSWORDS"] = "abc123;senha2"
    return load_reporting_modules()


class ReportingServiceHelperCoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mod = load_service(self.tmp.name)
        self.client = TestClient(self.mod.app)
        self.headers = {"X-KM-Token": "test-token"}

    def tearDown(self):
        self.tmp.cleanup()

    def test_env_and_profile_helpers(self):
        os.environ["KM_TMP_BOOL"] = "0"
        self.assertFalse(self.mod.env_bool("KM_TMP_BOOL", True))
        os.environ["KM_TMP_BOOL"] = "talvez"
        self.assertTrue(self.mod.env_bool("KM_TMP_BOOL", True))

        self.assertEqual(
            self.mod.parse_password_candidates(" abc123; senha2,\nlinha3\r\nlinha4 "),
            ["abc123", "senha2", "linha3", "linha4"],
        )

        profile = self.mod.build_extraction_profile("inexistente")
        self.assertEqual(profile["strategy"], self.mod.OCR_PDF_STRATEGY)
        self.assertGreaterEqual(profile["passwordCount"], 2)

        attempts = self.mod._password_attempts()
        self.assertEqual(attempts[0], ("empty", ""))
        self.assertIn(("env[0]", "abc123"), attempts)

    def test_pdf_helpers_cover_success_and_failure_paths(self):
        root = Path(self.tmp.name)
        good_pdf = root / "good.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=300, height=300)
        with good_pdf.open("wb") as fp:
            writer.write(fp)

        self.assertTrue(self.mod._pdf_header_ok(good_pdf))
        self.assertFalse(self.mod._pdf_header_ok(root / "missing.pdf"))

        with patch.object(self.mod.time, "monotonic", return_value=101.5):
            self.assertTrue(self.mod._is_timeout(100.0, 1))
        with patch.object(self.mod.time, "monotonic", return_value=100.2):
            self.assertFalse(self.mod._is_timeout(100.0, 5))

        class PlainReader:
            is_encrypted = False
            pages = []

        with patch.object(self.mod, "PdfReader", return_value=PlainReader()):
            reader, encrypted, source, error = self.mod._open_pdf_reader(good_pdf)
        self.assertIsNotNone(reader)
        self.assertFalse(encrypted)
        self.assertIsNone(source)
        self.assertIsNone(error)

        class EncryptedReaderSuccess:
            is_encrypted = True
            pages = []

            def decrypt(self, _pwd):
                return 1

        with patch.object(self.mod, "PdfReader", return_value=EncryptedReaderSuccess()):
            reader, encrypted, source, error = self.mod._open_pdf_reader(good_pdf)
        self.assertTrue(encrypted)
        self.assertEqual(source, "empty")
        self.assertIsNone(error)

        class EncryptedReaderFail:
            is_encrypted = True
            pages = []

            def decrypt(self, _pwd):
                return 0

        with patch.object(self.mod, "PdfReader", return_value=EncryptedReaderFail()):
            reader, encrypted, source, error = self.mod._open_pdf_reader(good_pdf)
        self.assertIsNone(reader)
        self.assertTrue(encrypted)
        self.assertEqual(error, self.mod.PDF_ERROR_CODES["ENCRYPTED"])

    def test_decrypt_copy_and_repair_helpers(self):
        root = Path(self.tmp.name)
        src_pdf = root / "src.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=300, height=300)
        with src_pdf.open("wb") as fp:
            writer.write(fp)

        reader = self.mod.PdfReader(str(src_pdf))
        decrypted = self.mod._write_decrypted_pdf_copy(reader, src_pdf)
        self.assertIsNotNone(decrypted)
        self.assertTrue(decrypted.exists())

        with patch.object(self.mod, "_pikepdf", None):
            self.assertIsNone(self.mod._repair_pdf_copy(src_pdf))

        class FakePikePdfContext:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def save(self, dst):
                Path(dst).write_bytes(b"%PDF-1.4 repaired")

        fake_pikepdf = types.SimpleNamespace(open=lambda *_args, **_kwargs: FakePikePdfContext())
        with patch.object(self.mod, "_pikepdf", fake_pikepdf):
            repaired = self.mod._repair_pdf_copy(src_pdf, password="abc123")
        self.assertIsNotNone(repaired)
        self.assertTrue(repaired.exists())

        broken_pikepdf = types.SimpleNamespace(open=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")))
        with patch.object(self.mod, "_pikepdf", broken_pikepdf):
            self.assertIsNone(self.mod._repair_pdf_copy(src_pdf))

    def test_pdf_extractors_preview_and_pdfium_helpers(self):
        class GoodPage:
            def __init__(self, text):
                self._text = text

            def extract_text(self):
                return self._text

        class BadPage:
            def extract_text(self):
                raise RuntimeError("bad page")

        reader = types.SimpleNamespace(pages=[GoodPage("a"), BadPage(), GoodPage("b")])
        self.assertEqual(self.mod._extract_text_from_pdf_pages_pypdf(reader, 5), ["a", "", "b"])

        class FakeMuPage:
            def __init__(self, text):
                self._text = text

            def get_text(self, _kind):
                return self._text

        class FakeMuDoc:
            def __len__(self):
                return 2

            def load_page(self, index):
                if index == 0:
                    return FakeMuPage("primeira")
                raise RuntimeError("sem texto")

            def close(self):
                return None

        fake_fitz = types.SimpleNamespace(open=lambda _path: FakeMuDoc())
        with patch.object(self.mod, "_fitz", fake_fitz):
            self.assertEqual(
                self.mod._extract_text_from_pdf_pages_pymupdf(Path(self.tmp.name) / "x.pdf", 5),
                ["primeira", ""],
            )

        bad_fitz = types.SimpleNamespace(open=lambda _path: (_ for _ in ()).throw(RuntimeError("boom")))
        with patch.object(self.mod, "_fitz", bad_fitz):
            self.assertEqual(self.mod._extract_text_from_pdf_pages_pymupdf(Path("x.pdf"), 5), [])

        class FakeBitmap:
            def to_pil(self):
                return "pil-image"

        class FakePdfiumPage:
            def render(self, scale):
                self.scale = scale
                return FakeBitmap()

            def close(self):
                return None

        class FakePdfiumDoc:
            def __len__(self):
                return 2

            def __getitem__(self, index):
                if index >= 2:
                    raise IndexError(index)
                return FakePdfiumPage()

            def close(self):
                return None

        fake_pdfium = types.SimpleNamespace(PdfDocument=lambda _path: FakePdfiumDoc())
        with patch.object(self.mod, "_pypdfium2", fake_pdfium):
            images, backend = self.mod._pdf_to_images_pdfium(Path("doc.pdf"), 220)
        self.assertEqual(backend, "pypdfium2")
        self.assertEqual(images, [(0, "pil-image"), (1, "pil-image")])

        broken_pdfium = types.SimpleNamespace(PdfDocument=lambda _path: (_ for _ in ()).throw(RuntimeError("boom")))
        with patch.object(self.mod, "_pypdfium2", broken_pdfium):
            images, backend = self.mod._pdf_to_images_pdfium(Path("doc.pdf"), 220)
        self.assertEqual(images, [])
        self.assertEqual(backend, "")

        self.assertEqual(self.mod._strip_html_tags("<b>Olá</b> &amp; <i>mundo</i>"), "Olá & mundo")
        html_with_ids, toc = self.mod._inject_heading_ids("<h1>Título</h1><h2><em>Título</em></h2>")
        self.assertIn('id="t_tulo"', html_with_ids)
        self.assertIn('id="t_tulo-2"', html_with_ids)
        self.assertEqual([entry["text"] for entry in toc], ["Título", "Título"])

        with patch.object(self.mod, "_bleach", None):
            cleaned = self.mod._sanitize_preview_html('<h1>x</h1><script>alert(1)</script><p onclick="x()">y</p>')
        self.assertNotIn("<script", cleaned.lower())
        self.assertNotIn("onclick=", cleaned.lower())

        with patch.object(self.mod, "_markdown", None), patch.object(self.mod, "_bleach", None):
            rendered = self.mod.render_markdown_preview("# Título\n\n## Título\ntexto comum")
        self.assertIn('id="t_tulo"', rendered["html"])
        self.assertEqual(len(rendered["toc"]), 2)
        self.assertIn("texto comum", rendered["markdown"])

    def test_preview_helpers_cover_bleach_and_markdown_paths(self):
        clean_calls = {}

        class FakeBleach:
            sanitizer = types.SimpleNamespace(ALLOWED_TAGS={"a", "p"})

            @staticmethod
            def clean(raw_html, tags, attributes, protocols, strip):
                clean_calls["raw_html"] = raw_html
                clean_calls["tags"] = tags
                clean_calls["attributes"] = attributes
                clean_calls["protocols"] = protocols
                clean_calls["strip"] = strip
                return "<h1 id='ok'>Seguro</h1>"

        fake_markdown = types.SimpleNamespace(
            markdown=lambda source, extensions, output_format: "<h1>Título Seguro</h1><p>conteúdo</p>"
        )

        with patch.object(self.mod, "_bleach", FakeBleach):
            cleaned = self.mod._sanitize_preview_html("<h1>x</h1><p>y</p>")
        self.assertEqual(cleaned, "<h1 id='ok'>Seguro</h1>")
        self.assertIn("h1", clean_calls["tags"])
        self.assertIn("code", clean_calls["tags"])
        self.assertEqual(clean_calls["attributes"]["*"], ["id", "class"])
        self.assertEqual(clean_calls["protocols"], ["http", "https", "mailto"])
        self.assertTrue(clean_calls["strip"])

        with patch.object(self.mod, "_markdown", fake_markdown), patch.object(self.mod, "_bleach", None):
            rendered = self.mod.render_markdown_preview("# ignorado")
        self.assertIn("Título Seguro", rendered["html"])
        self.assertEqual(rendered["toc"][0]["text"], "Título Seguro")

    def test_legacy_media_extraction_and_ocr_fallback_helpers(self):
        pdf = Path(self.tmp.name) / "legacy.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake")
        image = Path(self.tmp.name) / "legacy.png"
        image.write_bytes(b"png")

        with patch.object(self.mod, "extract_text_from_pdf", return_value="texto rico " * 10), patch.object(
            self.mod, "PdfReader", return_value=types.SimpleNamespace(pages=[1, 2, 3])
        ):
            result = self.mod._extract_media_text_legacy(pdf, engine="tesseract")
        self.assertEqual(result["method"], "pypdf")
        self.assertEqual(result["pages"], 3)
        self.assertGreater(result["chars"], 50)

        with patch.object(self.mod, "extract_text_from_pdf", return_value=""), patch.object(
            self.mod, "_pdf_to_images", return_value=[object()]
        ), patch.object(self.mod, "ocr_paddle", return_value="ocr pdf"), patch.object(
            self.mod, "ocr_tesseract", return_value=""
        ):
            result = self.mod._extract_media_text_legacy(pdf, engine="paddleocr")
        self.assertEqual(result["method"], "paddleocr")
        self.assertEqual(result["pages"], 1)

        with patch.object(self.mod, "ocr_paddle", return_value=""), patch.object(
            self.mod, "ocr_tesseract", return_value="ocr image"
        ):
            result = self.mod._extract_media_text_legacy(image, engine="paddleocr")
        self.assertEqual(result["method"], "tesseract")
        self.assertEqual(result["pages"], 1)

        with patch.object(self.mod, "_preprocess_image_for_ocr", return_value="img"), patch.object(
            self.mod, "ocr_paddle", return_value=""
        ), patch.object(self.mod, "ocr_tesseract", return_value="fallback text"):
            text, backend = self.mod._ocr_image_with_fallback("raw", "paddleocr")
        self.assertEqual(text, "fallback text")
        self.assertEqual(backend, "tesseract")

        with patch.object(self.mod, "_preprocess_image_for_ocr", return_value="img"), patch.object(
            self.mod, "ocr_paddle", return_value=""
        ), patch.object(self.mod, "ocr_tesseract", return_value=""):
            text, backend = self.mod._ocr_image_with_fallback("raw", "tesseract")
        self.assertEqual(text, "")
        self.assertEqual(backend, "none")

    def test_extract_media_text_covers_legacy_timeout_and_repair_fallbacks(self):
        pdf = Path(self.tmp.name) / "branchy.pdf"
        pdf.write_bytes(b"%PDF-1.4 branchy")

        legacy_profile = {
            "strategy": "legacy",
            "timeoutSec": 20,
            "maxPages": 50,
            "dpi": 220,
            "enableRepair": False,
            "passwordCount": 0,
        }
        with patch.object(self.mod, "build_extraction_profile", return_value=legacy_profile), patch.object(
            self.mod,
            "_extract_media_text_legacy",
            return_value={"method": "pypdf", "text": "texto legado", "chars": 12, "pages": 1},
        ):
            result = self.mod.extract_media_text(pdf, engine="tesseract", profile={"strategy": "legacy"})
        self.assertEqual(result["backendChain"], ["legacy"])
        self.assertEqual(result["method"], "pypdf")

        timeout_profile = {
            "strategy": "max_compat",
            "timeoutSec": 20,
            "maxPages": 50,
            "dpi": 220,
            "enableRepair": False,
            "passwordCount": 0,
        }
        with patch.object(self.mod, "build_extraction_profile", return_value=timeout_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", return_value=True):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["errorCode"], self.mod.PDF_ERROR_CODES["TIMEOUT"])
        self.assertIn("preflight", result["errorDetail"].lower())

        repair_profile = {
            "strategy": "max_compat",
            "timeoutSec": 20,
            "maxPages": 50,
            "dpi": 220,
            "enableRepair": True,
            "passwordCount": 2,
        }
        with patch.object(self.mod, "build_extraction_profile", return_value=repair_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", return_value=False), patch.object(
            self.mod, "_password_attempts", return_value=[("empty", ""), ("env[0]", "abc123")]
        ), patch.object(
            self.mod, "_repair_pdf_copy", return_value=None
        ), patch.object(
            self.mod, "_open_pdf_reader", return_value=(None, False, None, self.mod.PDF_ERROR_CODES["PREFLIGHT"])
        ), patch.object(
            self.mod, "_extract_media_text_legacy", return_value={"method": "none", "text": "", "chars": 0, "pages": 0}
        ):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["errorCode"], self.mod.PDF_ERROR_CODES["PREFLIGHT"])
        self.assertIn("pdf:repair:attempt", result["backendChain"])
        self.assertIn("pdf:repair:skip", result["backendChain"])

    def test_extract_media_text_covers_pdf_page_and_ocr_render_branches(self):
        pdf = Path(self.tmp.name) / "ocr-branches.pdf"
        pdf.write_bytes(b"%PDF-1.4 ocr")
        base_profile = {
            "strategy": "max_compat",
            "timeoutSec": 20,
            "maxPages": 50,
            "dpi": 220,
            "enableRepair": False,
            "passwordCount": 0,
        }

        empty_reader = types.SimpleNamespace(pages=[])
        with patch.object(self.mod, "build_extraction_profile", return_value=base_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", return_value=False), patch.object(
            self.mod, "_open_pdf_reader", return_value=(empty_reader, False, None, None)
        ):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["errorCode"], self.mod.PDF_ERROR_CODES["PREFLIGHT"])
        self.assertIn("sem páginas", result["errorDetail"].lower())

        one_page_reader = types.SimpleNamespace(pages=[object()])
        with patch.object(self.mod, "build_extraction_profile", return_value=base_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", side_effect=[False, False, True]), patch.object(
            self.mod, "_open_pdf_reader", return_value=(one_page_reader, False, None, None)
        ), patch.object(
            self.mod, "_extract_text_from_pdf_pages_pypdf", return_value=[""]
        ), patch.object(self.mod, "_fitz", None):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["errorCode"], self.mod.PDF_ERROR_CODES["TIMEOUT"])
        self.assertIn("renderização ocr", result["errorDetail"].lower())

        with patch.object(self.mod, "build_extraction_profile", return_value=base_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", side_effect=[False, False, False, False]), patch.object(
            self.mod, "_open_pdf_reader", return_value=(one_page_reader, False, None, None)
        ), patch.object(
            self.mod, "_extract_text_from_pdf_pages_pypdf", return_value=["tiny"]
        ), patch.object(
            self.mod, "_fitz", None
        ), patch.object(
            self.mod, "_pdf_to_images_pdfium", return_value=([], "")
        ), patch.object(
            self.mod, "_pdf_to_images", return_value=[(0, "img-0")]
        ), patch.object(
            self.mod, "_ocr_image_with_fallback", return_value=("ocr complementar", "tesseract")
        ):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["renderBackend"], "pdf2image")
        self.assertEqual(result["method"], "hybrid")
        self.assertEqual(result["ocrBackend"], "tesseract")
        self.assertIn("render:pdf2image", result["backendChain"])
        self.assertIn("ocr:tesseract", result["backendChain"])
        self.assertIn("ocr complementar", result["text"])

        with patch.object(self.mod, "build_extraction_profile", return_value=base_profile), patch.object(
            self.mod, "_pdf_header_ok", return_value=True
        ), patch.object(self.mod, "_is_timeout", side_effect=[False, False, False]), patch.object(
            self.mod, "_open_pdf_reader", return_value=(one_page_reader, False, None, None)
        ), patch.object(
            self.mod, "_extract_text_from_pdf_pages_pypdf", return_value=[""]
        ), patch.object(
            self.mod, "_fitz", None
        ), patch.object(
            self.mod, "_pdf_to_images_pdfium", return_value=([], "")
        ), patch.object(
            self.mod, "_pdf_to_images", return_value=[]
        ):
            result = self.mod.extract_media_text(pdf, engine="tesseract")
        self.assertEqual(result["errorCode"], self.mod.PDF_ERROR_CODES["RENDER"])
        self.assertIn("renderizar", result["errorDetail"].lower())

    def test_api_error_paths_and_session_metadata_merge(self):
        resp = self.client.post("/reports/session/touch", json={"sessionRunId": "unauthorized-touch"})
        self.assertEqual(resp.status_code, 401)

        session_id = "session_merge_meta"
        first = self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "merge", "reason": "primeiro"},
            headers=self.headers,
        )
        self.assertEqual(first.status_code, 200)
        second = self.client.post(
            "/reports/session/touch",
            json={"sessionRunId": session_id, "projectName": "merge", "reason": "segundo", "itemRef": "ITEM-2"},
            headers=self.headers,
        )
        self.assertEqual(second.status_code, 200)
        meta = json.loads((Path(self.tmp.name) / session_id / "session_meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["lastReason"], "segundo")
        self.assertEqual(meta["lastItemRef"], "ITEM-2")
        self.assertIn("firstTouchedAt", meta)

        preview_missing = self.client.get("/api/sessions/sessao_inexistente/preview")
        self.assertEqual(preview_missing.status_code, 404)

        item_preview_missing = self.client.get("/api/sessions/sessao_inexistente/items/X/preview")
        self.assertEqual(item_preview_missing.status_code, 404)

        bulk_invalid = self.client.post("/api/sessions/delete-bulk", json={"sessionIds": "x"})
        self.assertEqual(bulk_invalid.status_code, 400)

        bulk_empty = self.client.post("/api/sessions/delete-bulk", json={"sessionIds": ["", " "]})
        self.assertEqual(bulk_empty.status_code, 400)

    def test_delete_session_helper_paths(self):
        not_found_payload, not_found_status = asyncio.run(self.mod._delete_session_data("nao_existe"))
        self.assertEqual(not_found_status, 200)
        self.assertTrue(not_found_payload["notFound"])

        session_id = "session_delete_failure"
        session_dir = Path(self.tmp.name) / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "a.txt").write_text("x", encoding="utf-8")

        async def fake_cancel(_session_run_id):
            return 0, []

        with patch.object(self.mod, "_cancel_active_session_tasks", side_effect=fake_cancel), patch.object(
            self.mod.shutil, "rmtree", side_effect=OSError("disk lock")
        ):
            payload, status = asyncio.run(self.mod._delete_session_data(session_id))
        self.assertEqual(status, 500)
        self.assertFalse(payload["ok"])
        self.assertIn("falha ao excluir sessão", " ".join(payload["errors"]))

    def test_report_item_extraction_warnings_for_missing_files_and_none_engine(self):
        manifest_ui_requested = {
            "manifestVersion": 2,
            "itemId": "WARN01",
            "sessionRunId": "session_warn_ui",
            "ocrEnabled": True,
            "ocrEngine": "tesseract",
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0, "requestedByUiCount": 2},
        }
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest_ui_requested)},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(any("UI indicava 2 mídia" in warning for warning in payload["extractionWarnings"]))
        self.assertFalse(payload["extractionLaunched"])

        manifest_none_engine = {
            "manifestVersion": 2,
            "itemId": "WARN02",
            "sessionRunId": "session_warn_none",
            "ocrEnabled": True,
            "ocrEngine": "none",
            "historicoSummary": {"criticalFiscalRework": False},
            "mediaSummary": {"status": "OK", "total": 0, "imagens": 0, "pdfs": 0, "unsupported": 0},
        }
        resp = self.client.post(
            "/reports/item",
            data={"manifest": json.dumps(manifest_none_engine)},
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(any("engine configurado como 'none'" in warning for warning in payload["extractionWarnings"]))
        self.assertFalse(payload["extractionLaunched"])


if __name__ == "__main__":
    unittest.main()
