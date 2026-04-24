export interface DemoAudioOptions {
  durationSec: number;
  sampleRate?: number;
  volume?: number;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createDemoAudioDataUrl({
  durationSec,
  sampleRate = 12_000,
  volume = 0.62,
}: DemoAudioOptions) {
  const safeDuration = clamp(
    Number.isFinite(durationSec) ? durationSec : 4,
    0.5,
    12
  );
  const safeSampleRate = Math.round(clamp(sampleRate, 8_000, 24_000));
  const frameCount = Math.max(1, Math.round(safeDuration * safeSampleRate));
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const twoPi = Math.PI * 2;
  const safeVolume = clamp(volume, 0, 1);
  for (let index = 0; index < frameCount; index += 1) {
    const t = index / safeSampleRate;
    const beat = t % 0.5;
    const pulse = Math.exp(-beat * 18);
    const sweep = 88 + 72 * Math.sin(twoPi * t * 0.19);
    const bass = Math.sin(twoPi * sweep * t) * 0.46 * pulse;
    const shimmer =
      Math.sin(twoPi * 330 * t) * 0.12 +
      Math.sin(twoPi * 660 * t + Math.sin(t * 2.1)) * 0.045;
    const riser = Math.sin(twoPi * (180 + t * 34) * t) * 0.08;
    const envelope = Math.min(1, t / 0.24) * Math.min(1, (safeDuration - t) / 0.24);
    const sample = clamp(
      (bass + shimmer + riser) * safeVolume * envelope,
      -1,
      1
    );
    view.setInt16(44 + index * bytesPerSample, Math.round(sample * 32767), true);
  }

  return `data:audio/wav;base64,${encodeBase64(bytes)}`;
}
