"""Check the Pages entry point, internal anchors and referenced local files."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class WebsiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.references = []
        self.errors = []
        self.has_title = False
        self.has_heading = False
        self.has_language = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        node_id = attrs.get("id")
        if node_id:
            if node_id in self.ids:
                self.errors.append(f"Duplicate id: {node_id}")
            self.ids.add(node_id)
        self.has_title |= tag == "title"
        self.has_heading |= tag == "h1"
        self.has_language |= tag == "html" and attrs.get("lang") == "th"
        for name in ("src", "href"):
            if attrs.get(name):
                self.references.append(attrs[name])


def main():
    root = Path(__file__).resolve().parents[2] / "pages"
    entry = root / "index.html"
    if not entry.is_file():
        raise SystemExit("Missing pages/index.html")
    parser = WebsiteParser()
    parser.feed(entry.read_text(encoding="utf-8"))
    for condition, message in (
        (parser.has_title, "Missing title"),
        (parser.has_heading, "Missing h1"),
        (parser.has_language, "Missing html lang=th"),
    ):
        if not condition:
            parser.errors.append(message)
    for ref in parser.references:
        url = urlsplit(ref)
        if url.scheme or url.netloc:
            continue
        if not url.path:
            if url.fragment and unquote(url.fragment) not in parser.ids:
                parser.errors.append(f"Missing anchor: {ref}")
            continue
        target = (root / unquote(url.path)).resolve()
        if url.path.startswith("/") or not target.is_relative_to(root.resolve()):
            parser.errors.append(f"Asset must stay inside the Pages directory: {ref}")
        elif not target.is_file() or not target.stat().st_size:
            parser.errors.append(f"Missing or empty local file: {ref}")
    if parser.errors:
        raise SystemExit("\n".join(parser.errors))
    print("Pages checks passed: entry point, Thai language, anchors and local assets")


if __name__ == "__main__":
    main()
