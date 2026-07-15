import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
    plugins: [
        monkey({
            entry: 'src/main.ts',
            userscript: {
                name: 'FISCAL 5.0 (Robust Robot)',
                namespace: 'http://tampermonkey.net/',
                version: '5.2.5',
                description:
                    'Automação modular FISCAL 5.0 com controle individual de ações, inspeção de elementos, perfis e seletor robusto (ID + Texto).',
                author: 'System Admin',
                match: ['https://*.klassmatt.com.br/*', 'http://*.klassmatt.com.br/*'],
                updateURL:
                    'https://raw.githubusercontent.com/YsraEstudos/Fiscal-5.0/main/dist/FISCAL-5.0.user.js',
                downloadURL:
                    'https://raw.githubusercontent.com/YsraEstudos/Fiscal-5.0/main/dist/FISCAL-5.0.user.js',
                'run-at': 'document-end',
                grant: 'none',
            },
            build: {
                fileName: 'FISCAL-5.0.user.js',
            },
        }),
    ],
});
