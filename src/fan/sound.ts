import { FX } from "./config";
let context: AudioContext | undefined;
export function playSound(kind: "thwip" | "sense", enabled: boolean) {
  if (!enabled) return;
  try {
    context ||= new AudioContext();
    void context.resume();
    const ctx = context,
      now = ctx.currentTime,
      gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(FX.sound.gain, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + (kind === "thwip" ? FX.sound.thwipSeconds : FX.sound.senseSeconds),
    );
    if (kind === "thwip") {
      const buffer = ctx.createBuffer(
          1,
          Math.floor(ctx.sampleRate * FX.sound.thwipSeconds),
          ctx.sampleRate,
        ),
        channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++)
        channel[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter();
      noise.buffer = buffer;
      filter.type = "bandpass";
      filter.Q.value = 7;
      filter.frequency.setValueAtTime(3600, now);
      filter.frequency.exponentialRampToValueAtTime(
        180,
        now + FX.sound.thwipSeconds,
      );
      noise.connect(filter).connect(gain);
      noise.start();
      noise.stop(now + FX.sound.thwipSeconds);
    } else {
      const lfo = ctx.createOscillator(),
        modulation = ctx.createGain();
      lfo.frequency.value = 17;
      modulation.gain.value = 23;
      lfo.connect(modulation);
      lfo.start();
      for (const detune of [-9, 9]) {
        const oscillator = ctx.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = 172;
        oscillator.detune.value = detune;
        modulation.connect(oscillator.frequency);
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(now + FX.sound.senseSeconds);
      }
      lfo.stop(now + FX.sound.senseSeconds);
    }
  } catch {
    /* Audio support is optional; the interface remains functional. */
  }
}
