const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.argv[3] || 8000;
const model_name = process.argv[2] ? `hi_IN-${process.argv[2]}-medium.onnx` : `hi_IN-pratham-medium.onnx`; // default to pratham if no model name is provided

app.use(cors());
app.use(express.json());


const PIPER_PATH = path.join(
  __dirname,
  "bin",
  "piper",
  process.platform === "win32" ? "piper.exe" : "piper",
);

const MODEL_PATH = path.join(
  __dirname,
  "models",
  model_name, // rohan (voice type: Male, S: 1.2, P: 0.1) | pratham (voice type: Male, S: 1.2, P: 0.1) | priyamvada (voice type: Female, S: 1.3, P: 0.65)
);

let piperProcess = null;
let piperReady = false;
let readyPromise = null;
const requestQueue = [];
let processing = false;

function ensurePiperProcess() {
  if (piperProcess && !piperProcess.killed) {
    return readyPromise;
  }

  piperReady = false;

  const piperArgs = ["--model", MODEL_PATH, "--output_raw", "--json-input", "--debug"];

  console.log("[Piper Pool] Launching persistent piper process...");
  piperProcess = spawn(PIPER_PATH, piperArgs);

  readyPromise = new Promise((resolve) => {
    const onStderr = (data) => {
      const msg = data.toString();
      if (!piperReady && msg.includes("Initialized piper")) {
        piperReady = true;
        console.log("[Piper Pool] Model loaded & ready (warm).");
        resolve();
      }
    };
    piperProcess.stderr.on("data", onStderr);
  });

  piperProcess.on("close", (code, signal) => {
    console.log(
      `[Piper Pool] Process exited. Code: ${code}, Signal: ${signal}`,
    );
    piperProcess = null;
    piperReady = false;
    readyPromise = null;
  });

  piperProcess.on("error", (err) => {
    console.error("[Piper Pool] Spawn error:", err.message);
    piperProcess = null;
    piperReady = false;
    readyPromise = null;
  });

  return readyPromise;
}

function processQueue() {
  if (processing || requestQueue.length === 0) return;
  processing = true;

  const { text, speed, pitch, res, resolve, reject } = requestQueue.shift();
  handleSynthesis(text, speed, pitch, res)
    .then(resolve)
    .catch(reject)
    .finally(() => {
      processing = false;
      processQueue();
    });
}

function handleSynthesis(text, speed, pitch, res) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensurePiperProcess();
    } catch (err) {
      reject(err);
      return;
    }

    if (!piperProcess || piperProcess.killed) {
      reject(new Error("Piper process is not available"));
      return;
    }

    // JSON input line with per-request speed/pitch overrides
    const jsonInput = { text };
    if (speed) {
      jsonInput.length_scale = parseFloat((1 / parseFloat(speed)).toFixed(2));
    }
    if (pitch) {
      jsonInput.noise_scale = parseFloat(parseFloat(pitch).toFixed(3));
    }

    let receivedBytes = 0;
    let finished = false;
    let clientAborted = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      piperProcess.stdout.removeListener("data", onStdoutData);
      piperProcess.stderr.removeListener("data", onStderrData);
      if (!res.destroyed) {
        res.end();
      }
      console.log(`[Piper] Response sent. ${receivedBytes} bytes streamed.`);
      resolve();
    };

    // Track if client disconnects early
    res.on("close", () => {
      clientAborted = true;
    });

    const onStdoutData = (chunk) => {
      receivedBytes += chunk.length;
      if (!clientAborted && !res.destroyed) {
        res.write(chunk);
      }
    };

    const onStderrData = (data) => {
      const msg = data.toString();

      // "Real-time factor" is printed once per input line, AFTER all audio
      // has been written to stdout by Piper. A short drain lets any
      // remaining buffered stdout chunks arrive in Node before we cleanup.
      if (msg.includes("Real-time factor")) {
        setTimeout(cleanup, 50);
      }
    };

    piperProcess.stdout.on("data", onStdoutData);
    piperProcess.stderr.on("data", onStderrData);

    const jsonLine = JSON.stringify(jsonInput) + "\n";
    console.log(
      `[Stream] Synthesizing: "${text.substring(0, 40)}..." speed=${speed || "default"} pitch=${pitch || "default"}`,
    );
    piperProcess.stdin.write(jsonLine, "utf-8");

    // Safety timeout: if we haven't finished in 30s, something went wrong
    setTimeout(() => {
      if (!finished) {
        console.error("[Piper] Synthesis timeout — forcing cleanup");
        cleanup();
      }
    }, 30000);
  });
}

app.post("/api/tts-stream", (req, res) => {
  const { text, speed, pitch } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text parameter is required." });
  }

  res.writeHead(200, {
    "Content-Type": "audio/pcm",
    "Transfer-Encoding": "chunked",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });

  // Request queue
  new Promise((resolve, reject) => {
    requestQueue.push({ text, speed, pitch, res, resolve, reject });
    processQueue();
  }).catch((err) => {
    console.error("[Stream Error]:", err.message);
    if (!res.destroyed) {
      res.end();
    }
  });
});

app.post('/api/tts', (req, res) => {
    const { text, speed, pitch } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text parameter is required.' });
    }

    console.log(`Generating TTS | Speed: ${speed || 1} | Pitch: ${pitch || 0.667}`);

    const piperArgs = [
        '--model', MODEL_PATH,
        '--output-raw'
    ];

    if (speed) {
        const lengthScale = (1 / parseFloat(speed)).toFixed(2);
        piperArgs.push('--length-scale', lengthScale);
    }

    if (pitch) {
        piperArgs.push('--noise-scale', parseFloat(pitch).toFixed(3));
    }

    const piperProcess = spawn(PIPER_PATH, piperArgs);
    let audioChunks = [];
    let errorOutput = '';

    piperProcess.stdin.write(text);
    piperProcess.stdin.end();

    piperProcess.stdout.on('data', (chunk) => {
        audioChunks.push(chunk);
    });

    piperProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    piperProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Piper error: ${errorOutput}`);
            return res.status(500).json({ error: 'Failed to generate speech.' });
        }

        const rawBuffer = Buffer.concat(audioChunks);
        const wavBuffer = addWavHeader(rawBuffer, 22050, 16, 1);

        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': wavBuffer.length
        });
        res.send(wavBuffer);
    });
});

function addWavHeader(pcmBuffer, sampleRate, bitsPerSample, channels) {
    const header = Buffer.alloc(44);
    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([header, pcmBuffer]);
}

app.listen(PORT, async () => {
  console.log(`Streaming Piper TTS server running on http://localhost:${PORT}`);
  console.log("[Piper Pool] Pre-warming model...");
  await ensurePiperProcess();
  console.log("[Piper Pool] Server ready — zero cold start for requests!");

  // Test the /api/tts-stream endpoint after the server starts
  const res = await fetch("http://localhost:8000/api/tts-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "सुप्रभात!" })
  });

  if (res.ok) {
    console.log("[Test] `/api/tts-stream` endpoint initial check completed successfully.");
  } else {
    console.error("[Test] `/api/tts-stream` endpoint is not working.");
  }
});

process.on("SIGINT", () => {
  console.log("\n[Shutdown] Cleaning up piper process...");
  if (piperProcess && !piperProcess.killed) {
    piperProcess.stdin.end();
    piperProcess.kill("SIGTERM");
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (piperProcess && !piperProcess.killed) {
    piperProcess.stdin.end();
    piperProcess.kill("SIGTERM");
  }
  process.exit(0);
});
