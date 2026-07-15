import fs from "node:fs";
import path from "node:path";

const coveragePath = path.resolve("reports/coverage/js/coverage-final.json");

if (!fs.existsSync(coveragePath)) {
  console.error(`coverage-final.json não encontrado em ${coveragePath}`);
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf-8"));

const criticalFiles = [
  "src/workflow/pagina-verificador.ts",
  "src/data/item-map-manager.ts",
];

const minPct = 80;
const failures = [];

function normalize(p) {
  return p.replaceAll("\\", "/");
}

function statementCoveragePercent(fileCov) {
  const statements = Object.values(fileCov.s || {});
  if (statements.length) {
    const covered = statements.filter((n) => Number(n) > 0).length;
    return (covered / statements.length) * 100;
  }
  const lines = Object.values(fileCov.l || {});
  if (!lines.length) return 0;
  const covered = lines.filter((n) => Number(n) > 0).length;
  return (covered / lines.length) * 100;
}

for (const file of criticalFiles) {
  const hit = Object.entries(coverage).find(([k]) =>
    normalize(k).endsWith(file),
  );
  if (!hit) {
    failures.push(`${file}: sem dados de cobertura`);
    continue;
  }

  const pct = statementCoveragePercent(hit[1]);
  if (pct < minPct) {
    failures.push(`${file}: ${pct.toFixed(1)}% (< ${minPct}%)`);
  } else {
    console.log(`${file}: ${pct.toFixed(1)}%`);
  }
}

if (failures.length) {
  console.error("Falha de cobertura crítica JS:");
  for (const f of failures) {
    console.error(`- ${f}`);
  }
  process.exit(1);
}

console.log("Cobertura crítica JS OK.");
