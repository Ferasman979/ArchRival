"""
services/snowflake_service.py
Sends the Mermaid diagram + diff context to Snowflake Cortex LLM.
Uses RAG via Cortex Search over loaded best-practice documentation.
Returns a sarcastic critique string.
"""

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


@lru_cache(maxsize=1)
def _get_connection():
    """Create and cache a Snowflake connection."""
    return snowflake.connector.connect(
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        role=os.getenv("SNOWFLAKE_ROLE"),
    )


def get_critique(
    mermaid_diagram: str,
    change_summary: str,
    vision_labels: list[str],
) -> str:
    """
    Query Snowflake Cortex LLM with RAG to generate a sarcastic architecture critique.
    
    Args:
        mermaid_diagram: Current full diagram in Mermaid syntax
        change_summary: What just changed (from diff_engine)
        vision_labels: Labels confirmed by GCP Vision
    """
    conn = _get_connection()
    cursor = conn.cursor()

    # Build the user prompt
    vision_context = (
        f"GCP Vision confirmed these labels on screen: {', '.join(vision_labels)}"
        if vision_labels
        else ""
    )

    user_prompt = f"""
Current architecture diagram (Mermaid format):
{mermaid_diagram}

What just changed:
{change_summary}

{vision_context}

Provide your sarcastic critique focused ONLY on the change that was just made.
"""

    # Snowflake Cortex COMPLETE function with RAG
    # Assumes a ARCH_ENEMY_DOCS table exists with best-practice documentation
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

    cursor.execute(query, (SARCASTIC_SYSTEM_PROMPT, user_prompt))
    result = cursor.fetchone()
    cursor.close()

    if result and result[0]:
        import json
        response = json.loads(result[0])
        return response["choices"][0]["messages"].strip()

    return "I'm speechless. And not in a good way."


def setup_rag_corpus():
    """
    One-time setup: creates the documentation table in Snowflake for RAG.
    Run this once before the hackathon demo.
    """
    conn = _get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ARCH_ENEMY_DOCS (
            id VARCHAR,
            content TEXT,
            source VARCHAR,
            embedding VECTOR(FLOAT, 768)
        )
    """)

    # Insert key best-practice docs (abbreviated for hackathon)
    sample_docs = [
        ("1", "Never use a single database instance for high-traffic systems. Use read replicas and connection pooling.", "AWS Well-Architected"),
        ("2", "Every public-facing service should have a load balancer. Single API gateways are single points of failure.", "AWS Well-Architected"),
        ("3", "Add caching (Redis/Memcached) between your application and database to reduce read load by 70-90%.", "Databricks Best Practices"),
        ("4", "Message queues (Kafka, RabbitMQ, SQS) decouple services and prevent cascade failures.", "System Design Primer"),
        ("5", "Microservices should have circuit breakers. Without them, one slow service brings down the entire system.", "Netflix Tech Blog"),
        ("6", "MongoDB and PostgreSQL serving the same data is a polyglot persistence anti-pattern without clear justification.", "Martin Fowler"),
        ("7", "K8s clusters need resource limits on every pod. Unconstrained pods cause noisy neighbor problems.", "CNCF Best Practices"),
    ]

    cursor.executemany(
        "INSERT INTO ARCH_ENEMY_DOCS (id, content, source) VALUES (%s, %s, %s)",
        sample_docs,
    )

    conn.commit()
    cursor.close()
    print("RAG corpus loaded successfully.")
