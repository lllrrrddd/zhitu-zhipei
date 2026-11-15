# SPDX-License-Identifier: Apache-2.0
"""离线语音识别（面试作答的"说代替打字"）。

**为什么不用浏览器听写**：`webkitSpeechRecognition` 把音频送到云端，国内网络常失败，
而且面试回答属于个人经历，不该出机器。这里用 sherpa-onnx 跑本地模型，纯离线推理。

**默认 SenseVoice，Paraformer 作为兜底**（按模型目录名自动识别）：
同一条带口音的样本上，Paraformer 把"演得/真实"听成"演的/真式"，SenseVoice 全对；
速度基本持平（5 秒音频 0.2 秒 vs 0.2 秒）。SenseVoice 还开 ITN，数字/日期会写成阿拉伯数字。

模型不放仓库（200 MB 级），由部署方放到 `ZY_ASR_MODEL_DIR`；未配置或目录不存在时
**明确报告不可用**，前端据此退回"只能打字"，而不是让用户对着一个点了没反应的按钮。
"""

from __future__ import annotations

import io
import logging
import os
import threading
import wave
from pathlib import Path

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
_MAX_SECONDS = 120

_lock = threading.Lock()
_recognizer = None
_load_error: str | None = None


class AsrUnavailable(RuntimeError):
    """模型没装/加载失败：调用方应把它翻成 503，并告诉用户改用打字。"""


def _model_kind(model_dir: Path) -> str:
    """按目录名认模型类型：sense_voice / paraformer。"""
    name = model_dir.name.lower()
    if "sense-voice" in name or "sense_voice" in name:
        return "sense_voice"
    return "paraformer"


def engine_name() -> str:
    model_dir = _model_dir()
    return _model_kind(model_dir) if model_dir else "none"


def _model_dir() -> Path | None:
    raw = os.environ.get("ZY_ASR_MODEL_DIR", "").strip()
    if not raw:
        return None
    path = Path(raw)
    if not (path / "model.int8.onnx").exists() and not (path / "model.onnx").exists():
        return None
    return path


def available() -> bool:
    """模型目录存在即认为"可以试"；真正的加载失败在首次调用时暴露。"""
    return _model_dir() is not None


def _build():
    """懒加载：没人用语音就不该在启动时吃 200MB 内存和 1 秒 CPU。"""
    global _recognizer, _load_error
    with _lock:
        if _recognizer is not None:
            return _recognizer
        if _load_error is not None:
            raise AsrUnavailable(_load_error)
        model_dir = _model_dir()
        if model_dir is None:
            _load_error = "未配置离线识别模型（ZY_ASR_MODEL_DIR）"
            raise AsrUnavailable(_load_error)
        try:
            import sherpa_onnx  # 延迟到用时再导入：没装 sherpa 也不该让整个服务起不来

            onnx = model_dir / ("model.int8.onnx" if (model_dir / "model.int8.onnx").exists() else "model.onnx")
            threads = max(1, min(4, (os.cpu_count() or 2) - 1))
            kind = _model_kind(model_dir)
            if kind == "sense_voice":
                # use_itn：把"两万"写成 20000 这类，读起来更像人写的答案。
                _recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(onnx),
                    tokens=str(model_dir / "tokens.txt"),
                    num_threads=threads,
                    use_itn=True,
                    language="zh",
                    debug=False,
                )
            else:
                _recognizer = sherpa_onnx.OfflineRecognizer.from_paraformer(
                    paraformer=str(onnx),
                    tokens=str(model_dir / "tokens.txt"),
                    num_threads=threads,
                    sample_rate=SAMPLE_RATE,
                    feature_dim=80,
                    decoding_method="greedy_search",
                )
            logger.info("离线识别模型已加载：%s（%s）", model_dir.name, kind)
        except Exception as exc:  # noqa: BLE001 —— 任何加载失败都归结为"不可用"
            _load_error = f"离线识别模型加载失败：{exc}"
            logger.warning(_load_error)
            raise AsrUnavailable(_load_error) from exc
        return _recognizer


def _decode_wav(payload: bytes) -> tuple[list[float], int]:
    """把 WAV 字节解成 float32 采样 + 采样率。只认 WAV——前端已经转好，简单即可。"""
    with wave.open(io.BytesIO(payload)) as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise ValueError("只支持 16 位 PCM 的 WAV")
    import numpy as np

    data = np.frombuffer(frames, dtype=np.int16).astype("float32") / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data.tolist(), rate


def _resample(samples: list[float], src_rate: int) -> list[float]:
    """线性重采样到 16k。语音识别对这个精度足够，省掉一个音频库依赖。"""
    if src_rate == SAMPLE_RATE:
        return samples
    import numpy as np

    src = np.asarray(samples, dtype="float32")
    target_len = int(len(src) * SAMPLE_RATE / src_rate)
    if target_len <= 0:
        return []
    positions = np.linspace(0, len(src) - 1, target_len)
    return np.interp(positions, np.arange(len(src)), src).astype("float32").tolist()


def transcribe_wav(payload: bytes) -> dict[str, object]:
    """转写一段 WAV。抛 ValueError 表示请求内容不对（400），AsrUnavailable 表示没模型（503）。"""
    if not payload:
        raise ValueError("音频为空")
    recognizer = _build()
    samples, rate = _decode_wav(payload)
    duration = len(samples) / rate if rate else 0
    if duration > _MAX_SECONDS:
        raise ValueError(f"单次录音请控制在 {_MAX_SECONDS} 秒以内")
    if duration < 0.3:
        raise ValueError("录音太短，请说完再停")

    samples = _resample(samples, rate)
    stream = recognizer.create_stream()
    stream.accept_waveform(SAMPLE_RATE, samples)
    recognizer.decode_stream(stream)
    text = (stream.result.text or "").strip()
    logger.info("离线转写完成：%.1fs 音频 → %d 字（%s）", duration, len(text), engine_name())
    return {"text": text, "durationMs": int(duration * 1000), "engine": engine_name()}
