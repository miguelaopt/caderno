#!/usr/bin/env python3
"""Tapete de piano suave para o vídeo do Caderno, sintetizado com numpy.

Uso: python3 piano.py <saida.wav> <duracao> <inicio_cena> [<inicio_cena> ...]
Cada cena começa num acorde novo; entre acordes toca um arpejo lento.
"""
import sys, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

# Fá maior, calmo: Fmaj7 · Dm7 (tensão leve) · Bbmaj7 · Am7 · Gm7 · C/F → Fadd9
PROGRESSION = [
    (41, [57, 60, 64, 65]),   # Fmaj7
    (38, [57, 60, 62, 65]),   # Dm7
    (46, [57, 62, 65, 69]),   # Bbmaj7
    (45, [55, 60, 64, 67]),   # Am7
    (43, [58, 62, 65, 69]),   # Gm7 (9)
    (41, [55, 60, 65, 69]),   # Fadd9
]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def note(midi, vel, length=6.0):
    t = np.arange(int(length * SR)) / SR
    f0 = hz(midi)
    tau = np.interp(midi, [36, 84], [4.5, 1.4])          # graves soam mais tempo
    out = np.zeros_like(t)
    for n in range(1, 9):
        fn = n * f0 * np.sqrt(1 + 0.0004 * n * n)        # inarmonicidade de corda
        if fn > 9000:
            break
        amp = vel ** (1 + 0.25 * n) / n ** 1.6           # tocar baixo = timbre mais escuro
        decay = 0.55 * np.exp(-t / (0.25 * tau / n)) + 0.45 * np.exp(-t / (tau / (1 + 0.5 * (n - 1))))
        for detune in (-0.0004, 0.0004):                 # duas cordas, leve coro
            out += amp * decay * np.sin(2 * np.pi * fn * (1 + detune) * t + rng.uniform(0, 6.28))
    attack = np.minimum(1, t / 0.006)
    release = np.minimum(1, (length - t) / 0.4)
    return out * attack * release * 0.5


def place(buf, sig, start, pan):
    i = int(start * SR)
    j = min(len(buf), i + len(sig))
    if i >= len(buf):
        return
    buf[i:j, 0] += sig[: j - i] * np.cos(pan * np.pi / 2)
    buf[i:j, 1] += sig[: j - i] * np.sin(pan * np.pi / 2)


def reverb(dry, seconds=2.6):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    wet = np.zeros_like(dry)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / seconds)
        ir = np.convolve(ir, np.ones(12) / 12, mode="same")   # cauda mais escura
        size = 1 << int(np.ceil(np.log2(len(dry) + n)))
        wet[:, ch] = np.fft.irfft(np.fft.rfft(dry[:, ch], size) * np.fft.rfft(ir, size), size)[: len(dry)]
    return wet / np.max(np.abs(wet)) * np.max(np.abs(dry))


def build(duration, starts):
    buf = np.zeros((int((duration + 0.5) * SR), 2))
    for k, start in enumerate(starts):
        bass, chord = PROGRESSION[k % len(PROGRESSION)]
        end = starts[k + 1] if k + 1 < len(starts) else duration
        place(buf, note(bass, 0.38, 7), start, 0.4)
        place(buf, note(bass + 12, 0.22, 7), start + 0.02, 0.45)
        for i, m in enumerate(chord):                     # acorde levemente arpejado
            place(buf, note(m, 0.34, 6), start + 0.05 + 0.045 * i, 0.35 + 0.1 * i)
        if k == len(starts) - 1:
            place(buf, note(chord[-1] + 12, 0.3, 6), start + 1.6, 0.65)  # nota final
            continue
        beat = 0.75
        pattern = [chord[1] + 12, chord[2] + 12, chord[3], chord[2] + 12, chord[3] + 12, chord[0] + 12]
        t, i = start + 1.5, 0
        while t < end - 0.6:
            place(buf, note(pattern[i % len(pattern)], 0.36 + 0.05 * rng.random(), 4), t, 0.55 + 0.1 * rng.random())
            t += beat * (2 if i % 3 == 2 else 1)          # respira a cada três notas
            i += 1
    mix = 0.72 * buf + 0.38 * reverb(buf)
    mix = mix[: int(duration * SR)]
    tt = np.arange(len(mix)) / SR
    mix *= np.clip(tt / 1.0, 0, 1)[:, None]                         # fade-in 1 s
    mix *= np.clip((duration - tt) / 3.0, 0, 1)[:, None] ** 1.5     # fade-out 3 s
    return mix / np.max(np.abs(mix)) * 0.5                          # pico −6 dB


def write(path, mix):
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    out, dur, *starts = sys.argv[1:]
    write(out, build(float(dur), [float(s) for s in starts]))
