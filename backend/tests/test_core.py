"""Core pipeline tests. Run: python -m unittest discover -s tests -v   (from backend/)"""
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ.update(DATA_DIR=_tmp, EMBEDDING_BACKEND="hash", STORE_BACKEND="numpy",
                  GOOGLE_API_KEY="", OPENAI_API_KEY="", LLM_PROVIDER="auto")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, ingest, llm, rag, registry, vectorstore  # noqa: E402

FILES = {
    "src/auth/login.py": '''import bcrypt
from db.session import get_session


def login_user(email, password):
    """Authenticate a user: verify the password hash and create a session token."""
    user = get_session().query_user(email)
    if not user or not bcrypt.checkpw(password.encode(), user.password_hash):
        raise PermissionError("invalid credentials")
    return create_session_token(user)


def create_session_token(user):
    """Issue a signed JWT session token for the authenticated user."""
    return sign_jwt({"sub": user.id})
''',
    "src/db/session.py": '''import sqlalchemy


class DatabaseConnection:
    """Opens the postgres database connection pool."""

    def __init__(self, url):
        self.engine = sqlalchemy.create_engine(url, pool_size=10)


def get_session():
    return DatabaseConnection("postgresql://localhost/app")
''',
    "src/payments/stripe_client.py": '''import stripe


def charge_customer(customer_id, amount_cents):
    """Create a Stripe payment intent and charge the customer's card."""
    return stripe.PaymentIntent.create(customer=customer_id, amount=amount_cents, currency="usd")


def handle_refund(payment_id):
    return stripe.Refund.create(payment_intent=payment_id)
''',
    "web/App.tsx": "export function App() {\n  return <div>Hello dashboard</div>;\n}\n",
    "README.md": "# Demo shop\n\nA small store.\n",
    "package-lock.json": "{}",
    "node_modules/x/index.js": "module.exports = 1",
    "logo.png": "\x00\x01binary",
}


def make_repo(root: Path):
    for rel, text in FILES.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)


class IngestTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        make_repo(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_skips_noise(self):
        paths = {d["path"] for d in ingest.load_documents(self.root)}
        self.assertEqual(paths, {"src/auth/login.py", "src/db/session.py", "src/payments/stripe_client.py",
                                 "web/App.tsx", "README.md"})

    def test_chunk_line_numbers_are_exact(self):
        big = "\n".join(f"def fn_{i}():\n    return {i}\n" for i in range(120))
        chunks = ingest.chunk_document({"path": "big.py", "language": "python", "text": big, "lines": 360})
        self.assertGreater(len(chunks), 3)
        lines = big.split("\n")
        for c in chunks:
            self.assertEqual("\n".join(lines[c["start"] - 1:c["end"]]).rstrip(), c["text"])
            self.assertLessEqual(len(c["text"]), config.CHUNK_MAX_CHARS + 200)
        self.assertEqual(chunks[0]["start"], 1)
        self.assertEqual(chunks[-1]["end"], len(big.rstrip().split("\n")))

    def test_symbols(self):
        doc = next(d for d in ingest.load_documents(self.root) if d["path"].endswith("login.py"))
        self.assertEqual(ingest.chunk_document(doc)[0]["symbol"], "login_user")

    def test_github_url_parsing(self):
        self.assertEqual(ingest.parse_github_url("https://github.com/tiangolo/fastapi"), ("tiangolo", "fastapi", None))
        self.assertEqual(ingest.parse_github_url("https://github.com/a/b.git"), ("a", "b", None))
        self.assertEqual(ingest.parse_github_url("github.com/a/b/tree/dev/src"), ("a", "b", "dev"))
        for bad in ("https://gitlab.com/a/b", "not a url", "https://github.com/onlyowner"):
            with self.assertRaises(ValueError):
                ingest.parse_github_url(bad)

    def test_zip_extraction_and_traversal_block(self):
        z = self.root.parent / "ok.zip"
        with zipfile.ZipFile(z, "w") as zf:
            zf.writestr("proj/a.py", "print(1)")
        out = ingest.extract_zip(z, Path(tempfile.mkdtemp()))
        self.assertEqual(out.name, "proj")
        evil = self.root.parent / "evil.zip"
        with zipfile.ZipFile(evil, "w") as zf:
            zf.writestr("../../evil.py", "x")
        with self.assertRaises(ValueError):
            ingest.extract_zip(evil, Path(tempfile.mkdtemp()))
        bad = self.root.parent / "bad.zip"
        bad.write_text("nope")
        with self.assertRaises(ValueError):
            ingest.extract_zip(bad, Path(tempfile.mkdtemp()))


class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp())
        make_repo(cls.root)
        chunks = ingest.split_documents(ingest.load_documents(cls.root))
        vectorstore.index_chunks("demo", chunks)

    def top(self, q):
        return rag.retrieve("demo", q, 3)[0]["path"]

    def test_expected_files_rank_first(self):
        self.assertEqual(self.top("Where is user authentication implemented?"), "src/auth/login.py")
        self.assertEqual(self.top("Which file handles database connections?"), "src/db/session.py")
        self.assertEqual(self.top("Explain how the payment module works"), "src/payments/stripe_client.py")
        self.assertEqual(self.top("What happens when a user logs in?"), "src/auth/login.py")

    def test_offline_answer_cites_files(self):
        hits = rag.retrieve("demo", "how do refunds work", 4)
        text = "".join(llm.stream_answer("how do refunds work", hits, [], "demo"))
        self.assertEqual(llm.provider(), "offline")
        self.assertRegex(text, r"`src/payments/stripe_client\.py:\d+-\d+`")

    def test_answer_events(self):
        repo = {"id": "demo", "name": "demo"}
        events = list(rag.answer(repo, "database connection pool", []))
        self.assertEqual(events[0]["type"], "sources")
        self.assertEqual(events[-1]["type"], "done")
        self.assertTrue(any(e["type"] == "token" for e in events))

    def test_delete_index(self):
        vectorstore.index_chunks("tmp", ingest.split_documents(ingest.load_documents(self.root)))
        vectorstore.delete_index("tmp")
        self.assertEqual(vectorstore.search("tmp", "anything", 3), [])


class RegistryTests(unittest.TestCase):
    def test_crud_and_history(self):
        registry.init()
        r = registry.create_repo("r1", "o/r", "https://github.com/o/r", "github")
        self.assertEqual(r["status"], "queued")
        registry.update_repo("r1", status="ready", languages={"python": 10}, files=2)
        self.assertEqual(registry.get_repo("r1")["languages"], {"python": 10})
        registry.save_files("r1", [("a.py", "python", 10, 1)])
        self.assertEqual(registry.list_files("r1")[0]["path"], "a.py")
        registry.add_message("r1", "user", "hi")
        registry.add_message("r1", "assistant", "yo", [{"path": "a.py"}])
        msgs = registry.list_messages("r1")
        self.assertEqual([m["role"] for m in msgs], ["user", "assistant"])
        self.assertEqual(msgs[1]["sources"][0]["path"], "a.py")
        registry.clear_messages("r1")
        self.assertEqual(registry.list_messages("r1"), [])
        registry.delete_repo("r1")
        self.assertIsNone(registry.get_repo("r1"))

    def test_interrupted_jobs_marked_error(self):
        registry.create_repo("r2", "o/x", "u", "github")
        registry.update_repo("r2", status="embedding")
        registry.init()
        self.assertEqual(registry.get_repo("r2")["status"], "error")


if __name__ == "__main__":
    unittest.main()
