// SPDX-License-Identifier: Apache-2.0
/**
 * `trimSilence` 的行为契约。
 *
 * 这条测试守的是一个真实事故：阈值写死 0.008 时，音量偏低的正常说话被整段判成静音，
 * 最后只剩开头零点几秒，识别结果就是一个字（"我"）。所以这里必须验证
 * "低电平不裁" 与 "裁太狠就放弃" 两条保险。
 */
import { describe, expect, it } from "vitest";
import { trimSilence } from "./useSpeech";

const RATE = 16000;

/** 造一段：静音 - 正弦"说话" - 静音。 */
function build({
  silenceSec,
  speechSec,
  amplitude,
}: {
  silenceSec: number;
  speechSec: number;
  amplitude: number;
}): Float32Array {
  const silence = Math.round(RATE * silenceSec);
  const speech = Math.round(RATE * speechSec);
  const out = new Float32Array(silence * 2 + speech);
  for (let i = 0; i < speech; i += 1) {
    // 440Hz 方波近似"有声段"，幅度可控
    out[silence + i] = Math.sin((2 * Math.PI * 440 * i) / RATE) * amplitude;
  }
  return out;
}

describe("trimSilence", () => {
  it("电平很低时不裁剪（否则整段会被当成静音）", () => {
    const samples = build({ silenceSec: 0.3, speechSec: 3, amplitude: 0.01 });
    const result = trimSilence(samples, RATE);
    expect(result.length).toBe(samples.length);
  });

  it("全静音原样返回", () => {
    const samples = new Float32Array(RATE * 2);
    expect(trimSilence(samples, RATE).length).toBe(samples.length);
  });

  it("正常电平：裁掉首尾静音，但保留说话段", () => {
    const samples = build({ silenceSec: 1, speechSec: 3, amplitude: 0.4 });
    const result = trimSilence(samples, RATE);
    expect(result.length).toBeLessThan(samples.length);
    // 说话 3 秒 + 前后各 0.1 秒余量，应明显长于 0.8 秒
    expect(result.length).toBeGreaterThan(RATE * 2.5);
    // 结果的中段应当是"说话"（正弦波），不是静音。单点会正好落在过零点，所以看一段的 RMS。
    const mid = Math.round(result.length / 2);
    let sum = 0;
    const window = 400;
    for (let i = mid; i < mid + window && i < result.length; i += 1) sum += result[i] * result[i];
    expect(Math.sqrt(sum / window)).toBeGreaterThan(0.05);
  });

  it("只有极短的一声：宁可返回原音频，也不交出一段近乎空白", () => {
    const samples = build({ silenceSec: 0, speechSec: 0.2, amplitude: 0.4 });
    const result = trimSilence(samples, RATE);
    expect(result.length).toBe(samples.length);
  });
});
