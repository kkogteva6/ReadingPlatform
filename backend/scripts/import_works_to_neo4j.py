from pathlib import Path
import json
from neo4j import GraphDatabase

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASS = "neo4j12345"

def main():
    data_path = Path(__file__).resolve().parents[1] / "data" / "works.json"
    works = json.loads(data_path.read_text(encoding="utf-8"))

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))

    with driver.session() as session:
        for w in works:
            session.run(
                """
                MERGE (work:Work {id:$id})
                SET work.title=$title, work.author=$author, work.age=$age
                """,
                id=w["id"], title=w["title"], author=w["author"], age=w["age"]
            )

            for concept_name, weight in w["concepts"].items():
                session.run(
                    """
                    MERGE (c:Concept {name:$name})
                    WITH c
                    MATCH (work:Work {id:$work_id})
                    MERGE (work)-[r:EXPRESSES]->(c)
                    SET r.weight=$weight
                    """,
                    name=concept_name, weight=float(weight), work_id=w["id"]
                )

    driver.close()
    print("Import done")

if __name__ == "__main__":
    main()
