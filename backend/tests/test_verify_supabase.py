import io
import json
import urllib.error

import pytest

from scripts import verify_supabase as verifier


def test_env_file_preserves_terminal_settings_and_does_not_execute(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://terminal.example")
    monkeypatch.delenv("VERIFY_TEST_VALUE", raising=False)
    path = tmp_path / "settings.env"
    path.write_text('# comment\nSUPABASE_URL="https://file.example"\nVERIFY_TEST_VALUE=\'$(literal)\'\n', encoding="utf-8-sig")
    verifier.load_env(path)
    assert verifier.os.environ["SUPABASE_URL"] == "https://terminal.example"
    assert verifier.os.environ["VERIFY_TEST_VALUE"] == "$(literal)"
    monkeypatch.delenv("VERIFY_TEST_VALUE")


@pytest.mark.parametrize("status,code", [(400, "42703"), (404, "PGRST205"), (403, "42501")])
def test_http_failures_do_not_expose_secrets_and_continue(status, code, monkeypatch, capsys):
    secret = "test-credential-do-not-print"
    monkeypatch.setenv("SUPABASE_URL", "https://test.example")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", secret)
    calls = []

    def fail(req, timeout):
        calls.append(req)
        raise urllib.error.HTTPError(req.full_url, status, secret, {},
                                     io.BytesIO(json.dumps({"code": code, "message": secret}).encode()))

    monkeypatch.setattr(verifier.urllib.request, "urlopen", fail)
    assert verifier.main([]) == 1
    output = capsys.readouterr().out
    assert secret not in output
    assert code in output
    assert len(calls) == 17
    assert "case-insensitive search comparison" not in output


def test_checks_search_validation_and_returns_failure_for_wildcards(monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_URL", "https://test.example")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-key")

    def respond(req, timeout):
        if req.data:
            payload = json.loads(req.data)
            term = payload["search_query"]
            rows = [{"id": 1, "name": "Milk", "category": "drink"}] if term in ("milk", "MILK", "%", "_") else []
        else:
            rows = []
        return io.BytesIO(json.dumps(rows).encode())

    monkeypatch.setattr(verifier.urllib.request, "urlopen", respond)
    assert verifier.main([]) == 1
    output = capsys.readouterr().out
    assert "FAIL search '%'" in output
    assert "FAIL search '_'" in output
    assert "PASS case-insensitive search comparison" in output


def test_missing_configuration_does_not_make_requests(monkeypatch, capsys):
    for name in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(verifier.urllib.request, "urlopen", lambda *args, **kwargs: pytest.fail("Unexpected network request"))
    assert verifier.main([]) == 1
    assert "NOT RUN" in capsys.readouterr().out
