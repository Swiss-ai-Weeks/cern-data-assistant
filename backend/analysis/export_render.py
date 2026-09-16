"""Render run artifacts for export bundles."""
import io


def spectrum_png(histogram: dict) -> bytes:
    import matplotlib

    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=160)
    ax.stairs(histogram['counts'], histogram['edges'], color='#3F63C9')
    ax.set_xlabel('Muon-pair invariant mass (GeV)')
    ax.set_ylabel('Events / 1 GeV')
    ax.set_title('CMS open data · 2012 · 8 TeV · bounded sample')
    ax.axvspan(28, 33, color='#C47A00', alpha=0.15, label='Reference notes ~30 GeV')
    ax.legend(loc='upper right', fontsize=8)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return buf.getvalue()
