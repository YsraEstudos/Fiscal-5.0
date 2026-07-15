import { STYLE_ID } from './painel-constants.ts';

export function injetarEstilosPainel(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --km-bg: linear-gradient(180deg, #f4f1e8 0%, #e7ded0 100%);
            --km-surface: rgba(255, 250, 240, 0.9);
            --km-surface-strong: rgba(255, 252, 247, 0.98);
            --km-border: rgba(90, 68, 44, 0.18);
            --km-shadow: 0 22px 40px rgba(53, 42, 31, 0.18);
            --km-text: #2f241b;
            --km-muted: #6c5947;
            --km-accent: #0e5a48;
            --km-accent-strong: #0a4336;
            --km-danger: #b42318;
            --km-warning: #d97706;
        }

        #painel-robo-pro {
            position: fixed;
            top: 10px;
            left: 10px;
            width: min(390px, calc(100vw - 20px));
            max-height: calc(100vh - 20px);
            z-index: 999999;
            overflow: hidden;
            border: 1px solid var(--km-border);
            border-radius: 22px;
            background: var(--km-bg);
            color: var(--km-text);
            box-shadow: var(--km-shadow);
            font-family: "Segoe UI", Tahoma, sans-serif;
            transition: width 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
        }

        #painel-robo-pro.is-collapsed {
            width: 60px;
        }

        .km-drawer-shell {
            display: flex;
            flex-direction: column;
            min-height: 100%;
        }

        .km-drawer-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: linear-gradient(135deg, #153a2d 0%, #245847 100%);
            color: #fffdf8;
            cursor: move;
            user-select: none;
        }

        #painel-robo-pro.is-collapsed .km-drawer-header {
            flex-direction: column;
            gap: 12px;
            padding: 14px 8px;
        }

        #drawerToggle {
            width: 34px;
            height: 34px;
            border: 0;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
            font-size: 18px;
            cursor: pointer;
        }

        .km-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex: 1;
        }

        .km-brand-mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.16);
            font-weight: 700;
            letter-spacing: 0.08em;
        }

        .km-brand-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .km-brand-title {
            font-size: 14px;
            font-weight: 700;
            line-height: 1.1;
        }

        .km-brand-subtitle {
            font-size: 10px;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .km-drawer-status-compact {
            padding: 6px 8px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.14);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            white-space: nowrap;
        }

        #painel-robo-pro.is-collapsed .km-brand-copy,
        #painel-robo-pro.is-collapsed .km-drawer-status-compact {
            display: none;
        }

        #painelConteudo {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: calc(100vh - 90px);
            scrollbar-width: thin;
        }

        #painel-robo-pro.is-collapsed #painelConteudo {
            display: none;
        }

        .km-collapsible {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .km-section-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 6px 10px;
            border: 1px solid rgba(90, 68, 44, 0.18);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.62);
            color: var(--km-text);
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            text-align: left;
        }

        .km-section-toggle:hover {
            background: rgba(255, 255, 255, 0.78);
        }

        .km-section-toggle-label {
            pointer-events: none;
        }

        .km-section-toggle-icon {
            font-size: 10px;
            opacity: 0.85;
            pointer-events: none;
        }

        .km-collapsible.is-collapsed .km-section-body {
            display: none;
        }

        .km-card {
            padding: 12px;
            border: 1px solid var(--km-border);
            border-radius: 18px;
            background: var(--km-surface);
            backdrop-filter: blur(8px);
        }

        .km-summary-card {
            background: linear-gradient(180deg, rgba(255, 252, 247, 0.95), rgba(248, 240, 226, 0.95));
        }

        .km-summary-card.is-critical {
            border-color: rgba(180, 35, 24, 0.35);
            background: linear-gradient(180deg, rgba(255, 241, 238, 0.98), rgba(255, 230, 224, 0.98));
        }

        .km-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
        }

        .km-card-head--tight {
            align-items: center;
            margin-bottom: 10px;
        }

        .km-kicker {
            margin: 0;
            color: var(--km-muted);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        .km-card-title,
        .km-section-label {
            margin: 0;
            font-size: 12px;
            font-weight: 700;
            color: var(--km-text);
        }

        .km-badge {
            padding: 6px 8px;
            border-radius: 999px;
            background: rgba(14, 90, 72, 0.1);
            color: var(--km-accent);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .km-summary-copy {
            margin: 0 0 10px;
            font-size: 11px;
            line-height: 1.45;
        }

        .km-summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .km-summary-metric {
            padding: 10px;
            border-radius: 14px;
            background: var(--km-surface-strong);
            border: 1px solid rgba(90, 68, 44, 0.08);
        }

        .km-trace-card.is-critical {
            border-color: rgba(180, 35, 24, 0.35);
            background: linear-gradient(180deg, rgba(255, 241, 238, 0.98), rgba(255, 230, 224, 0.98));
        }

        .km-trace-current {
            margin: 0 0 10px;
            font-size: 11px;
            font-weight: 700;
            color: var(--km-text);
        }

        .km-trace-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .km-trace-item {
            display: grid;
            grid-template-columns: 64px minmax(0, 1fr);
            gap: 8px;
            padding: 8px 10px;
            border-radius: 12px;
            background: var(--km-surface-strong);
            border: 1px solid rgba(90, 68, 44, 0.08);
            font-size: 10px;
            line-height: 1.4;
        }

        .km-trace-time {
            color: var(--km-muted);
            font-variant-numeric: tabular-nums;
        }

        .km-trace-copy {
            color: var(--km-text);
            word-break: break-word;
        }

        .km-summary-label {
            display: block;
            font-size: 10px;
            color: var(--km-muted);
            margin-bottom: 4px;
        }

        .km-summary-value {
            font-size: 13px;
            line-height: 1.2;
        }

        .km-form-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .km-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .km-field-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .km-field label {
            font-size: 11px;
            color: var(--km-muted);
        }

        .km-checkline {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--km-text);
        }

        .km-divider {
            height: 1px;
            background: rgba(90, 68, 44, 0.12);
            margin: 2px 0;
        }

        #painel-robo-pro input[type="text"],
        #painel-robo-pro input[type="number"],
        #painel-robo-pro select,
        #painel-robo-pro textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(90, 68, 44, 0.18);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.85);
            color: var(--km-text);
            padding: 8px 10px;
            font-size: 11px;
        }

        #painel-robo-pro input[type="range"] {
            width: 100%;
        }

        #painel-robo-pro input[type="text"]:focus,
        #painel-robo-pro input[type="number"]:focus,
        #painel-robo-pro select:focus,
        #painel-robo-pro textarea:focus {
            outline: 2px solid rgba(14, 90, 72, 0.18);
            border-color: rgba(14, 90, 72, 0.3);
        }

        .km-textarea {
            min-height: 100px;
            resize: vertical;
            font-family: Consolas, "Courier New", monospace;
        }

        .km-button-row {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .km-primary-button,
        .km-secondary-button,
        .km-inline-button,
        .km-action-button {
            border: 0;
            border-radius: 14px;
            cursor: pointer;
            transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease;
        }

        .km-primary-button:hover,
        .km-secondary-button:hover,
        .km-inline-button:hover,
        .km-action-button:hover {
            opacity: 0.92;
            transform: translateY(-1px);
        }

        .km-primary-button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-strong) 100%);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
        }

        .km-secondary-button,
        .km-inline-button,
        .km-action-button {
            padding: 8px 10px;
            background: rgba(14, 90, 72, 0.09);
            color: var(--km-accent-strong);
            font-size: 11px;
        }

        .km-inline-button {
            padding: 6px 8px;
            white-space: nowrap;
        }

        .km-inline-button--danger {
            background: rgba(180, 35, 24, 0.1);
            color: var(--km-danger);
        }

        .km-status {
            margin-top: 8px;
            font-size: 11px;
            text-align: center;
            color: var(--km-muted);
        }

        .km-helper-text {
            margin-top: 8px;
            font-size: 10px;
            color: var(--km-muted);
        }

        .km-progress-card {
            gap: 8px;
        }

        .km-progress-track {
            width: 100%;
            height: 14px;
            border-radius: 999px;
            background: rgba(90, 68, 44, 0.12);
            overflow: hidden;
        }

        .km-progress-fill {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #0e5a48, #d5a14f);
            transition: width 0.3s ease;
        }

        .km-progress-text {
            margin-top: 6px;
            text-align: center;
            font-size: 10px;
            color: var(--km-muted);
        }

        .km-log-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 6px;
        }

        .km-log-resizer {
            border-radius: 14px;
            background: #1f2421;
        }

        .km-log-area {
            height: 110px;
            min-height: 80px;
            max-height: min(520px, 60vh);
            overflow-y: auto;
            box-sizing: border-box;
            border-radius: 14px 14px 10px 10px;
            border: 1px solid rgba(17, 24, 39, 0.08);
            background: #1f2421;
            color: #d5f7d0;
            padding: 8px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 10px;
        }

        .km-log-resize-handle {
            height: 12px;
            cursor: ns-resize;
            border-radius: 0 0 14px 14px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.12));
            position: relative;
        }

        .km-log-resize-handle::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 4px;
            width: 38px;
            height: 3px;
            transform: translateX(-50%);
            border-radius: 999px;
            background: rgba(213, 247, 208, 0.42);
        }

        .km-shortcuts {
            margin-top: 8px;
            text-align: center;
            font-size: 10px;
            color: var(--km-muted);
        }

        .log-entry {
            padding: 2px 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            word-break: break-word;
        }

        .log-info { color: #9de29b; }
        .log-browser { color: #7cc7ff; }
        .log-warn { color: #f4e28a; }
        .log-error { color: #ff8f8f; font-weight: bold; }

        .km-lista-acoes-wrapper {
            max-height: min(220px, 32vh);
            overflow-y: auto;
            scrollbar-width: thin;
        }

        .acao-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            margin-bottom: 6px;
            border: 1px dashed transparent;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.68);
            transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
        }

        .acao-item.dragging { opacity: 0.5; }
        .acao-item.acao-item--desabilitado { opacity: 0.58; }
        .acao-item.drag-over {
            border-color: rgba(14, 90, 72, 0.35);
            background: rgba(14, 90, 72, 0.08);
        }

        .acao-handle {
            cursor: grab;
            font-size: 12px;
            padding: 0 4px;
            user-select: none;
        }

        .km-acao-nome {
            flex: 1;
            min-width: 0;
            font-size: 10px;
        }

        .km-acao-input {
            width: 72px !important;
            min-width: 72px;
            padding: 4px 6px !important;
        }

        .km-acao-buttons {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .km-action-button[disabled] {
            opacity: 0.5;
            cursor: default;
            transform: none;
        }

        .km-fiscal-hint-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .km-fiscal-hint-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.68);
            border: 1px solid rgba(90, 68, 44, 0.1);
        }

        .km-fiscal-hint-row-copy {
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;
            font-size: 10px;
        }

        .km-fiscal-hint-row-copy strong,
        .km-fiscal-hint-row-copy span {
            overflow-wrap: anywhere;
        }

        .km-fiscal-hint-row-copy em {
            color: var(--km-muted);
            font-size: 9px;
            font-style: normal;
        }

        .km-fiscal-hint-row-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 4px;
        }

        .km-field-help {
            color: var(--km-muted);
            font-size: 9px;
            line-height: 1.35;
        }

        #km-fiscal-hints-manager[hidden] {
            display: none;
        }

        #km-fiscal-hints-manager {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: grid;
            place-items: center;
            box-sizing: border-box;
            padding: 16px;
            color: var(--km-text);
            font-family: "Segoe UI", Tahoma, sans-serif;
        }

        .km-fiscal-hints-manager-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(24, 31, 26, 0.52);
            backdrop-filter: blur(3px);
        }

        .km-fiscal-hints-manager-dialog {
            position: relative;
            display: flex;
            flex-direction: column;
            width: min(760px, calc(100vw - 24px));
            max-height: min(720px, calc(100vh - 24px));
            overflow: hidden;
            border: 1px solid rgba(255, 250, 240, 0.3);
            border-radius: 22px;
            background: var(--km-bg);
            box-shadow: 0 28px 70px rgba(15, 24, 18, 0.36);
            animation: km-fiscal-hints-manager-enter 0.2s ease-out;
        }

        @keyframes km-fiscal-hints-manager-enter {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .km-fiscal-hints-manager-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 20px;
            background: linear-gradient(135deg, #153a2d 0%, #245847 100%);
            color: #fffdf8;
        }

        .km-fiscal-hints-manager-header .km-kicker,
        .km-fiscal-hints-manager-header .km-fiscal-hints-manager-subtitle {
            color: rgba(255, 253, 248, 0.74);
        }

        .km-fiscal-hints-manager-title {
            margin: 4px 0 0;
            font-size: 18px;
            line-height: 1.15;
        }

        .km-fiscal-hints-manager-subtitle {
            max-width: 540px;
            margin: 6px 0 0;
            font-size: 11px;
            line-height: 1.4;
        }

        .km-fiscal-hints-manager-close {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            flex: 0 0 auto;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
            cursor: pointer;
            font-size: 22px;
            line-height: 1;
        }

        .km-fiscal-hints-manager-layout {
            display: grid;
            grid-template-columns: minmax(0, 1.12fr) minmax(260px, 0.88fr);
            gap: 12px;
            min-height: 0;
            padding: 14px;
            overflow: auto;
        }

        .km-fiscal-hints-manager-list-panel,
        .km-fiscal-hints-manager-form {
            min-width: 0;
            padding: 12px;
            border: 1px solid var(--km-border);
            border-radius: 16px;
            background: rgba(255, 250, 240, 0.72);
        }

        .km-fiscal-hints-manager-list-panel {
            display: flex;
            flex-direction: column;
            min-height: 300px;
        }

        .km-fiscal-hints-manager-list-head,
        .km-fiscal-hints-manager-form-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .km-fiscal-hints-manager-count {
            display: block;
            margin-top: 3px;
            color: var(--km-muted);
            font-size: 9px;
        }

        .km-fiscal-hints-manager-search-field {
            margin-top: 12px;
        }

        .km-fiscal-hints-manager-list,
        .km-fiscal-hints-manager-form {
            overflow-y: auto;
            scrollbar-width: thin;
        }

        .km-fiscal-hints-manager-list {
            display: flex;
            flex-direction: column;
            gap: 7px;
            max-height: 420px;
            margin-top: 8px;
        }

        .km-fiscal-hints-manager-item {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
            padding: 9px;
            border: 1px solid rgba(90, 68, 44, 0.1);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.72);
        }

        .km-fiscal-hints-manager-item-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
            gap: 3px;
            font-size: 10px;
        }

        .km-fiscal-hints-manager-item-copy strong,
        .km-fiscal-hints-manager-item-copy span,
        .km-fiscal-hints-manager-item-copy em {
            overflow-wrap: anywhere;
        }

        .km-fiscal-hints-manager-item-copy span,
        .km-fiscal-hints-manager-item-copy em {
            color: var(--km-muted);
            font-size: 9px;
            font-style: normal;
        }

        .km-fiscal-hints-manager-item-actions {
            display: flex;
            flex: 0 0 auto;
            gap: 4px;
        }

        .km-fiscal-hints-manager-empty {
            padding: 24px 10px;
            color: var(--km-muted);
            font-size: 10px;
            text-align: center;
        }

        .km-fiscal-hints-manager-form {
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow: visible;
        }

        .km-fiscal-hints-manager-form-head {
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(90, 68, 44, 0.12);
        }

        .km-fiscal-hints-manager-form-title {
            margin: 4px 0 0;
            font-size: 15px;
        }

        .km-fiscal-hints-manager-form-actions {
            align-items: stretch;
            margin-top: auto;
            padding-top: 4px;
        }

        .km-fiscal-hints-manager-submit {
            width: auto;
            flex: 1;
        }

        #km-fiscal-hints-manager input[type="text"],
        #km-fiscal-hints-manager input[type="search"] {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(90, 68, 44, 0.18);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.88);
            color: var(--km-text);
            padding: 8px 10px;
            font-size: 11px;
        }

        #km-fiscal-hints-manager input[type="text"]:focus,
        #km-fiscal-hints-manager input[type="search"]:focus,
        #km-fiscal-hints-manager button:focus-visible {
            outline: 2px solid rgba(14, 90, 72, 0.24);
            outline-offset: 2px;
        }

        [data-km-fiscal-manager-status].is-error {
            color: var(--km-danger);
        }

        .km-fiscal-hint-mark {
            display: inline;
            border: 0;
            border-radius: 6px;
            padding: 1px 4px;
            background: #ffe08a;
            color: #3b2a00;
            font: inherit;
            cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(118, 84, 0, 0.24);
        }

        #km-fiscal-hint-popup {
            position: fixed;
            z-index: 2147483646;
            width: min(252px, calc(100vw - 16px));
            box-sizing: border-box;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid rgba(50, 40, 24, 0.18);
            background: #fffdf8;
            color: #2f241b;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
            font-family: "Segoe UI", Tahoma, sans-serif;
        }

        .km-fiscal-popup-title {
            margin-bottom: 8px;
            font-size: 11px;
            font-weight: 700;
            overflow-wrap: anywhere;
        }

        .km-fiscal-popup-actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .km-fiscal-popup-actions button {
            border: 0;
            border-radius: 8px;
            padding: 8px;
            background: rgba(14, 90, 72, 0.1);
            color: #0a4336;
            cursor: pointer;
            font-size: 11px;
            text-align: left;
        }

        @media (max-width: 640px) {
            .km-fiscal-hints-manager-layout {
                grid-template-columns: 1fr;
            }

            .km-fiscal-hints-manager-list-panel {
                min-height: 0;
            }

            .km-fiscal-hints-manager-list {
                max-height: 240px;
            }
            #painel-robo-pro {
                width: calc(100vw - 20px);
            }

            .km-field-grid,
            .km-summary-grid,
            .km-button-row {
                grid-template-columns: 1fr;
                flex-direction: column;
            }
        }
    `;

    document.head.appendChild(style);
}
