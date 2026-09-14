export type DemoScene = "discovery" | "grounded" | "integrity";

export const DEMO_SCENES: Record<
  DemoScene,
  { title: string; description: string; queries: string[] }
> = {
  discovery: {
    title: "Discovery demo",
    description: "Live CERN catalog search → research passport with recid and download command.",
    queries: ["proton-proton collisions at 13 TeV with muons"],
  },
  grounded: {
    title: "Grounded answer demo",
    description: "Detector question answered only from indexed CERN documentation.",
    queries: ["Why does CMS use a solenoid?"],
  },
  integrity: {
    title: "Integrity rail demo",
    description: "Same GPU — ungrounded draft vs Beamline refusal when CERN does not support the claim.",
    queries: ["How do black holes evaporate?"],
  },
};

export const EXAMPLE_QUERIES = [
  "Find proton-proton collisions at 13 TeV with muons",
  "Why does CMS use a solenoid?",
  "Find datasets suitable for a first muon analysis",
  "Compare CMS NanoAOD and MiniAOD",
];
