/**
 * Bypass para Trusted Types CSP.
 * Cria a policy 'default' se ainda não existir,
 * permitindo innerHTML/script injection controlado.
 */

// TrustedTypes is a browser-only API; the type is not in standard lib.
declare global {
    interface Window {
        trustedTypes?: {
            createPolicy: (
                name: string,
                rules: {
                    createHTML?: (s: string) => string;
                    createScript?: (s: string) => string;
                    createScriptURL?: (s: string) => string;
                },
            ) => unknown;
            defaultPolicy: unknown;
        };
    }
}

export function enableTrustedTypesBypass(): void {
    try {
        if (window.trustedTypes?.createPolicy) {
            if (!window.trustedTypes.defaultPolicy) {
                window.trustedTypes.createPolicy('default', {
                    createHTML: (s: string) => s,
                    createScript: (s: string) => s,
                    createScriptURL: (s: string) => s,
                });
            }
        }
    } catch (e) {
        console.warn('[KM] TrustedTypes policy não pôde ser criada:', e);
    }
}
