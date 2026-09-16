export const STARTER_QUERIES = [
  {
    label: "13 TeV collisions with muons",
    query: "Find proton-proton collisions at 13 TeV with muons",
  },
  {
    label: "Why CMS uses a solenoid",
    query: "Why does CMS use a solenoid?",
  },
  {
    label: "First muon analysis datasets",
    query: "Find datasets suitable for a first muon analysis",
  },
  {
    label: "NanoAOD vs MiniAOD",
    query: "Compare CMS NanoAOD and MiniAOD",
  },
] as const;

/** @deprecated use STARTER_QUERIES */
export const EXAMPLE_QUERIES = STARTER_QUERIES.map((item) => item.query);
