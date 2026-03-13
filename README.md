# Sport Analyst

Interactive video analysis tool for coaches and sport analysts.
Draw annotations directly on video, manage sessions, and export JSON + screenshots.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000

## Features

### Video Player
- Load local video files (MP4, MOV, AVI, WebM, MKV)
- Playback speed: 0.25x / 0.5x / 1x / 1.5x / 2x
- Frame-by-frame stepping
- Seekbar with annotation markers

### Annotation Tools
| Tool | Key | Description |
|------|-----|-------------|
| Select | V | Select and move objects |
| Arrow | A | Draw tactical arrows |
| Circle | C | Highlight zones |
| Rectangle | R | Mark areas |
| Freehand | P | Free drawing (telestrator) |
| Text | T | Add text labels |
| Spotlight | Z | Add a focus highlight |

### Keyboard Shortcuts
- `Space` - play/pause
- `Left` / `Right` - seek +/- 5 seconds
- `Shift+Left` / `Shift+Right` - frame step
- `V A C R P T` - switch tools
- `Delete` / `Backspace` - delete selected object

### Sessions
- Sessions are auto-saved to localStorage
- Each annotation stores timestamp, tool, color, and Fabric.js JSON
- Annotation list supports quick jump and label editing

### Export
- JSON + screenshots: exports full session data plus JPEG screenshots
- JSON only: exports raw annotation data for external processing

## Project Structure

```
src/
  components/
    Toolbar.tsx
    VideoControls.tsx
    AnnotationPanel.tsx
    Timeline.tsx
    ExportPanel.tsx
    VideoDropzone.tsx
  hooks/
    useFabricCanvas.ts
    useVideoPlayer.ts
  utils/
    storage.ts
    export.ts
  types/
    index.ts
  App.tsx
  App.css
```

## Export Format (Example)

```json
{
  "session": {
    "id": "session_1234567890",
    "name": "Analisi 13/03/2026 - match.mp4",
    "videoName": "match.mp4",
    "videoDuration": 90.5
  },
  "annotations": [
    {
      "id": "ann_1234567890",
      "timestamp": 12.5,
      "duration": 4,
      "label": "Pressing alto",
      "toolType": "arrow",
      "color": "#FF3B3B",
      "fabricData": "{ ... Fabric.js JSON ... }"
    }
  ],
  "keyFrames": [
    {
      "timestamp": 12.5,
      "label": "Pressing alto",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ],
  "exportedAt": 1710000000000,
  "version": "1.0.0"
}
```

## Tech Stack
- React 18 + TypeScript
- Fabric.js
- CRA (react-scripts)

## Notes
- Data is stored locally in the browser (localStorage).
- Clearing the session removes annotations and timeline markers.

## Roadmap
- Burn annotations into exported MP4 (FFmpeg)
- Multi-session management
- Animated telestration
- Export zoom/pan
- Collaboration via WebSocket
- Player tracking (MediaPipe)
