---
epic: voice-messages
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Voice Messages

## Problem Statement

Nostling supports text and (soon) image messages, but has no voice message capability. Voice messages are a standard feature in every mainstream messaging app (WhatsApp, Telegram, Signal, Session). They are particularly valuable for desktop users who want to send a quick audio note without typing, and for conveying tone and emotion that text cannot capture.

Voice messages are distinct from voice/video calls (covered by the P2P WebRTC spec). They are asynchronous: the sender records, the recipient plays back at their convenience.

## Core Functionality

Record, send, and play back short audio messages within conversations. Voice messages are transmitted as Blossom media attachments with NIP-17/59 encryption. When encrypted media blobs are implemented, voice message audio is encrypted before upload.

## Functional Requirements

### FR-1: Recording UI

- Microphone button in the message input area (alongside emoji and attachment buttons)
- Press and hold to record (mobile-style interaction adapted for desktop: click to start, click to stop)
- Recording indicator: pulsing red dot, elapsed time counter, waveform visualization
- Cancel recording: press Escape or click cancel button
- Stop recording: click the microphone button again or press Enter to send immediately
- Maximum recording duration: 5 minutes
- Minimum recording duration: 1 second (shorter recordings are discarded)

### FR-2: Audio Format

- Recording format: Opus in OGG container (OGG/Opus)
- Sample rate: 48 kHz mono (voice-optimized)
- Bitrate: 32 kbps (good quality for voice, small file size)
- Typical file size: ~240 KB per minute of audio

### FR-3: Pre-Send Review

- After stopping recording, a playback preview appears in the compose area (similar to attachment preview)
- Preview shows: waveform, duration, play/pause button, delete button
- User can listen to the recording before sending
- Delete button discards the recording
- Send button (or Enter) sends the voice message

### FR-4: Playback UI

- Voice messages displayed as a distinct message bubble type
- Bubble contains: play/pause button, waveform visualization, duration label, playback progress indicator
- Playback speed control: 1x, 1.5x, 2x (tap speed label to cycle)
- Seeking: click on waveform to jump to position
- Auto-stop at end of message
- Only one voice message plays at a time (starting a new one stops the previous)

### FR-5: Transmission

- Voice message transmitted as a Blossom media attachment
- MIME type: `audio/ogg` (or `audio/opus`)
- NIP-17/59 encryption wraps the message event containing the media reference
- When encrypted media blobs are available: audio encrypted before upload (AES-256-GCM)
- Offline queueing: voice messages queue like any other message when relays are unavailable

### FR-6: Waveform Generation

- Generate a waveform visualization from the audio data at recording time
- Store waveform data as part of the message metadata (compact representation: array of amplitude values)
- Waveform used for both the compose preview and the playback display
- Incoming voice messages without waveform data: display a generic audio indicator

## Non-Functional Requirements

- Microphone permission requested on first use (OS-level permission prompt)
- Graceful handling of permission denial (show "Microphone access required" with instructions)
- Audio recording must not block UI (use Web Audio API / MediaRecorder in renderer)
- Playback must work offline (voice messages cached locally like image attachments)
- Recording quality optimized for voice, not music (mono, low bitrate)

## Acceptance Criteria

- User can record a voice message by clicking the microphone button
- Recording shows time elapsed and waveform
- User can preview the recording before sending
- Voice message appears in conversation with play/pause and waveform
- Playback speed switching works (1x, 1.5x, 2x)
- Voice messages transmit via Blossom and are encrypted via NIP-17/59
- Offline recording queues for later sending
- Microphone permission denial handled gracefully
