const express = require("express");
const axios = require("axios");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json({ limit: "2mb" }));

const WIDTH = 1080;
const HEIGHT = 1920;

// --- Simple word-wrap for the quote text ------------------------------
function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- Build an SVG overlay with the wrapped quote + label ---------------
function buildOverlaySvg({ text, label }) {
  const fontSize = 58;
  const lineHeight = fontSize * 1.4;
  const maxCharsPerLine = 24;
  const lines = wrapText(text, maxCharsPerLine);

  const totalTextHeight = lines.length * lineHeight;
  const startY = HEIGHT / 2 - totalTextHeight / 2;

  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="50%" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">${escapeXml(
        line
      )}</text>`;
    })
    .join("\n");

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="darken" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.25"/>
        <stop offset="45%" stop-color="#000000" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#darken)"/>
    ${tspans}
    <text x="50%" y="${HEIGHT - 90}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="40" fill="#f2f2f2" stroke="#000000" stroke-width="1.5" paint-order="stroke">${escapeXml(
    label || ""
  )}</text>
  </svg>`;
}

async function downloadToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  return Buffer.from(res.data);
}

app.get("/", (req, res) => {
  res.send("Quote render service is running.");
});

// POST /render
// body: {
//   text: string            -> the quote/verse text (required)
//   label: string           -> small caption, e.g. "Daily Motivation" (optional)
//   backgroundImageUrl: str -> background photo URL (required)
//   audioUrl: string        -> background music URL, mp3 (required)
//   durationSeconds: number -> video length, default 15
// }
app.post("/render", async (req, res) => {
  const jobId = crypto.randomBytes(6).toString("hex");
  const tmpDir = os.tmpdir();
  const framePath = path.join(tmpDir, `frame-${jobId}.png`);
  const audioPath = path.join(tmpDir, `audio-${jobId}.mp3`);
  const outputPath = path.join(tmpDir, `output-${jobId}.mp4`);

  try {
    const {
      text,
      label,
      backgroundImageUrl,
      audioUrl,
      durationSeconds
    } = req.body;

    if (!text || !backgroundImageUrl || !audioUrl) {
      return res
        .status(400)
        .json({ error: "text, backgroundImageUrl, and audioUrl are required" });
    }

    const duration = Number(durationSeconds) || 15;

    // 1. Get background image and audio
    const [bgBuffer, audioBuffer] = await Promise.all([
      downloadToBuffer(backgroundImageUrl),
      downloadToBuffer(audioUrl)
    ]);
    fs.writeFileSync(audioPath, audioBuffer);

    // 2. Compose background + text overlay into a single frame
    const overlaySvg = Buffer.from(buildOverlaySvg({ text, label }));

    await sharp(bgBuffer)
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
      .composite([{ input: overlaySvg, top: 0, left: 0 }])
      .png()
      .toFile(framePath);

    // 3. Combine the still frame + audio into an mp4
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(framePath)
        .loop(duration)
        .input(audioPath)
        .outputOptions([
          "-c:v libx264",
          "-tune stillimage",
          "-c:a aac",
          "-b:a 192k",
          "-pix_fmt yuv420p",
          `-t ${duration}`,
          "-shortest",
          "-vf scale=" + WIDTH + ":" + HEIGHT
        ])
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject);
    });

    res.setHeader("Content-Type", "video/mp4");
    fs.createReadStream(outputPath).pipe(res).on("close", cleanup);
  } catch (err) {
    console.error(err);
    cleanup();
    res.status(500).json({ error: err.message || "render failed" });
  }

  function cleanup() {
    for (const p of [framePath, audioPath, outputPath]) {
      fs.unlink(p, () => {});
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quote render service listening on ${PORT}`));
