{
  "name": "Daily Quote Videos - Stage 1 (Fetch + Render)",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 24
            }
          ]
        }
      },
      "id": "n1-trigger",
      "name": "Daily Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        -800,
        200
      ]
    },
    {
      "parameters": {
        "url": "https://zenquotes.io/api/random",
        "options": {}
      },
      "id": "n2-motivation-fetch",
      "name": "Get Motivation Quote",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -560,
        0
      ]
    },
    {
      "parameters": {
        "url": "https://bible-api.com/?random=verse",
        "options": {}
      },
      "id": "n3-bible-fetch",
      "name": "Get Bible Verse",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -560,
        200
      ]
    },
    {
      "parameters": {
        "jsCode": "// Quran has no built-in \"random verse\" endpoint, so we pick a random\n// ayah number ourselves (there are 6236 ayahs total in the Quran).\nconst ayahNumber = Math.floor(Math.random() * 6236) + 1;\nreturn [{ json: { ayahNumber } }];"
      },
      "id": "n4-quran-pick",
      "name": "Pick Random Ayah",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -560,
        400
      ]
    },
    {
      "parameters": {
        "url": "=https://api.alquran.cloud/v1/ayah/{{$json.ayahNumber}}/en.asad",
        "options": {}
      },
      "id": "n5-quran-fetch",
      "name": "Get Quran Verse",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -320,
        400
      ]
    },
    {
      "parameters": {
        "jsCode": "// \u2500\u2500 Replace these with your real \"raw\" GitHub URLs for your music files \u2500\u2500\nconst musicTracks = [\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track1.mp3\",\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track2.mp3\"\n];\n\nconst q = items[0].json[0] || items[0].json; // zenquotes returns an array\nconst text = q.q;\nconst author = q.a;\n\nreturn [{\n  json: {\n    type: \"Motivation\",\n    text,\n    label: `Daily Motivation \\u2014 ${author}`,\n    theme: \"motivation\",\n    audioUrl: musicTracks[Math.floor(Math.random() * musicTracks.length)],\n    durationSeconds: 15\n  }\n}];"
      },
      "id": "n6-motivation-format",
      "name": "Format Motivation",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -320,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "// \u2500\u2500 Replace these with your real \"raw\" GitHub URLs for your music files \u2500\u2500\nconst musicTracks = [\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track1.mp3\",\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track2.mp3\"\n];\n\nconst v = items[0].json;\n\nreturn [{\n  json: {\n    type: \"Bible\",\n    text: v.text ? v.text.trim() : v.verses[0].text,\n    label: v.reference,\n    theme: \"bible\",\n    audioUrl: musicTracks[Math.floor(Math.random() * musicTracks.length)],\n    durationSeconds: 15\n  }\n}];"
      },
      "id": "n7-bible-format",
      "name": "Format Bible",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -320,
        200
      ]
    },
    {
      "parameters": {
        "jsCode": "// \u2500\u2500 Replace these with your real \"raw\" GitHub URLs for your music files \u2500\u2500\nconst musicTracks = [\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track1.mp3\",\n  \"https://raw.githubusercontent.com/YOURUSERNAME/quote-post-assets/main/music/track2.mp3\"\n];\n\nconst a = items[0].json.data;\n\nreturn [{\n  json: {\n    type: \"Quran\",\n    text: a.text,\n    label: `Surah ${a.surah ? a.surah.englishName : \"\"} \\u2014 Ayah ${a.numberInSurah}`,\n    theme: \"quran\",\n    audioUrl: musicTracks[Math.floor(Math.random() * musicTracks.length)],\n    durationSeconds: 15\n  }\n}];"
      },
      "id": "n8-quran-format",
      "name": "Format Quran",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -80,
        400
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://quote-render-bduu.onrender.com/render",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { text: $json.text, label: $json.label, theme: $json.theme, audioUrl: $json.audioUrl, durationSeconds: $json.durationSeconds } }}",
        "options": {
          "response": {
            "response": {
              "responseFormat": "file"
            }
          }
        }
      },
      "id": "n9-render",
      "name": "Render Video",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        200,
        200
      ]
    }
  ],
  "connections": {
    "Daily Trigger": {
      "main": [
        [
          {
            "node": "Get Motivation Quote",
            "type": "main",
            "index": 0
          },
          {
            "node": "Get Bible Verse",
            "type": "main",
            "index": 0
          },
          {
            "node": "Pick Random Ayah",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Motivation Quote": {
      "main": [
        [
          {
            "node": "Format Motivation",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Bible Verse": {
      "main": [
        [
          {
            "node": "Format Bible",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Pick Random Ayah": {
      "main": [
        [
          {
            "node": "Get Quran Verse",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Quran Verse": {
      "main": [
        [
          {
            "node": "Format Quran",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Motivation": {
      "main": [
        [
          {
            "node": "Render Video",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Bible": {
      "main": [
        [
          {
            "node": "Render Video",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Quran": {
      "main": [
        [
          {
            "node": "Render Video",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "meta": {
    "instanceId": "daily-quote-videos"
  }
}
