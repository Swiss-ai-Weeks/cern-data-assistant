import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC, calculate, invariant_mass, validate_spec


def sample():
    return {
        "pt": np.array([[10.0, 12.0], [20.0, 20.0], [5.0, 5.0]]),
        "eta": np.zeros((3, 2)),
        "phi": np.array([[0.0, np.pi], [0.0, 1.0], [0.0, 2.0]]),
        "mass": np.full((3, 2), 0.105),
        "charge": np.array([[1, -1], [1, -1], [1, 1]]),
        "entry": np.arange(3),
    }


def test_reference_selection_counts_opposite_charge_pairs():
    result = calculate(sample(), DEFAULT_SPEC, {"entries_read": 3})
    assert result["selected_events"] == 2
    assert result["plotted_events"] == 2
    assert result["cutflow"][-1]["count"] == 2


def test_same_charge_revision_changes_selection():
    result = calculate(sample(), {**DEFAULT_SPEC, "charge": "same"}, {"entries_read": 3})
    assert result["selected_events"] == 1


def test_invariant_mass_is_non_negative_and_finite():
    values = invariant_mass(sample())
    assert np.isfinite(values).all()
    assert (values >= 0).all()


@pytest.mark.parametrize("bad", [{"min_pt": -1}, {"max_abs_eta": 9}, {"charge": "unknown"}])
def test_invalid_analysis_conditions_are_rejected(bad):
    with pytest.raises(ValueError):
        validate_spec(bad)
