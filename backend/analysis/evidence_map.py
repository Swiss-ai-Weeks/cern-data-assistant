"""Curated links from measured quantities to CERN/CMS documentation."""

VARIABLE_DOCS = [
    {
        'id': 'muon_pt',
        'label': 'Muon transverse momentum (pT)',
        'fields': ['pt'],
        'url': 'https://opendata.cern.ch/record/12341',
        'summary': 'Kinematic momentum perpendicular to the beam, reconstructed from tracker curvature in the magnetic field.',
    },
    {
        'id': 'muon_eta',
        'label': 'Muon pseudorapidity (η)',
        'fields': ['eta'],
        'url': 'https://opendata.cern.ch/record/12341',
        'summary': 'Angular acceptance variable; selections on |η| define which muons enter the reduced sample.',
    },
    {
        'id': 'muon_charge',
        'label': 'Muon charge',
        'fields': ['charge'],
        'url': 'https://root.cern/doc/master/df102__NanoAODDimuonAnalysis_8py_source.html',
        'summary': 'Opposite-sign pairs are the default dimuon reference; same-sign pairs are a diagnostic comparison.',
    },
    {
        'id': 'pair_mass',
        'label': 'Dimuon invariant mass',
        'fields': ['mass'],
        'url': 'https://opendata.cern.ch/record/12342',
        'summary': 'Combined mass of the muon pair; features can reflect physics or event-selection effects documented by CMS.',
    },
    {
        'id': 'trigger',
        'label': 'Event triggering (not in this reduced file)',
        'fields': [],
        'url': 'https://opendata.cern.ch/record/12342',
        'summary': 'Trigger requirements shape which events survive; the reference analysis notes a ~30 GeV feature tied to triggering.',
    },
]


def for_entry() -> list[dict]:
    return VARIABLE_DOCS
