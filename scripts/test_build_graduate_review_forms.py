"""Blind forms must include every case without leaking the author's labels."""

import build_graduate_review_forms as forms


def test_form_covers_all_profile_job_pairs_without_provisional_answers() -> None:
    profiles = forms._load("profiles.json")
    jobs = forms._load("jobs.json")
    output = forms.build_form("A", profiles, jobs)
    assert output.count("| [页面](") == len(profiles) * len(jobs)
    assert "labels.json" in output
    assert "relevant_job_ids" not in output
    assert "作者初标" not in output
    assert "J14" in output
    assert "毕业届别：2027" in output
    assert "存在放宽条款，需核对" in output
    assert "更正：____" in output
