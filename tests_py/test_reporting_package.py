from pathlib import Path


def test_reporting_app_entrypoint_matches_compat_app():
    import reporting.app
    import reporting_service

    assert reporting.app.app is reporting_service.app
    assert reporting.app.create_app().title == reporting_service.app.title


def test_dashboard_loader_uses_file_and_fallback(tmp_path):
    from reporting.dashboard import FALLBACK_DASHBOARD_HTML, load_dashboard_html

    dashboard_path = tmp_path / "dashboard.html"
    dashboard_path.write_text("<html>custom dashboard</html>", encoding="utf-8")

    assert load_dashboard_html(dashboard_path) == "<html>custom dashboard</html>"
    assert load_dashboard_html(tmp_path / "missing.html") == FALLBACK_DASHBOARD_HTML


def test_config_base_dir_points_to_project_root():
    from reporting.config import BASE_DIR

    assert (Path(BASE_DIR) / "dashboard.html").exists()


def test_domain_modules_expose_expected_entrypoints():
    import reporting.extraction
    import reporting.markdown
    import reporting.ocr
    import reporting.pdf
    import reporting.routes
    import reporting.storage

    assert callable(reporting.ocr.extract_media_text)
    assert callable(reporting.pdf.merge_final_pdf)
    assert callable(reporting.markdown.render_markdown_preview)
    assert callable(reporting.storage.append_index)
    assert callable(reporting.extraction._run_extraction)
    assert reporting.routes.router.routes
