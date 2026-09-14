export interface NotebookRecord {
  recid: number | string;
  title: string;
  url: string;
  usage: string;
  experiment?: string;
  doi?: string | null;
}

/** Tiny Jupyter notebook a judge can take home. No backend. */
export function downloadNotebook(record: NotebookRecord) {
  const doiLine = record.doi ? `\nDOI: https://doi.org/${record.doi}\n` : "";
  const expLine = record.experiment ? `\nExperiment: ${record.experiment}\n` : "";
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    cells: [
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          `# ${record.title}\n`,
          `\n`,
          `Exported from **beamline**. Live CERN Open Data record \`${record.recid}\`.\n`,
          expLine,
          `\nPortal: ${record.url}\n`,
          doiLine,
        ],
      },
      {
        cell_type: "code",
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          "# This command hits opendata.cern.ch. A chat model cannot invent the recid.\n",
          "# pip install cernopendata-client\n",
          `!${record.usage}\n`,
        ],
      },
    ],
  };
  const blob = new Blob([JSON.stringify(nb, null, 2)], {
    type: "application/x-ipynb+json",
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `beamline-recid-${record.recid}.ipynb`;
  a.click();
  URL.revokeObjectURL(href);
}
