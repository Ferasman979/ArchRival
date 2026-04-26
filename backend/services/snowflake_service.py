"""
services/snowflake_service.py
Sends the Mermaid diagram + diff context to Snowflake Cortex LLM.
Uses RAG via vector cosine similarity over ARCH_ENEMY_DOCS to ground critiques
in real industry best-practice references before calling CORTEX.COMPLETE.
"""

import json
import os
import snowflake.connector
from functools import lru_cache

SARCASTIC_SYSTEM_PROMPT = """
You are Arch-Enemy — the Gordon Ramsay of cloud infrastructure.
You are a brutally sarcastic, highly knowledgeable Principal Engineer reviewing a system architecture diagram.

Rules:
1. Be sarcastic and witty — but technically ACCURATE. Every critique must be grounded in real engineering problems.
2. If the change is GOOD, be begrudgingly impressed (still slightly sarcastic).
3. If the change is BAD, be dramatically horrified.
4. Keep responses SHORT — 2-4 sentences maximum. You're speaking, not writing a thesis.
5. Reference SPECIFIC components from the diagram by name.
6. End with one concrete, actionable recommendation.
7. NEVER be generic. Tie every comment to the actual change made.

Example bad-change response:
"Oh wonderful, you've added MongoDB right next to PostgreSQL with no explanation.
Two databases, zero reasons. My on-call schedule is already crying.
Pick one and add a caching layer — Redis would love to help you here."

Example good-change response:
"A load balancer. You actually added a load balancer.
I'm shocked — genuinely shocked.
Now add health checks to it and we might survive a real traffic spike."
"""

_RAG_CHUNKS = [
    {
        "id": "1",
        "source": "AWS Well-Architected Framework",
        "topic": "Database Redundancy & Connection Pooling",
        "chunk_index": 1,
        "content": (
            "Never use a single database instance for high-traffic systems. "
            "Use read replicas to offload read-heavy traffic and PgBouncer for connection pooling. "
            "No polyglot persistence unless there is a clear access-pattern justification for each store."
        ),
    },
    {
        "id": "2",
        "source": "AWS Well-Architected Framework",
        "topic": "Load Balancing & API Gateway Redundancy",
        "chunk_index": 2,
        "content": (
            "Every public-facing service must have redundant load balancers across multiple availability zones. "
            "A single API gateway is a single point of failure. "
            "Distribute traffic across AZs and use health checks to route away from unhealthy instances."
        ),
    },
    {
        "id": "3",
        "source": "Databricks Best Practices",
        "topic": "Caching Strategies",
        "chunk_index": 3,
        "content": (
            "Add a Redis or Memcached caching layer between the application and the database. "
            "Target 70-90% read load reduction and sub-millisecond response times for hot data. "
            "Without caching, read-heavy workloads will saturate the primary DB under load."
        ),
    },
    {
        "id": "4",
        "source": "System Design Primer",
        "topic": "Asynchronous Messaging",
        "chunk_index": 4,
        "content": (
            "Services should communicate asynchronously via message queues (Kafka, RabbitMQ, SQS). "
            "Fire-and-forget patterns prevent upstream services from blocking on downstream failures. "
            "Synchronous call chains mean one slow service cascades latency across the entire system."
        ),
    },
    {
        "id": "5",
        "source": "Netflix Tech Blog",
        "topic": "Circuit Breaker Patterns",
        "chunk_index": 5,
        "content": (
            "Every downstream dependency must have a circuit breaker: fail fast, return a fallback, "
            "and stop blocking threads waiting for a service that is already down. "
            "Without circuit breakers, a single failing dependency can exhaust the thread pool and take down the caller."
        ),
    },
    {
        "id": "6",
        "source": "Martin Fowler on Polyglot Persistence",
        "topic": "Polyglot Persistence Anti-patterns",
        "chunk_index": 6,
        "content": (
            "Running MongoDB and PostgreSQL on the same data without clear access-pattern justification "
            "is a polyglot persistence anti-pattern. "
            "Each database adds operational overhead, schema divergence risk, and consistency complexity. "
            "Only introduce a second store when the primary cannot satisfy a fundamentally different access pattern."
        ),
    },
    {
        "id": "7",
        "source": "CNCF K8s Best Practices",
        "topic": "Kubernetes Resource Constraints",
        "chunk_index": 7,
        "content": (
            "All Kubernetes pods must have explicit CPU and memory limits set. "
            "Unconstrained pods cause noisy neighbor problems and resource starvation across the cluster. "
            "Follow CNCF resource quota guidelines: set both requests and limits, and use LimitRange objects "
            "to enforce defaults at the namespace level."
        ),
    },
]


@lru_cache(maxsize=1)
def _get_connection():
    return snowflake.connector.connect(
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        role=os.getenv("SNOWFLAKE_ROLE"),
    )


def _retrieve_context(query_text: str, top_k: int = 3) -> str:
    """
    Embed query_text and return the top-k most relevant RAG chunks as a
    formatted string block for prompt injection.
    Falls back to empty string if ARCH_ENEMY_DOCS is empty or query fails.
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            WITH q AS (
                SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m-v1.5', %s) AS q_emb
            )
            SELECT source, topic, content
            FROM ARCH_ENEMY_DOCS, q
            ORDER BY VECTOR_COSINE_SIMILARITY(embedding, q.q_emb) DESC
            LIMIT %s
            """,
            (query_text, top_k),
        )
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            return ""

        parts = []
        for source, topic, content in rows:
            parts.append(f"[{source} — {topic}]\n{content}")
        return "\n\n".join(parts)

    except Exception:
        return ""


def get_critique(
    mermaid_diagram: str,
    change_summary: str,
    vision_labels: list[str],
    enrichment_note: str = "",
    retry_hint: str = "",
) -> str:
    """
    RAG-augmented sarcastic critique.
    1. Build retrieval query from change_summary + diagram labels.
    2. Vector search ARCH_ENEMY_DOCS for the most relevant principles.
    3. Inject retrieved context into the system prompt.
    4. Call CORTEX.COMPLETE with the grounded prompt.
    """
    conn = _get_connection()
    cursor = conn.cursor()

    # Build retrieval query from what just changed
    label_str = ", ".join(vision_labels) if vision_labels else ""
    retrieval_query = f"{change_summary}. Components: {label_str}. Diagram: {mermaid_diagram}"
    retrieved_context = _retrieve_context(retrieval_query)

    # Build system prompt — inject RAG context if available
    if retrieved_context:
        system_prompt = (
            SARCASTIC_SYSTEM_PROMPT.strip()
            + f"""

[Industry Best Practices — use these as your source of truth for this critique]
{retrieved_context}

Critique the user's diagram based on these specific principles. \
If a principle (like Caching or Circuit Breakers) is clearly missing but applicable, call it out by name."""
        )
    else:
        system_prompt = SARCASTIC_SYSTEM_PROMPT.strip()

    vision_context = (
        f"GCP Vision confirmed these labels on screen: {', '.join(vision_labels)}\n"
        f"{enrichment_note}"
        if vision_labels else enrichment_note
    )

    user_prompt = f"""
Current architecture diagram (Mermaid format):
{mermaid_diagram}

What just changed:
{change_summary}

{vision_context}

{retry_hint}

Provide your sarcastic critique focused ONLY on the change that was just made.
""".strip()

    query = """
    SELECT SNOWFLAKE.CORTEX.COMPLETE(
        'llama3.1-70b',
        [
            {
                'role': 'system',
                'content': %s
            },
            {
                'role': 'user',
                'content': %s
            }
        ],
        {
            'temperature': 0.7,
            'max_tokens': 200
        }
    ) AS critique
    """

    cursor.execute(query, (system_prompt, user_prompt))
    result = cursor.fetchone()
    cursor.close()

    if result and result[0]:
        response = json.loads(result[0])
        return response["choices"][0]["messages"].strip()

    return "I'm speechless. And not in a good way."


def setup_rag_corpus():
    """
    One-time setup: create ARCH_ENEMY_DOCS with the correct schema and seed
    all 7 chunks with embeddings via SNOWFLAKE.CORTEX.EMBED_TEXT.
    Safe to re-run — drops and recreates the table cleanly.
    """
    conn = _get_connection()
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS ARCH_ENEMY_DOCS")
    cursor.execute("""
        CREATE TABLE ARCH_ENEMY_DOCS (
            id       STRING,
            source   STRING,
            topic    STRING,
            chunk_index INT,
            content  STRING,
            embedding VECTOR(FLOAT, 768)
        )
    """)

    for chunk in _RAG_CHUNKS:
        cursor.execute(
            """
            INSERT INTO ARCH_ENEMY_DOCS (id, source, topic, chunk_index, content, embedding)
            SELECT %s, %s, %s, %s, %s,
                   SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m-v1.5', %s)
            """,
            (
                chunk["id"],
                chunk["source"],
                chunk["topic"],
                chunk["chunk_index"],
                chunk["content"],
                chunk["content"],
            ),
        )

    conn.commit()
    cursor.close()
    print(f"RAG corpus loaded: {len(_RAG_CHUNKS)} chunks seeded with embeddings.")
