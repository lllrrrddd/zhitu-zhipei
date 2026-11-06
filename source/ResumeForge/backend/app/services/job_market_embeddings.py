# SPDX-License-Identifier: Apache-2.0
"""Optional local embeddings. Cache job vectors only; resume vectors are request scoped."""

import logging
import math
import os
from collections import OrderedDict

import httpx

from ..schemas.job_market import CareerProfile, MarketJob

logger = logging.getLogger(__name__)
MODEL = "qwen3-embedding:0.6b"
_vectors: OrderedDict[str, tuple[float, ...]] = OrderedDict()
_DIMENSIONS = 256


def _job_text(job: MarketJob) -> str:
    return f"{job.title}\n{job.requirements[:230]}\n{job.responsibilities[:90]}"


def _unit_vector(raw: list[float]) -> tuple[float, ...]:
    if len(raw) != _DIMENSIONS or not all(math.isfinite(item) for item in raw):
        raise ValueError("Invalid local embedding")
    norm = math.sqrt(sum(item * item for item in raw))
    if not norm:
        raise ValueError("Empty local embedding")
    return tuple(item / norm for item in raw)


async def semantic_scores(profile: CareerProfile, jobs: list[MarketJob]) -> dict[str, float]:
    if len(jobs) < 2 or os.environ.get("RF_CAREER_EMBEDDINGS") == "0":
        return {}
    query_text = "\n".join(
        [profile.direction, profile.major, "、".join(profile.skills), *profile.experience]
    )
    query = f"Instruct: Retrieve job postings relevant to this candidate's skills and interests.\nQuery: {query_text[:500]}"
    texts = {job.id: _job_text(job) for job in jobs}
    cached = {text: _vectors[text] for text in texts.values() if text in _vectors}
    missing = list(dict.fromkeys(text for text in texts.values() if text not in cached))

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(22, connect=1.5), trust_env=False
        ) as client:
            response = await client.post(
                "http://127.0.0.1:11434/api/embed",
                json={
                    "model": MODEL,
                    "input": [query, *missing],
                    "dimensions": _DIMENSIONS,
                    "options": {"num_gpu": 0, "num_ctx": 768, "num_thread": 4},
                    "keep_alive": "10m",
                },
            )
            response.raise_for_status()
            vectors = response.json()["embeddings"]
        if len(vectors) != len(missing) + 1:
            raise ValueError("Incorrect local embedding count")
        query_vector = _unit_vector(vectors[0])
        for text, vector in zip(missing, vectors[1:], strict=True):
            cached[text] = _unit_vector(vector)
            _vectors[text] = cached[text]
        while len(_vectors) > 450:
            _vectors.popitem(last=False)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.debug("Local career embedding unavailable: %s", type(exc).__name__)
        return {}

    return {
        job_id: sum(a * b for a, b in zip(query_vector, cached[text], strict=True))
        for job_id, text in texts.items()
    }
