# Shorts Sound Blocker

A small Chrome extension that automatically skips YouTube Shorts that use sounds you've blocked.

## Install

1. Download `ytshortsblocker.zip` and extract it (or clone this repo and use the `ytshortsblocker` folder).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `ytshortsblocker` folder.
4. Reload any open YouTube tabs.

## Usage

- While watching a Short, click **🚫 Block this sound** under the sound name. The Short is skipped right away, and every future Short using that sound is skipped automatically.
- Click the button again (**✓ Blocked – undo**) to unblock the sound.
- The extension icon opens a popup where you can turn filtering on or off, see how many Shorts were skipped, remove blocked sounds, or add one manually by name or by a `…/source/…` link.
- Name entries match partially, so adding `don't stop the music` also blocks its slowed and sped-up versions.
- Shorts without a detected sound (for example ones that only show a source-video chip) have no button, since there is nothing to block.

## How it works

A content script reads the sound label of the active Short (using the sound page ID when available, otherwise the label text) and compares it to your blocklist, stored locally in `chrome.storage.local`. On a match it presses the "next Short" button. Nothing leaves your browser, and the only permission requested is `storage`.

## Limitations

YouTube changes its page structure from time to time, which can break sound detection. If the button stops showing up, open an issue and include the HTML of the sound chip (right-click it → Inspect → Copy → Copy outerHTML).
