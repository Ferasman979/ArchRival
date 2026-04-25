"""
services/vision_service.py
Sends a screenshot to GCP Vision DOCUMENT_TEXT_DETECTION.
Only called when diff_engine detects changes.
Returns enriched label data to validate/supplement the XML parser.
"""

import base64
import os
from google.cloud import vision
from typing import Optional


_client: Optional[vision.ImageAnnotatorClient] = None


def _get_client() -> vision.ImageAnnotatorClient:
    """Lazy-initialize the Vision client (reuse across requests)."""
    global _client
    if _client is None:
        _client = vision.ImageAnnotatorClient()
    return _client


def extract_labels_from_screenshot(image_bytes: bytes) -> list[str]:
    """
    Send a screenshot to GCP Vision DOCUMENT_TEXT_DETECTION.
    Returns a list of detected text strings (component labels, annotations).
    """
    client = _get_client()

    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)

    if response.error.message:
        raise RuntimeError(f"GCP Vision error: {response.error.message}")

    labels: list[str] = []
    for page in response.full_text_annotation.pages:
        for block in page.blocks:
            for paragraph in block.paragraphs:
                words = [
                    "".join(s.text for s in word.symbols)
                    for word in paragraph.words
                ]
                text = " ".join(words).strip()
                if text:
                    labels.append(text)

    return labels


def screenshot_to_base64(image_bytes: bytes) -> str:
    """Utility: encode screenshot bytes to base64 string for API transport."""
    return base64.b64encode(image_bytes).decode("utf-8")
