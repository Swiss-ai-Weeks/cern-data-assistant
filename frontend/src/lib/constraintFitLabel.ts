export function constraintFitLabel(fit?: string): { label: string; tone: "ok" | "warn" | "muted" } {
  switch (fit) {
    case "executable_sample":
      return { label: "Runnable in investigation", tone: "ok" };
    case "catalog_only_adapter":
      return { label: "Catalog only · no home adapter", tone: "warn" };
    case "exact_energy":
      return { label: "Energy match · check format", tone: "muted" };
    case "different_energy":
      return { label: "Different energy", tone: "warn" };
    default:
      return { label: "Catalog match", tone: "muted" };
  }
}
