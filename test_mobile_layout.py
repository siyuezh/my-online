import re
import unittest
from pathlib import Path


INDEX_HTML = Path(__file__).with_name("index.html").read_text(encoding="utf-8")


def extract_braced_block(source, opening_brace):
    depth = 0
    for index in range(opening_brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening_brace + 1:index], index
    raise ValueError("unclosed CSS block")


def extract_mobile_media_block(source):
    media_query = re.search(
        r"@media\s*\(\s*max-width\s*:\s*680px\s*\)\s*\{",
        source,
    )
    if media_query is None:
        raise ValueError("missing 680px mobile media query")
    block, _ = extract_braced_block(source, media_query.end() - 1)
    return block


def iter_css_rules(source):
    cursor = 0
    while True:
        opening_brace = source.find("{", cursor)
        if opening_brace == -1:
            return
        selectors = source[cursor:opening_brace].strip()
        body, closing_brace = extract_braced_block(source, opening_brace)
        yield selectors, body
        cursor = closing_brace + 1


def normalize_selector(selector):
    return re.sub(r"\s+", " ", selector.strip())


def find_rule(source, required_selectors):
    required = {normalize_selector(selector) for selector in required_selectors}
    for selector_source, body in iter_css_rules(source):
        selectors = {
            normalize_selector(selector)
            for selector in selector_source.split(",")
        }
        if required.issubset(selectors):
            return body
    return None


def parse_declarations(body):
    declarations = {}
    for declaration in body.split(";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        declarations[name.strip()] = re.sub(r"\s+", " ", value.strip())
    return declarations


class MobileLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mobile_css = extract_mobile_media_block(INDEX_HTML)

    def test_mobile_player_is_compact_notification(self):
        player_rule = find_rule(
            self.mobile_css,
            {".music-player", ".music-player.music-mini"},
        )
        self.assertIsNotNone(
            player_rule,
            "mobile CSS should style the full and mini player together",
        )
        player_declarations = parse_declarations(player_rule)
        expected_player_declarations = {
            "top": "94px !important",
            "right": "14px !important",
            "left": "auto !important",
            "width": "min(230px, calc(100vw - 28px)) !important",
            "height": "60px !important",
            "min-height": "60px !important",
            "padding": "6px 7px !important",
            "overflow": "hidden !important",
            "border-radius": "16px",
        }
        for name, value in expected_player_declarations.items():
            with self.subTest(player_declaration=name):
                self.assertEqual(player_declarations.get(name), value)

        mini_play_rule = find_rule(
            self.mobile_css,
            {
                ".music-player .music-mini-play",
                ".music-player.music-mini .music-mini-play",
            },
        )
        self.assertIsNotNone(
            mini_play_rule,
            "full and mini player states should share one mobile play rule",
        )
        mini_play_declarations = parse_declarations(mini_play_rule)
        expected_mini_play_declarations = {
            "display": "grid",
            "width": "44px",
            "height": "44px",
        }
        for name, value in expected_mini_play_declarations.items():
            with self.subTest(mini_play_declaration=name):
                self.assertEqual(mini_play_declarations.get(name), value)

        music_info_rule = find_rule(
            self.mobile_css,
            {
                ".music-player .music-info",
                ".music-player.music-mini .music-info",
            },
        )
        self.assertIsNotNone(
            music_info_rule,
            "full and mini player states should share one mobile info rule",
        )
        self.assertEqual(
            parse_declarations(music_info_rule).get("display"),
            "block",
        )

    def test_mobile_player_hides_full_controls(self):
        hidden_selectors = {
            ".music-player .music-heading",
            ".music-player .music-timeline",
            ".music-player .music-controls",
            ".music-player .music-lyrics",
            ".music-player .music-popover",
            ".music-player .music-volume-row",
            ".music-player .music-mini-restore",
        }
        hidden_rule = find_rule(self.mobile_css, hidden_selectors)
        self.assertIsNotNone(
            hidden_rule,
            "all full player controls should share one mobile hiding rule",
        )
        self.assertEqual(
            parse_declarations(hidden_rule).get("display"),
            "none !important",
        )

    def test_mobile_timeline_overrides_lane_columns(self):
        lane_rule = find_rule(
            self.mobile_css,
            {
                '.mission-row[data-lane="main"] .mission-card',
                '.mission-row[data-lane="side"] .mission-card',
            },
        )
        self.assertIsNotNone(
            lane_rule,
            "both timeline lanes should share one mobile override rule",
        )
        self.assertEqual(parse_declarations(lane_rule).get("grid-column"), "2")


if __name__ == "__main__":
    unittest.main()
