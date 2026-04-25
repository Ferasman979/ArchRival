"""
services/quality_gates.py
All quality gates in one module:
  1. XML validation        — reject bad payload before any API call
  2. Vision cross-val      — compare XML labels vs Vision OCR labels
  3. Response validation   — ensure critique references diagram components
  4. Relevance guard       — lightweight topic filter for voice input
"""

import xml.etree.ElementTree as ET
import itertools

# ─── Gate 1: XML Validation ────────────────────────────────────────────────

MAX_XML_BYTES = 500_000  # 500 KB hard cap


def validate_drawio_xml(xml_string: str) -> tuple[bool, str]:
    """Returns (is_valid, error_message)."""
    if not xml_string or not xml_string.strip():
        return False, "Empty XML payload."
    if len(xml_string.encode()) > MAX_XML_BYTES:
        return False, "XML payload exceeds 500 KB size limit."
    try:
        root = ET.fromstring(xml_string)
    except ET.ParseError as e:
        return False, f"Invalid XML syntax: {e}"
    # Must be or contain mxGraphModel
    if "mxgraphmodel" not in root.tag.lower() and root.find(".//mxGraphModel") is None:
        return False, "XML is not a valid draw.io (mxGraphModel) file."
    return True, ""


# ─── Gate 2: Vision Cross-Validation ─────────────────────────────────────

def cross_validate_labels(xml_labels: list[str], vision_labels: list[str]) -> dict:
    """
    Compare XML parser labels vs GCP Vision OCR labels.
    Returns enriched label set + overlap stats.
    Vision-only labels = unannotated icons / embedded text not in XML.
    """
    xml_set = {l.lower().strip() for l in xml_labels if l.strip()}
    vis_set = {l.lower().strip() for l in vision_labels if l.strip()}

    vision_only = vis_set - xml_set
    total = len(xml_set | vis_set)
    overlap_score = len(xml_set & vis_set) / total if total > 0 else 1.0

    # If overlap < 20% Vision is likely reading the wrong window — discard it
    vision_trustworthy = overlap_score >= 0.20 or len(xml_set) == 0

    merged = list(xml_labels)
    enrichment_note = ""
    if vision_trustworthy and vision_only:
        for label in vision_labels:
            if label.lower().strip() in vision_only:
                merged.append(f"[Vision-detected, unlabelled in XML]: {label}")
        enrichment_note = (
            f"GCP Vision detected {len(vision_only)} component(s) not in XML "
            f"(likely unannotated icons): {', '.join(list(vision_only)[:5])}."
        )

    return {
        "merged_labels": merged,
        "vision_only": list(vision_only),
        "overlap_score": round(overlap_score, 2),
        "vision_trustworthy": vision_trustworthy,
        "enrichment_note": enrichment_note,
    }


# ─── Gate 3: Snowflake Response Validation ───────────────────────────────

_FALLBACK_CRITIQUES = itertools.cycle([
    "My RAG corpus is speechless. Label your components and try again.",
    "No components, no critique. Add some boxes. Connect some arrows. Show me something.",
    "Even I can't critique an abstract void. Label your diagram first.",
    "I've seen more structure in spaghetti code. Name your components.",
    "My sarcasm engine needs something concrete to work with. Label. Your. Boxes.",
])


def validate_critique_response(critique: str, component_names: list[str]) -> tuple[bool, str]:
    """
    Returns (is_valid, reason).
    Checks the critique actually references at least one diagram component.
    """
    if not critique or len(critique.strip()) < 20:
        return False, "Response too short."
    if not component_names:
        return True, ""  # Nothing to check against
    lower = critique.lower()
    for name in component_names:
        if name.lower().strip() and name.lower().strip() in lower:
            return True, ""
    return False, "Critique does not reference any known component — likely off-topic."


def get_fallback_critique() -> str:
    return next(_FALLBACK_CRITIQUES)


# ─── Gate 4: Voice Input Relevance Guard ─────────────────────────────────

_ARCH_KEYWORDS = {
    "architecture", "component", "service", "database", "api", "server",
    "cache", "queue", "load balancer", "microservice", "container", "kubernetes",
    "k8s", "docker", "aws", "gcp", "azure", "cloud", "network", "security",
    "auth", "scal", "replicate", "latency", "throughput", "failover", "redundan",
    "backup", "diagram", "design", "pattern", "connection", "pipeline", "storage",
    "cdn", "gateway", "proxy", "kafka", "rabbit", "redis", "postgres", "mongo",
    "sql", "lambda", "endpoint", "rest", "graphql", "grpc", "websocket",
    "why", "how", "should", "better", "wrong", "fix", "improve", "suggest",
    "recommend", "bad idea", "good idea",
}

_CANNED_OFFTOPIC = itertools.cycle([
    "I review architectures, not life advice. Ask me about your diagram.",
    "Fascinating question. Completely irrelevant to system design. Try again.",
    "I'm a Principal Engineer, not a search engine. Architecture questions only.",
    "That has nothing to do with the diagram in front of us. Refocus.",
    "My expertise is system design. Your question is not. Let's get back on track.",
])


def is_architecture_relevant(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in _ARCH_KEYWORDS)


def get_canned_offtopic_response() -> str:
    return next(_CANNED_OFFTOPIC)
