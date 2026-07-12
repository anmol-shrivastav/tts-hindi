# Hindi Piper TTS Server

A lightweight Node.js Text-to-Speech application for Hindi using Piper and ONNX voice models from rhasspy/piper-voices.

This project provides a simple Express server with both standard and streaming TTS endpoints, along with browser-based demo pages for testing speech generation quickly.

## Features

- Fast local Hindi speech synthesis
- Standard WAV output for simple playback
- Streaming PCM output for real-time audio playback
- Support for multiple Hindi voices
- Easy integration with web apps or custom scripts

## Supported Voices

The project currently includes these Hindi voice models:

- Rohan — natural male voice
- Pratham — assistant male voice
- Priyamvada — assistant female voice

You can add more voices from the Piper voice repository on Hugging Face:
https://huggingface.co/rhasspy/piper-voices/tree/main

## Requirements

Before running the project, make sure you have:

- Node.js 18 or newer
- Piper binary for your operating system (Windows, macOS, or Linux)
- ONNX voice model files placed under the models folder

## Project Structure

- server.js — Express API server with TTS routes
- tts.html — basic demo page for regular WAV generation
- tts_stream.html — demo page for streaming PCM playback
- models/ — ONNX voice model files
- bin/piper/ — Piper executable

## Installation

1. Install dependencies:

```bash
npm install
```

2. Make sure the Piper executable is available in the project folder:

- Windows: bin/piper/piper.exe
- macOS/Linux: bin/piper/piper

3. Make sure the required ONNX voice model files are present in the models directory.

## Running the Server

Start the server with a voice model name and optional port:

```bash
node server.js pratham 8000
```

Examples:

```bash
node server.js rohan 8000
node server.js pratham 8000
node server.js priyamvada 8000
```

If no model name is provided, the server defaults to:

```bash
hi_IN-pratham-medium.onnx
```

## API Endpoints

### 1) Standard TTS

Endpoint:

```http
POST /api/tts
```

Request body:

```json
{
  "text": "नमस्ते दुनिया",
  "speed": 1.0,
  "pitch": 0.667
}
```

Response:

- Audio content type: audio/wav

### 2) Streaming TTS

Endpoint:

```http
POST /api/tts-stream
```

Request body:

```json
{
  "text": "नमस्ते दुनिया",
  "speed": 1.2,
  "pitch": 0.1
}
```

Response:

- Audio content type: audio/pcm
- Chunked streaming response

## Demo Pages

Open the demo HTML files directly in your browser:

- tts.html — for regular generated speech playback
- tts_stream.html — for streamed playback with real-time audio

Make sure the server is running on port 8000 before using them.

## Example Usage

A sample script is included at example.js to generate speech from the command line.

```bash
node example.js "नमस्ते दुनिया"
```

This writes an audio file named output.wav in the project root.

## Notes

- The project is designed for lightweight, local Hindi TTS workflows.
- It is ideal for demos, prototypes, web apps, and simple voice assistant features.
- Additional voice models can be added by placing the corresponding ONNX files into the models folder and updating the voice selection.

## License

This project is distributed under the MIT License.
