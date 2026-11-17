"""Short-lived SQLite connections and explicit transactions; no SQL in UI code."""

import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


def now() -> int:
    return int(time.time() * 1000)


def new_id() -> str:
    return str(uuid.uuid4())


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(Path(__file__).with_name("schema.sql").read_text())

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    @contextmanager
    def transaction(self):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            yield connection

    def one(self, sql, *parameters):
        with self.connect() as connection:
            row = connection.execute(sql, parameters).fetchone()
            return dict(row) if row else None

    def all(self, sql, *parameters):
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(sql, parameters).fetchall()]

    def execute(self, sql, *parameters):
        with self.connect() as connection:
            return connection.execute(sql, parameters).rowcount

    def audit(self, actor_id, action, target_id=None, **detail):
        import json

        self.execute(
            "INSERT INTO audit VALUES(?,?,?,?,?,?)",
            new_id(),
            actor_id,
            action,
            target_id,
            json.dumps(detail, ensure_ascii=False),
            now(),
        )
