import re
import unittest
from pathlib import Path


INDEX_HTML = Path(__file__).with_name("index.html").read_text(encoding="utf-8")


def extract_style_block(source):
    style_opening = re.search(r"<style(?:\s[^>]*)?>", source)
    if style_opening is None:
        raise ValueError("missing style block")
    style_closing = source.find("</style>", style_opening.end())
    if style_closing == -1:
        raise ValueError("unclosed style block")
    return source[style_opening.end():style_closing]


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


def find_exact_rule(source, required_selectors):
    required = {normalize_selector(selector) for selector in required_selectors}
    for selector_source, body in iter_css_rules(source):
        selectors = {
            normalize_selector(selector)
            for selector in selector_source.split(",")
        }
        if selectors == required:
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


def extract_js_function(source, name):
    function_match = re.search(
        rf"function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{",
        source,
    )
    if function_match is None:
        return None
    body, _ = extract_braced_block(source, function_match.end() - 1)
    return body


def extract_event_listener(source, event_name):
    listener_match = re.search(
        rf"window\.addEventListener\(\s*['\"]{re.escape(event_name)}['\"]\s*,\s*\(\)\s*=>\s*\{{",
        source,
    )
    if listener_match is None:
        return None
    body, _ = extract_braced_block(source, listener_match.end() - 1)
    return body


class MobileLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stylesheet_css = extract_style_block(INDEX_HTML)
        cls.mobile_css = extract_mobile_media_block(cls.stylesheet_css)

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

    def test_mobile_player_does_not_overwrite_desktop_position(self):
        layout_helper = extract_js_function(
            INDEX_HTML,
            "isMobileMusicPlayerLayout",
        )
        self.assertIsNotNone(layout_helper)
        self.assertRegex(
            layout_helper,
            r"window\.matchMedia\(\s*['\"]\(max-width:\s*680px\)['\"]\s*\)\.matches",
        )

        save_body = extract_js_function(INDEX_HTML, "saveMusicPlayerState")
        self.assertIsNotNone(save_body)
        self.assertIn("const nextState = {", save_body)
        for state_name in (
            "mini",
            "lyricsCollapsed",
            "trackId",
            "volume",
            "muted",
            "loop",
        ):
            with self.subTest(saved_state=state_name):
                self.assertRegex(save_body, rf"\b{state_name}\s*:")
        self.assertRegex(
            save_body,
            r"if\s*\(\s*!isMobileMusicPlayerLayout\(\)\s*\)\s*\{[\s\S]*?nextState\.left\s*=[\s\S]*?nextState\.top\s*=",
        )
        self.assertRegex(
            save_body,
            r"let previousState\s*=\s*\{\s*\}\s*;\s*try\s*\{[\s\S]*?previousState\s*=\s*JSON\.parse\(localStorage\.getItem\(MUSIC_PLAYER_STATE_KEY\)[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{\s*previousState\s*=\s*\{\s*\}\s*;\s*\}",
        )
        self.assertRegex(
            save_body,
            r"try\s*\{\s*localStorage\.setItem\(MUSIC_PLAYER_STATE_KEY\s*,\s*JSON\.stringify\(\s*\{\s*\.\.\.previousState\s*,\s*\.\.\.nextState\s*\}\s*\)\s*\)\s*;\s*\}\s*catch",
        )

        resize_body = extract_event_listener(INDEX_HTML, "resize")
        self.assertIsNotNone(resize_body)
        self.assertRegex(
            resize_body,
            r"^\s*if\s*\(\s*isMobileMusicPlayerLayout\(\)\s*\)\s*return\s*;",
        )

    def test_mobile_timeline_overrides_lane_columns(self):
        row_rule = find_rule(self.mobile_css, {".mission-row"})
        self.assertIsNotNone(row_rule, "the timeline row should have a mobile rule")
        row_declarations = parse_declarations(row_rule)
        self.assertEqual(row_declarations.get("display"), "grid")
        self.assertEqual(
            row_declarations.get("grid-template-columns"),
            "32px 1fr",
        )

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
        lane_declarations = parse_declarations(lane_rule)
        self.assertEqual(lane_declarations.get("grid-column"), "2")
        self.assertEqual(lane_declarations.get("grid-row"), "1")
        self.assertEqual(lane_declarations.get("width"), "100%")
        self.assertEqual(lane_declarations.get("margin"), "8px 0")

        dot_rule = find_rule(self.mobile_css, {".mission-row .mission-dot"})
        self.assertIsNotNone(
            dot_rule,
            "the timeline dot should use a specific mobile override rule",
        )
        dot_declarations = parse_declarations(dot_rule)
        self.assertEqual(dot_declarations.get("grid-column"), "1")
        self.assertEqual(dot_declarations.get("grid-row"), "1")

        desktop_lanes = (
            ('.mission-row[data-lane="main"] .mission-card', "1"),
            ('.mission-row[data-lane="side"] .mission-card', "3"),
        )
        for selector, column in desktop_lanes:
            with self.subTest(desktop_lane=selector):
                desktop_rule = find_rule(self.stylesheet_css, {selector})
                self.assertIsNotNone(desktop_rule)
                desktop_declarations = parse_declarations(desktop_rule)
                self.assertEqual(desktop_declarations.get("grid-column"), column)

        mobile_shadows = (
            ('.mission-row[data-lane="main"] .mission-card', "var(--blue)"),
            ('.mission-row[data-lane="side"] .mission-card', "var(--pink)"),
        )
        for selector, color in mobile_shadows:
            with self.subTest(mobile_shadow=selector):
                shadow_rule = find_exact_rule(self.mobile_css, {selector})
                self.assertIsNotNone(shadow_rule)
                self.assertEqual(
                    parse_declarations(shadow_rule).get("box-shadow"),
                    f"4px 4px 0 {color}",
                )


if __name__ == "__main__":
    unittest.main()
