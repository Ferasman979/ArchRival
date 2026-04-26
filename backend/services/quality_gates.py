import itertools
import random


def validate_xml(xml: str) -> tuple[bool, str]:
    """Gate 1: reject bad payloads before any parsing or API calls."""
    if not xml or not xml.strip():
        return False, "Empty XML"
    if len(xml.encode()) > 500_000:
        return False, "Payload too large (500KB limit)"
    if "<mxGraphModel" not in xml and "<mxCell" not in xml:
        return False, "Does not look like draw.io XML"
    return True, ""


def compute_vision_overlap(
    xml_labels: list[str], vision_labels: list[str]
) -> tuple[float, str]:
    """
    Gate 2: cross-validate XML labels against Vision OCR labels.
    Returns (overlap_score 0.0-1.0, enrichment_note).
    overlap_score: fraction of non-empty XML labels confirmed by Vision.
    enrichment_note: Vision labels not in XML (extra context for the LLM prompt).
    """
    if not vision_labels:
        return 0.0, ""
    xml_set = {l.lower() for l in xml_labels if l}
    vision_set = {l.lower() for l in vision_labels if l}
    if not xml_set:
        return 0.0, ""
    overlap = len(xml_set & vision_set) / len(xml_set)
    extra = [l for l in vision_labels if l.lower() not in xml_set]
    enrichment = f"Vision also detected: {', '.join(extra)}" if extra else ""
    return round(overlap, 2), enrichment


def validate_critique(critique: str, component_labels: list[str]) -> tuple[bool, str]:
    """
    Gate 3: ensure the LLM response references at least one real component.
    Returns (is_valid, retry_hint).
    """
    if not critique or len(critique.strip()) < 20:
        return False, "Response was too short. Be specific and sarcastic."
    critique_lower = critique.lower()
    mentioned = [l for l in component_labels if l and l.lower() in critique_lower]
    if not mentioned:
        names = ", ".join(component_labels[:5]) if component_labels else "the components"
        return False, f"You must reference at least one of these by name: {names}"
    return True, ""


_FALLBACKS = [
    "I'd critique this architecture but I'm too busy staring at this single point of failure you've lovingly centered everything around.",
    "Congratulations. You've reinvented a monolith and called it microservices.",
    "This diagram has the same energy as deploying to prod on a Friday.",
    "No load balancer. No cache. No problem — until you have users.",
    "I've seen more resilience in a paper straw.",
    "Ah yes, the classic 'we'll add redundancy later' architecture. Later never comes.",
    "I see you've chosen chaos as your fault tolerance strategy.",
    "One database. No replicas. Bold choice. Extremely bold.",
    "Your services are so tightly coupled they might as well be one giant PHP file.",
    "I admire the confidence of deploying without a health check. Truly.",
    "That's not a microservices architecture. That's a distributed monolith with extra steps.",
    "Direct database access from the frontend. Daring. Unhinged, but daring.",
]

_FALLBACK_CYCLE = None


def get_fallback_critique() -> str:
    global _FALLBACK_CYCLE
    if _FALLBACK_CYCLE is None:
        pool = _FALLBACKS[:]
        random.shuffle(pool)
        _FALLBACK_CYCLE = itertools.cycle(pool)
    return next(_FALLBACK_CYCLE)


# ── Severity scoring ──────────────────────────────────────────────────────────

_GOOD_SIGNALS = [
    "shocked", "impressed", "survive", "finally", "beautifully", "good job",
    "well done", "nice", "clean", "elegant", "sensible", "smart", "approved",
    "correct", "proper", "solid", "credit", "respect", "acceptable", "love it",
    "almost impressed", "chef", "begrudgingly", "actually did it", "well-architected",
    "redundan", "resilient", "scalab", "decoupl", "health check",
]

_CRITICAL_SIGNALS = [
    "single point of failure", "no cach", "no cache", "no load balancer",
    "cursed", "disaster", "violence", "terrible", "horrible", "awful",
    "nightmare", "catastrophe", "crying", "paper straw", "chaos",
    "reinvented a monolith", "deploying to prod on a friday", "tightly coupled",
    "direct database", "no replicas", "no redundan", "speechless",
    "unhinged", "no health check", "php file",
]


def compute_severity(critique: str) -> str:
    """Score critique text and return 'good', 'warning', or 'critical'."""
    if not critique:
        return "warning"
    t = critique.lower()
    good_score = sum(1 for s in _GOOD_SIGNALS if s in t)
    critical_score = sum(1 for s in _CRITICAL_SIGNALS if s in t)
    if critical_score > good_score:
        return "critical"
    if good_score > 0:
        return "good"
    return "warning"


# Gate 4: voice input relevance guard (used by session.py webhook)
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
