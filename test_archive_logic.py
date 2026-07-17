import unittest
from unittest.mock import patch

from dev_server import editor_auth_configured, is_valid_image_data, normalize_archive_document, verify_editor_password


class ArchiveDocumentTests(unittest.TestCase):
    def test_normalizes_tags_and_content(self):
        document = normalize_archive_document({
            "date": "2026-07-17",
            "title": " 一篇日记 ",
            "category": "daily",
            "tags": ["#生活", "生活", "灵感"],
            "summary": " 摘要 ",
            "content": " 正文 ",
            "images": ["assets/archive/photo-1.webp", "assets/archive/photo-1.webp"],
        })
        self.assertEqual(document["title"], "一篇日记")
        self.assertEqual(document["tags"], ["生活", "灵感"])
        self.assertEqual(document["content"], "正文")
        self.assertEqual(document["images"], ["assets/archive/photo-1.webp"])

    def test_rejects_invalid_date(self):
        with self.assertRaises(ValueError):
            normalize_archive_document({"date": "2026-02-30", "title": "错误日期", "category": "daily"})

    def test_rejects_external_archive_images(self):
        with self.assertRaises(ValueError):
            normalize_archive_document({
                "date": "2026-07-17",
                "title": "外部图片",
                "category": "daily",
                "images": ["https://example.com/photo.jpg"],
            })

    def test_checks_image_signatures(self):
        self.assertTrue(is_valid_image_data("image/png", b"\x89PNG\r\n\x1a\nrest"))
        self.assertFalse(is_valid_image_data("image/png", b"not-an-image"))

    @patch.dict("os.environ", {"YEZI_EDITOR_PASSWORD": "cloud-secret"})
    def test_uses_deployment_password(self):
        self.assertTrue(editor_auth_configured())
        self.assertTrue(verify_editor_password("cloud-secret"))
        self.assertFalse(verify_editor_password("wrong-secret"))


if __name__ == "__main__":
    unittest.main()
