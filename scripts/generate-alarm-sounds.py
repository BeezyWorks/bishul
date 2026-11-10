#!/usr/bin/env python3
"""Synthesises the timer alarm sounds into assets/sounds. Run: python3 scripts/generate-alarm-sounds.py

Each file is one repeating phrase tiled to about 20 seconds: long enough to ring as a notification
sound (iOS caps those at 30s), and it loops cleanly in the app.
"""
import math
import os
import struct
import wave

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')


def note(freq, dur, partials, tail=0.0):
    """One struck note: partials are (ratio, amplitude, decay-per-second)."""
    n = int((dur + tail) * SR)
    buf = [0.0] * n
    for ratio, amp, decay in partials:
        w = 2 * math.pi * freq * ratio / SR
        for i in range(n):
            t = i / SR
            attack = min(1.0, i / (SR * 0.004))
            buf[i] += amp * attack * math.exp(-decay * t) * math.sin(w * i)
    return buf


def place(track, start, samples):
    s = int(start * SR)
    if s + len(samples) > len(track):
        track.extend([0.0] * (s + len(samples) - len(track)))
    for i, v in enumerate(samples):
        track[s + i] += v


def phrase(events, length):
    track = [0.0] * int(length * SR)
    for start, samples in events:
        place(track, start, samples)
    return track[: int(length * SR)]


def write(name, track, target=20.0):
    reps = max(1, round(target / (len(track) / SR)))
    full = track * reps
    peak = max(abs(v) for v in full) or 1
    gain = 0.85 / peak
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(32767 * gain * v)) for v in full))
    print(name, round(len(full) / SR, 1), 's')


BELL = [(1, 1.0, 2.2), (2.76, 0.6, 3.5), (5.4, 0.35, 5.0), (8.93, 0.2, 7.0)]
write(
    'alarm-bell.wav',
    phrase([(k * 0.9, note(880, 2.2, BELL)) for k in range(3)], 5.0),
)

CHIME = [(1, 1.0, 2.5), (2, 0.35, 3.5), (3, 0.12, 5.0)]
write(
    'alarm-chimes.wav',
    phrase([(k * 0.2, note(f, 1.6, CHIME)) for k, f in enumerate([784, 988, 1175, 1568])], 3.4),
)

WOOD = [(1, 1.0, 9.0), (3.9, 0.45, 18.0), (9.2, 0.1, 30.0)]
write(
    'alarm-marimba.wav',
    phrase(
        [(k * 0.24, note(f, 0.7, WOOD)) for k, f in enumerate([523, 659, 784, 659, 523, 659, 784, 1047])],
        3.6,
    ),
)

BEEP = [(1, 1.0, 0.0), (3, 0.15, 0.0)]
write(
    'alarm-beeps.wav',
    phrase([(k * 0.25, note(988, 0.15, BEEP)) for k in range(4)], 1.9),
)
