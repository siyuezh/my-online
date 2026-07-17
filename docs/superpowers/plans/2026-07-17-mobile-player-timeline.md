# Mobile Player and Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile music player a compact playback notification and make all mobile timeline cards use a readable single-column layout without changing desktop behavior.

**Architecture:** Keep the existing HTML and JavaScript playback logic. Add narrowly scoped rules inside the existing `@media (max-width: 680px)` block, using `!important` only where inline saved player coordinates or existing mini-player rules must be overridden. Add source-level regression tests because this static site has no frontend test runner.

**Tech Stack:** Static HTML, CSS media queries, vanilla JavaScript, Python `unittest`.

---

### Task 1: Add failing mobile layout regression tests

**Files:**
- Create: `test_mobile_layout.py`
- Test: `test_mobile_layout.py`

- [ ] **Step 1: Write the failing tests**

```python
import re
import unittest
from pathlib import Path


INDEX_HTML = Path(__file__).with_name("index.html")


class MobileLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = INDEX_HTML.read_text(encoding="utf-8")

    def test_mobile_player_is_compact_notification(self):
        self.assertIn(".music-player, .music-player.music-mini", self.source)
        self.assertIn("width: min(230px, calc(100vw - 28px)) !important;", self.source)
        self.assertIn("height: 60px !important;", self.source)
        self.assertIn(".music-player .music-mini-play", self.source)
        self.assertIn("width: 44px;", self.source)
        self.assertIn("height: 44px;", self.source)

    def test_mobile_player_hides_full_controls(self):
        hidden_controls = re.search(
            r"\.music-player \.music-heading,.*?\.music-player \.music-mini-restore\s*\{\s*display: none !important;",
            self.source,
            re.S,
        )
        self.assertIsNotNone(hidden_controls)

    def test_mobile_timeline_overrides_lane_columns(self):
        selector = (
            '.mission-row[data-lane="main"] .mission-card,\n'
            '      .mission-row[data-lane="side"] .mission-card'
        )
        self.assertIn(selector, self.source)
        self.assertRegex(
            self.source,
            r'\.mission-row\[data-lane="side"\] \.mission-card\s*\{[^}]*grid-column: 2;',
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `python -m unittest test_mobile_layout.py -v`

Expected: three failures because the compact notification and lane-specific mobile overrides are not present.

- [ ] **Step 3: Commit the failing tests**

```text
git add test_mobile_layout.py
git commit -m "test: cover mobile player and timeline layout"
```

### Task 2: Implement the compact mobile playback notification

**Files:**
- Modify: `index.html` inside `@media (max-width: 680px)`
- Test: `test_mobile_layout.py`

- [ ] **Step 1: Replace the existing mobile `.music-player` rule with the compact container**

```css
.music-player,
.music-player.music-mini {
  top: 94px !important;
  right: 14px !important;
  left: auto !important;
  width: min(230px, calc(100vw - 28px)) !important;
  height: 60px !important;
  min-height: 60px !important;
  padding: 6px 7px !important;
  overflow: hidden !important;
  border-radius: 16px;
}
```

- [ ] **Step 2: Hide desktop-only controls and expose the existing mini play button**

```css
.music-player .music-heading,
.music-player .music-timeline,
.music-player .music-controls,
.music-player .music-lyrics,
.music-player .music-popover,
.music-player .music-volume-row,
.music-player .music-mini-restore {
  display: none !important;
}
.music-player .music-track,
.music-player.music-mini .music-track {
  width: 100%;
  height: 46px;
  padding-right: 48px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 9px;
}
.music-player .music-cover,
.music-player.music-mini .music-cover {
  width: 44px;
  height: 44px;
  box-shadow: 2px 2px 0 var(--ink);
}
.music-player .music-info,
.music-player.music-mini .music-info {
  display: block;
}
.music-player .music-artist { display: none; }
.music-player .music-mini-play,
.music-player.music-mini .music-mini-play {
  position: absolute;
  top: 7px;
  right: 7px;
  bottom: auto;
  left: auto;
  inset: auto 7px auto auto;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 2px solid var(--ink);
  border-radius: 50%;
  color: var(--white);
  background: var(--pink);
  box-shadow: 2px 2px 0 var(--ink);
}
```

- [ ] **Step 3: Run the focused tests**

Run: `python -m unittest test_mobile_layout.py -v`

Expected: player tests pass; timeline test still fails.

- [ ] **Step 4: Commit the mobile player change**

```text
git add index.html
git commit -m "fix: simplify mobile music player"
```

### Task 3: Fix the mobile timeline card columns

**Files:**
- Modify: `index.html` inside `@media (max-width: 680px)`
- Test: `test_mobile_layout.py`

- [ ] **Step 1: Replace the low-specificity timeline card rule**

```css
.mission-row[data-lane="main"] .mission-card,
.mission-row[data-lane="side"] .mission-card {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  margin: 8px 0;
}
```

- [ ] **Step 2: Run the focused tests and verify GREEN**

Run: `python -m unittest test_mobile_layout.py -v`

Expected: all three tests pass.

- [ ] **Step 3: Run the complete Python test suite**

Run: `python -m unittest discover -v`

Expected: all tests pass with no errors.

- [ ] **Step 4: Commit the timeline fix**

```text
git add index.html
git commit -m "fix: widen mobile timeline cards"
```

### Task 4: Verify responsive behavior in the browser

**Files:**
- Verify: `index.html`

- [ ] **Step 1: Start the local preview**

Run: `python dev_server.py`

Expected: preview available at `http://127.0.0.1:4173/index.html`.

- [ ] **Step 2: Verify at 320px and 390px widths**

Confirm at both sizes:

- The player starts below the navigation and does not cover the menu button.
- Only the cover, title/status, and 44px play/pause button are visible.
- All six visible timeline cards occupy the second grid column at readable widths.
- `document.documentElement.scrollWidth` does not exceed `document.documentElement.clientWidth` because of the player or timeline.

- [ ] **Step 3: Verify desktop behavior at 1280px**

Confirm:

- Full music controls, lyrics, progress, playlist, and drag handle remain available.
- The timeline remains a two-sided desktop layout.

- [ ] **Step 4: Review the final diff**

Run: `git diff HEAD~2 -- index.html test_mobile_layout.py`

Expected: changes are limited to the mobile media query and the new regression test.
