import json
from pathlib import Path
from neo4j import GraphDatabase

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASS = "neo4j12345"  # поменяй если у тебя другой пароль

def main():
    data_path = Path(__file__).resolve().parents[1] / "data" / "works.json"
    works = json.loads(data_path.read_text(encoding="utf-8"))

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))

    cypher = """
    MERGE (w:Work {id: $id})
    SET w.title=$title, w.author=$author, w.age=$age

    WITH w, $concepts AS concepts
    UNWIND keys(concepts) AS cname
    MERGE (c:Concept {name: cname})
    MERGE (w)-[r:HAS_CONCEPT]->(c)
    SET r.weight = toFloat(concepts[cname])
    """

    with driver.session() as session:
        # опционально: очистка старых связей/концептов (если хочешь "перезалить")
        # session.run("MATCH (:Work)-[r:HAS_CONCEPT]->(:Concept) DELETE r")
        # session.run("MATCH (c:Concept) WHERE NOT (():HAS_CONCEPT]->(c) DELETE c")

        for w in works:
            session.run(
                cypher,
                id=w["id"],
                title=w["title"],
                author=w["author"],
                age=w["age"],
                concepts=w.get("concepts") or {},
            )

    driver.close()
    print(f"OK: imported works={len(works)} from {data_path}")

if __name__ == "__main__":
    main()
