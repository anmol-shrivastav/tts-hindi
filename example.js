const fs = require("fs");
const path = require("path");

const text = process.argv[2] || "नमस्ते! यह हिंदी टेक्ट-टू-स्पीच उदाहरण है।";
const baseUrl = process.argv[3] || "http://localhost:8000";
const mode = (process.argv[4] || "wav").toLowerCase();

async function generateWav() {
  const response = await fetch(`${baseUrl}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed: 1.0, pitch: 0.667 }),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(__dirname, "output.wav");
  fs.writeFileSync(outputPath, buffer);
  console.log(`Saved WAV audio to ${outputPath}`);
}

async function generateStream() {
  const response = await fetch(`${baseUrl}/api/tts-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed: 1.2, pitch: 0.1 }),
  });

  if (!response.ok) {
    throw new Error(`Streaming request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  const outputPath = path.join(__dirname, "output.pcm");
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  console.log(`Saved PCM stream to ${outputPath}`);
}

(async () => {
  try {
    if (mode === "stream") {
      await generateStream();
    } else {
      await generateWav();
    }
  } catch (error) {
    console.error("Example failed:", error.message);
    console.log("Make sure the server is running first, for example:");
    console.log("node server.js pratham 8000");
  }
})();
