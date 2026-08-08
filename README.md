# Quote Render Service

Turns a quote/verse + a background image + a music track into a short
1080x1920 vertical mp4 video — ready for YouTube Shorts and TikTok.

## Deploy (free, no computer needed — works from your phone browser)

1. Create a free GitHub account (github.com) if you don't have one.
2. Create a new repository, e.g. "quote-render-service", and upload these
   three files: `server.js`, `package.json`, `README.md`.
3. Go to render.com → sign up free → New → Web Service → connect your
   GitHub repo.
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
5. Deploy. Render will give you a URL like:
   `https://quote-render-service-xxxx.onrender.com`

That URL is what you'll call from n8n.

## API

POST `/render`

```json
{
  "text": "Trust in the Lord with all your heart and lean not on your own understanding.",
  "label": "Proverbs 3:5",
  "backgroundImageUrl": "https://example.com/background.jpg",
  "audioUrl": "https://example.com/music.mp3",
  "durationSeconds": 15
}
```

Returns the rendered video as `video/mp4` binary data.

## Notes

- Free Render instances sleep after 15 minutes of inactivity — the first
  request after a while takes 30-60 seconds longer to "wake up." Fine for
  a once-a-day automation.
- `backgroundImageUrl` and `audioUrl` must be direct links to an image
  and an mp3 file (not a webpage).
