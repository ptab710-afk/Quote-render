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

// Keep memory usage low on constrained free-tier hosting (e.g. Render's
// 512MB free instances): disable sharp's internal cache and limit it to
// one operation at a time instead of building up cached buffers.
sharp.cache(false);
sharp.concurrency(1);

const app = express();
app.use(express.json({ limit: "2mb" }));

// Only ever run one render job at a time. Running sharp + ffmpeg
// concurrently for multiple videos is what actually exceeds 512MB -
// this queue makes requests wait their turn instead of overlapping.
let queue = Promise.resolve();
function enqueue(job) {
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}

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

// --- Theme color palettes + pattern styles ------------------------------
const THEMES = {
  motivation: { c1: "#ff7e29", c2: "#ff4d6d", pattern: "diagonal" },
  bible: { c1: "#1e3c72", c2: "#2a5298", pattern: "dots" },
  quran: { c1: "#0f4d3c", c2: "#0a7a5c", pattern: "diamonds" },
  default: { c1: "#232526", c2: "#414345", pattern: "diagonal" }
};

function buildPatternShapes(pattern, color) {
  if (pattern === "diagonal") {
    let shapes = "";
    for (let x = -HEIGHT; x < WIDTH + HEIGHT; x += 90) {
      shapes += `<line x1="${x}" y1="0" x2="${x + HEIGHT}" y2="${HEIGHT}" stroke="${color}" stroke-width="18" stroke-opacity="0.12"/>`;
    }
    return shapes;
  }
  if (pattern === "dots") {
    let shapes = "";
    for (let y = 40; y < HEIGHT; y += 110) {
      for (let x = 40; x < WIDTH; x += 110) {
        shapes += `<circle cx="${x}" cy="${y}" r="7" fill="${color}" fill-opacity="0.16"/>`;
      }
    }
    return shapes;
  }
  if (pattern === "diamonds") {
    let shapes = "";
    const size = 100;
    for (let y = 0; y < HEIGHT + size; y += size) {
      for (let x = 0; x < WIDTH + size; x += size) {
        const offset = (Math.floor(y / size) % 2) * (size / 2);
        shapes += `<rect x="${x + offset}" y="${y}" width="${size * 0.55}" height="${size * 0.55}" fill="${color}" fill-opacity="0.14" transform="rotate(45 ${x + offset} ${y})"/>`;
      }
    }
    return shapes;
  }
  return "";
}

// --- Build the full SVG: generated background pattern + quote text -----
function buildFullSvg({ text, label, theme }) {
  const palette = THEMES[theme] || THEMES.default;
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
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.c1}"/>
        <stop offset="100%" stop-color="${palette.c2}"/>
      </linearGradient>
      <linearGradient id="darken" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="45%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    ${buildPatternShapes(palette.pattern, "#ffffff")}
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
//   text: string     -> the quote/verse text (required)
//   label: string    -> small caption, e.g. "Daily Motivation" (optional)
//   theme: string    -> "motivation" | "bible" | "quran" (controls generated
//                       background colors/pattern - no image needed)
//   audioUrl: string -> background music URL, mp3 (required)
//   durationSeconds: number -> video length, default 15
// }
app.post("/render", async (req, res) => {
  const jobId = crypto.randomBytes(6).toString("hex");
  const tmpDir = os.tmpdir();
  const framePath = path.join(tmpDir, `frame-${jobId}.png`);
  const audioPath = path.join(tmpDir, `audio-${jobId}.mp3`);
  const outputPath = path.join(tmpDir, `output-${jobId}.mp4`);

  function cleanup() {
    for (const p of [framePath, audioPath, outputPath]) {
      fs.unlink(p, () => {});
    }
  }

  await enqueue(async () => {
    try {
      const { text, label, theme, audioUrl, durationSeconds } = req.body;

      if (!text || !audioUrl) {
        res.status(400).json({ error: "text and audioUrl are required" });
        return;
      }

      const duration = Number(durationSeconds) || 15;

      // 1. Get the music track
      const audioBuffer = await downloadToBuffer(audioUrl);
      fs.writeFileSync(audioPath, audioBuffer);

      // 2. Generate the background pattern + text as a single frame
      const fullSvg = Buffer.from(buildFullSvg({ text, label, theme }));
      await sharp(fullSvg).png().toFile(framePath);

      // 3. Combine the still frame + audio into an mp4.
      // "ultrafast" preset + capped threads keeps encoder memory low,
      // which matters on a 512MB free-tier instance.
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(framePath)
          .loop(duration)
          .input(audioPath)
          .outputOptions([
            "-c:v libx264",
            "-preset ultrafast",
            "-threads 1",
            "-tune stillimage",
            "-c:a aac",
            "-b:a 128k",
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
      await new Promise((resolve) => {
        fs.createReadStream(outputPath)
          .pipe(res)
          .on("close", resolve)
          .on("finish", resolve);
      });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "render failed" });
      }
    } finally {
      cleanup();
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quote render service listening on ${PORT}`));
