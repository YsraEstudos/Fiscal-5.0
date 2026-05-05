import importlib
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from reporting_module_facade import load_reporting_modules

MODULE_NAME = "reporting_service"


def load_service(tmp_reports_dir: str, retention_days: int = 0):
    os.environ["KM_REPORTS_DIR"] = tmp_reports_dir
    os.environ["KM_REPORT_TOKEN"] = "test-token"
    os.environ["KM_MAX_FILE_SIZE_MB"] = "2"
    os.environ["KM_MAX_FILES_PER_ITEM"] = "10"
    os.environ["KM_REPORT_RETENTION_DAYS"] = str(retention_days)
    os.environ["KM_OCR_PDF_STRATEGY"] = "max_compat"
    os.environ["KM_OCR_PDF_TIMEOUT_SEC"] = "20"
    os.environ["KM_OCR_PDF_MAX_PAGES"] = "50"
    os.environ["KM_OCR_PDF_DPI"] = "220"
    os.environ["KM_OCR_PDF_ENABLE_REPAIR"] = "1"
    os.environ["KM_OCR_PDF_PASSWORDS"] = "abc123;senha2"
    return load_reporting_modules()


class ReportingServiceOcrTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mod = load_service(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_env_int_slugify_and_parse_manifest_non_object(self):
        os.environ["KM_TMP_INT"] = "999"
        self.assertEqual(self.mod.env_int("KM_TMP_INT", 10, 1, 20), 20)
        os.environ["KM_TMP_INT"] = "x"
        self.assertEqual(self.mod.env_int("KM_TMP_INT", 10, 1, 20), 10)
        self.assertEqual(self.mod.slugify("", "fallback"), "fallback")
        with self.assertRaises(HTTPException):
            self.mod.parse_manifest("[]")

    def test_write_markdown_popula_secao_de_alertas_midia_timeline_warnings(self):
        out = Path(self.tmp.name) / "item.md"
        media1 = Path(self.tmp.name) / "a.pdf"
        manifest = {
            "itemId": "X1",
            "manifestVersion": 2,
            "sinId": "SIN-1",
            "sessionRunId": "session_x",
            "historicoSummary": {
                "criticalFiscalRework": True,
                "fiscalTransitionsCount": 3,
                "importantSignals": [{"tipo": "ALTERACAO_CHAVE", "descricao": "NCM alterado"}],
                "stageTransitions": [{"dia": "10/02", "hora": "10:00", "usuario": "USR", "stage": "FISCAL-INTEGRA"}],
                "ncmMentions": {
                    "found": True,
                    "keywordMentions": 1,
                    "formattedMatches": 1,
                    "unformattedMatchesWithContext": 0,
                    "codes": ["3926.90.40"],
                    "evidences": [{"dia": "10/02", "hora": "10:01", "usuario": "USR", "codigo": "3926.90.40", "trecho": "NCM"}],
                },
                "totalEventos": 1,
                "totalTransicoes": 1,
            },
            "mediaSummary": {
                "status": "OK",
                "total": 1,
                "imagens": 0,
                "pdfs": 1,
                "unsupported": 0,
                "itens": [{"tipo": "pdf", "filename": "a.pdf", "url": "http://x/a.pdf"}],
            },
            "historicoTimeline": [{"dia": "10/02", "hora": "10:00", "usuario": "USR", "descricao": "Solicitação enviada para FISCAL-INTEGRA"}],
        }
        self.mod.write_markdown(manifest, out, [media1], ["aviso teste"])
        txt = out.read_text(encoding="utf-8")
        self.assertIn("## Alertas", txt)
        self.assertIn("Sinais importantes", txt)
        self.assertIn("## Menções a NCM", txt)
        self.assertIn("## Warnings", txt)
        self.assertIn("aviso teste", txt)

    def test_get_paddleocr_caching_success_and_failure(self):
        # cached path
        self.mod._paddleocr_cls = "cached-engine"
        self.assertEqual(self.mod._get_paddleocr(), "cached-engine")

        # success import path
        fake_paddleocr = types.ModuleType("paddleocr")

        class FakeEngine:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        fake_paddleocr.PaddleOCR = FakeEngine
        fake_paddle = types.ModuleType("paddle")
        fake_paddle.device = types.SimpleNamespace(is_compiled_with_cuda=lambda: True)

        self.mod._paddleocr_cls = None
        with patch.dict(sys.modules, {"paddleocr": fake_paddleocr, "paddle": fake_paddle}, clear=False):
            eng = self.mod._get_paddleocr()
        self.assertIsInstance(eng, FakeEngine)
        self.assertTrue(eng.kwargs["use_gpu"])

        # failure path
        self.mod._paddleocr_cls = None
        orig_import = __import__

        def _fake_import(name, *args, **kwargs):
            if name.startswith("paddleocr"):
                raise ImportError("no paddleocr")
            return orig_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=_fake_import):
            eng2 = self.mod._get_paddleocr()
        self.assertFalse(eng2)

    def test_extract_text_from_pdf_encrypted_failure(self):
        class FakeReader:
            is_encrypted = True
            pages = []

            def decrypt(self, _):
                raise RuntimeError("decrypt error")

        with patch.object(self.mod, "PdfReader", return_value=FakeReader()):
            out = self.mod.extract_text_from_pdf(Path(self.tmp.name) / "x.pdf")
        self.assertEqual(out, "")

    def test_ocr_tesseract_and_ocr_paddle_paths(self):
        self.mod.pytesseract = None
        self.assertEqual(self.mod.ocr_tesseract(object()), "")

        self.mod.pytesseract = types.SimpleNamespace(image_to_string=lambda img, lang="por+eng": " texto ")
        self.assertEqual(self.mod.ocr_tesseract(object()), "texto")

        self.mod.pytesseract = types.SimpleNamespace(image_to_string=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("fail")))
        self.assertEqual(self.mod.ocr_tesseract(object()), "")

        fake_engine = types.SimpleNamespace(
            ocr=lambda *_args, **_kwargs: [[[None, ("linha 1", 0.9)], [None, ("linha 2", 0.8)]]]
        )
        with patch.object(self.mod, "_get_paddleocr", return_value=fake_engine):
            txt = self.mod.ocr_paddle("img.png")
            self.assertIn("linha 1", txt)
            self.assertIn("linha 2", txt)

        with patch.object(self.mod, "_get_paddleocr", return_value=False):
            self.assertEqual(self.mod.ocr_paddle("img.png"), "")

        bad_engine = types.SimpleNamespace(ocr=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("ocr fail")))
        with patch.object(self.mod, "_get_paddleocr", return_value=bad_engine):
            self.assertEqual(self.mod.ocr_paddle("img.png"), "")

    def test_pdf_to_images_and_extract_media_text_fallbacks(self):
        pdf = Path(self.tmp.name) / "doc.pdf"
        pdf.write_bytes(b"%PDF-test")
        img = Path(self.tmp.name) / "img.png"
        img.write_bytes(b"png")
        txt = Path(self.tmp.name) / "a.txt"
        txt.write_text("x", encoding="utf-8")

        self.mod._pdf2img = None
        self.mod.Image = None
        self.assertEqual(self.mod._pdf_to_images(pdf), [])

        self.mod._pdf2img = lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("pdf2img fail"))
        self.assertEqual(self.mod._pdf_to_images(pdf), [])

        with patch.object(self.mod, "extract_text_from_pdf", return_value="abc"), patch.object(
            self.mod, "_pdf_to_images", return_value=[]
        ):
            out = self.mod.extract_media_text(pdf, engine="tesseract")
            self.assertEqual(out["method"], "pypdf")
            self.assertEqual(out["chars"], 3)

        with patch.object(self.mod, "extract_text_from_pdf", return_value=""), patch.object(
            self.mod, "_pdf_to_images", return_value=[object(), object()]
        ), patch.object(self.mod, "ocr_paddle", side_effect=["pag1", ""]), patch.object(
            self.mod, "ocr_tesseract", return_value="pag2"
        ):
            out2 = self.mod.extract_media_text(pdf, engine="paddleocr")
            self.assertEqual(out2["method"], "paddleocr")
            self.assertIn("pag1", out2["text"])
            self.assertIn("pag2", out2["text"])

        with patch.object(self.mod, "ocr_paddle", return_value=""), patch.object(
            self.mod, "ocr_tesseract", return_value="texto-imagem"
        ):
            out3 = self.mod.extract_media_text(img, engine="paddleocr")
            self.assertEqual(out3["method"], "tesseract")
            self.assertGreater(out3["chars"], 0)

        out4 = self.mod.extract_media_text(txt)
        self.assertEqual(out4["method"], "none")
        self.assertEqual(out4["chars"], 0)

    def test_extract_media_text_reports_invalid_pdf_and_metadata(self):
        bad = Path(self.tmp.name) / "bad.pdf"
        bad.write_bytes(b"NOT_A_PDF")
        out = self.mod.extract_media_text(bad, engine="tesseract")
        self.assertEqual(out["errorCode"], "PDF_INVALID")
        self.assertIn("backendChain", out)
        self.assertIn("pipeline", out)
        self.assertIn("durationMs", out)
        self.assertEqual(out["chars"], 0)

    def test_pdf_regression_corpus_minimum_success_ratio(self):
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        good_pdf = Path(self.tmp.name) / "good_text.pdf"
        c = canvas.Canvas(str(good_pdf), pagesize=A4)
        c.drawString(72, 700, "Texto de regressão OCR corpus abc 123")
        c.save()

        bad_pdf = Path(self.tmp.name) / "broken.pdf"
        bad_pdf.write_bytes(b"broken")

        corpus = [good_pdf, bad_pdf]
        ok_count = 0
        for pdf in corpus:
            result = self.mod.extract_media_text(pdf, engine="tesseract")
            has_text = int(result.get("chars") or 0) > 0
            has_classified_error = bool(result.get("errorCode"))
            if has_text or has_classified_error:
                ok_count += 1

        ratio = ok_count / len(corpus)
        self.assertGreaterEqual(ratio, 0.98)

    def test_status_helpers_read_write_and_rebuild_markdown(self):
        item_dir = Path(self.tmp.name) / "item_X"
        media_dir = item_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        md = item_dir / "item_X.md"
        md.write_text("# Titulo\n\n## Acompanhamento (Apêndice Completo)\n", encoding="utf-8")
        (media_dir / "doc.pdf.extracted.txt").write_text("texto extraído " * 600, encoding="utf-8")

        self.mod._write_extraction_status(item_dir, {
            "files": {"doc.pdf": {"method": "pypdf"}},
            "engine": "tesseract",
        })
        status = self.mod._read_extraction_status(item_dir)
        self.assertIn("files", status)

        out = self.mod.rebuild_item_markdown(item_dir, "X")
        self.assertTrue(out.exists())
        txt = out.read_text(encoding="utf-8")
        self.assertIn("## Texto Extraído das Mídias", txt)
        self.assertIn("[texto truncado]", txt)

        # Corrupt status file path
        (item_dir / "extraction_status.json").write_text("{", encoding="utf-8")
        self.assertEqual(self.mod._read_extraction_status(item_dir), {})


if __name__ == "__main__":
    unittest.main()
