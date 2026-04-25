"""
services/xml_parser.py
Parses .drawio XML to extract nodes (vertices) and edges.
Returns a normalized graph dict that can be diffed and converted to Mermaid.
"""

import xml.etree.ElementTree as ET
import hashlib
import re
from typing import TypedDict


class Node(TypedDict):
    id: str
    label: str
    style: str


class Edge(TypedDict):
    id: str
    source: str
    target: str
    label: str


class DiagramGraph(TypedDict):
    nodes: dict[str, Node]   # id -> Node
    edges: list[Edge]
    hash: str                # SHA-256 of the raw XML for fast change detection


def _strip_html(text: str) -> str:
    """Remove HTML tags from draw.io cell value attributes."""
    return re.sub(r"<[^>]+>", "", text or "").strip()


def parse_drawio_xml(xml_string: str) -> DiagramGraph:
    """
    Parse a .drawio XML string into a normalized graph.
    Handles both compressed and uncompressed formats.
    """
    xml_hash = hashlib.sha256(xml_string.encode()).hexdigest()

    try:
        root = ET.fromstring(xml_string)
    except ET.ParseError as e:
        raise ValueError(f"Invalid draw.io XML: {e}")

    # .drawio XML may be nested under <mxGraphModel> or <root> directly
    root_elem = root.find(".//root")
    if root_elem is None:
        root_elem = root

    nodes: dict[str, Node] = {}
    edges: list[Edge] = []

    for cell in root_elem.findall("mxCell"):
        cell_id = cell.get("id", "")
        # Skip the two mandatory root cells (id=0 and id=1)
        if cell_id in ("0", "1"):
            continue

        label = _strip_html(cell.get("value", ""))
        style = cell.get("style", "")

        if cell.get("vertex") == "1":
            nodes[cell_id] = Node(id=cell_id, label=label, style=style)

        elif cell.get("edge") == "1":
            edges.append(Edge(
                id=cell_id,
                source=cell.get("source", ""),
                target=cell.get("target", ""),
                label=label,
            ))

    return DiagramGraph(nodes=nodes, edges=edges, hash=xml_hash)


def graph_to_mermaid(graph: DiagramGraph) -> str:
    """Convert a parsed DiagramGraph to Mermaid flowchart syntax."""
    lines = ["graph TD"]

    for node in graph["nodes"].values():
        safe_label = node["label"].replace('"', "'") or node["id"]
        lines.append(f'    {node["id"]}["{safe_label}"]')

    for edge in graph["edges"]:
        src = edge["source"]
        tgt = edge["target"]
        if src and tgt:
            if edge["label"]:
                lines.append(f'    {src} -->|"{edge["label"]}"| {tgt}')
            else:
                lines.append(f"    {src} --> {tgt}")

    return "\n".join(lines)
