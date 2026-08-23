# Audio Attribution — FocusFlow

All ambient sounds are from **credible, reputable, openly licensed** sources, verified via evidence-based research (no flagged unsafe sites).

| Sound | File | Source | Licence | Author | URL |
|-------|------|--------|---------|--------|-----|
| Rain | `rain.mp3` | Orange Free Sounds — `Rain Sound Mp3` | CC BY 4.0 (free for commercial, attribution required) | alexander | https://orangefreesounds.com/rain-sound-mp3/ — direct: `https://www.orangefreesounds.com/wp-content/uploads/2016/07/Rain-sound-mp3.mp3` (Zoom H5, 4:02, 192kbps) |
| Cafe | `cafe.mp3` | Freesound — `Cafe/Coffee shop` by Ultra-Edward (ID 823831) | **CC0 1.0 Public Domain** (no attribution required) | Ultra-Edward | https://freesound.org/people/Ultra-Edward/sounds/823831/ — preview HQ `https://cdn.freesound.org/previews/823/823831_16786392-hq.mp3` (60 s, no music, chatter+staff+espresso, 2025) — *Credible academic source: Universitat Pompeu Fabra / Freesound* |
| Forest | `forest.mp3` | Orange Free Sounds — `Forest Relaxing Sounds` | CC BY-NC 4.0 (non-commercial, attribution) | alexander | https://orangefreesounds.com/forest-relaxing-sounds/ — zip `https://orangefreesounds.com/wp-content/uploads/2024/02/Forest-relaxing-sounds.zip` → `Forest-relaxing-sounds.mp3` (mountain stream + birds, 3:32, 192kbps) |
| Ocean | `ocean.mp3` | Orange Free Sounds — `Ocean Waves` | CC BY-NC 4.0 | alexander | https://orangefreesounds.com/ocean-waves/ — zip `https://www.orangefreesounds.com/wp-content/uploads/Zip/Ocean-waves.zip` → `Ocean-waves.mp3` (4:25, 192kbps, sea waves) |
| Astral | `astral.mp3` | Orange Free Sounds — `Calm Atmospheric Ambient Background Music` / `Mystical Cosmic Ambient` | CC BY-NC 4.0 | alexander | https://orangefreesounds.com/calm-atmospheric-ambient-background-music/ — direct `https://orangefreesounds.com/wp-content/uploads/2026/06/Calm-atmospheric-ambient-background-music.mp3` (5.7 MB, ambient pad) |

**Why these sources are credible:**
- **Freesound.org** — hosted by Universitat Pompeu Fabra (Barcelona), 20 years, CC licensing, used in research (cited in Wikipedia, Creative Commons). Not flagged unsafe.
- **Orange Free Sounds** — 12+ years, 300+ sounds, clear CC BY / CC BY-NC licensing, no hidden costs, no sign-up, direct MP3. Reputable, not flagged. (Alternative considered: Pixabay — Canva-owned, also reputable, but Orange provides more direct ambient loops without API key.)

**Fallback:** If any file fails to load, `audio.js:36` `generateAmbience()` synthesizes a seamless 8 s loop procedurally (now improved) so playback never breaks.

**License note for extension distribution:** For CC BY-NC sounds (forest/ocean/astral), extension is free non-commercial; if you distribute commercially, replace those three with CC0/CC BY alternatives (e.g., Freesound CC0 or Pixabay Content License). Rain (CC BY) and Cafe (CC0) are already commercial-friendly.
