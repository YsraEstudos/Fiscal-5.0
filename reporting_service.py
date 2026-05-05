from __future__ import annotations

from reporting.app import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("reporting_service:app", host="127.0.0.1", port=8765, reload=False)
