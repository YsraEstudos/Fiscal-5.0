# AI Context

## GitHub publish checklist

Before sending any change to GitHub, always confirm the Tampermonkey release metadata:

- If the published userscript changed, increment `userscript.version` in `vite.config.js` before building.
- Keep `userscript.updateURL` and `userscript.downloadURL` pointing to `https://raw.githubusercontent.com/YsraEstudos/Fiscal-5.0/main/dist/FISCAL-5.0.user.js`.
- Run `npm run build` after metadata changes and verify `dist/FISCAL-5.0.user.js` contains `@version`, `@updateURL`, and `@downloadURL`.
- Only push after the generated `dist/FISCAL-5.0.user.js` has the correct Tampermonkey update metadata.
