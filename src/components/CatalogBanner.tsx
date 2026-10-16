import { Link } from "@tanstack/react-router";

type Imp = { verified: boolean; imported_count: number; expected_count: number } | null;

export function CatalogBanner({ imp }: { imp: Imp }) {
  if (imp?.verified) return null;
  const text = !imp
    ? "No curriculum imported yet. Import your DSA_Roadmap_Audit document to begin."
    : `Catalog incomplete — ${imp.imported_count} of ${imp.expected_count} entries imported and not yet verified.`;
  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      <span>{text}</span>
      <Link to="/import" className="font-medium underline underline-offset-4">Go to import</Link>
    </div>
  );
}
