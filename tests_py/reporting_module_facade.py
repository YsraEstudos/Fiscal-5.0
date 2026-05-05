"""Test helper that exposes domain modules without using production legacy compat."""

from __future__ import annotations

import importlib
import types


def _reload(module_name: str):
    module = importlib.import_module(module_name)
    return importlib.reload(module)


class ReportingModules(types.SimpleNamespace):
    def __init__(self, modules):
        super().__init__()
        object.__setattr__(self, "_modules", modules)
        for module in modules:
            for name in getattr(module, "__all__", None) or dir(module):
                if name.startswith("__"):
                    continue
                object.__setattr__(self, name, getattr(module, name))

    def __setattr__(self, name, value):
        object.__setattr__(self, name, value)
        for module in self._modules:
            if hasattr(module, name):
                setattr(module, name, value)


def load_reporting_modules():
    config = _reload("reporting.config")
    dashboard = _reload("reporting.dashboard")
    events = _reload("reporting.events")
    markdown = _reload("reporting.markdown")
    ocr = _reload("reporting.ocr")
    pdf = _reload("reporting.pdf")
    storage = _reload("reporting.storage")
    extraction = _reload("reporting.extraction")
    routes = _reload("reporting.routes")
    app_module = _reload("reporting.app")
    entrypoint = _reload("reporting_service")
    modules = (config, dashboard, events, markdown, ocr, pdf, storage, extraction, routes, app_module)
    facade = ReportingModules(modules)
    facade.app = entrypoint.app
    return facade
