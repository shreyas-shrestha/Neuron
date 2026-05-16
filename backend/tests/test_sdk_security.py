from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core import database
from app.core.config import settings
from app.main import app
from app.models.model_registry import ModelRegistry


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient, email: str, password: str = "secret123") -> str:
    register = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert register.status_code == 200, register.text
    return register.json()["access_token"]


def _create_api_key(client: TestClient, token: str, label: str) -> str:
    resp = client.post(
        "/api/v1/auth/api-keys",
        json={"label": label},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["key"]


def _configure_test_app(monkeypatch, db_url: str, engine, testing_session_local) -> None:
    monkeypatch.setattr(settings, "database_url", db_url)
    monkeypatch.setattr(settings, "demo_mode_enabled", False)
    monkeypatch.setattr(settings, "bootstrap_demo_user", False)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", testing_session_local)

    import app.main as main_module

    async def _no_op_loop() -> None:
        return None

    monkeypatch.setattr(main_module, "engine", engine)
    monkeypatch.setattr(main_module, "SessionLocal", testing_session_local)
    monkeypatch.setattr(main_module, "cleanup_demo_sessions", _no_op_loop)
    monkeypatch.setattr(main_module, "analysis_watchdog_loop", _no_op_loop)


def test_sdk_same_model_name_is_isolated_per_user(tmp_path, monkeypatch):
    db_path = tmp_path / "sdk-security.db"
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False, "timeout": 30.0})
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _configure_test_app(monkeypatch, db_url, engine, testing_session_local)

    database.Base.metadata.create_all(bind=engine)

    with TestClient(app) as client:
        token_a = _register_and_login(client, "alice@example.com")
        token_b = _register_and_login(client, "bob@example.com")
        api_key_a = _create_api_key(client, token_a, "alice-sdk")
        api_key_b = _create_api_key(client, token_b, "bob-sdk")

        payload_a = {
            "model_id": "shared-model",
            "epoch": 1,
            "behavior_change_index": 11.5,
            "state_summary": {"weights": "a"},
        }
        payload_b = {
            "model_id": "shared-model",
            "epoch": 2,
            "behavior_change_index": 42.0,
            "state_summary": {"weights": "b"},
        }

        resp_a = client.post(
            "/api/v1/sdk/checkpoint",
            json=payload_a,
            headers=_auth_headers(api_key_a),
        )
        resp_b = client.post(
            "/api/v1/sdk/checkpoint",
            json=payload_b,
            headers=_auth_headers(api_key_b),
        )
        assert resp_a.status_code == 200, resp_a.text
        assert resp_b.status_code == 200, resp_b.text

        history_a = client.get(
            "/api/v1/sdk/models/shared-model/history",
            headers=_auth_headers(token_a),
        )
        history_b = client.get(
            "/api/v1/sdk/models/shared-model/history",
            headers=_auth_headers(token_b),
        )
        assert history_a.status_code == 200, history_a.text
        assert history_b.status_code == 200, history_b.text
        assert [x["bci"] for x in history_a.json()["checkpoints"]] == [11.5]
        assert [x["bci"] for x in history_b.json()["checkpoints"]] == [42.0]

        with testing_session_local() as session:
            rows = session.execute(
                select(ModelRegistry).where(ModelRegistry.name == "shared-model")
            ).scalars().all()
            assert len(rows) == 2
            assert len({str(row.owner_user_id) for row in rows}) == 2


def test_sdk_history_rejects_other_users_model_uuid(tmp_path, monkeypatch):
    db_path = tmp_path / "sdk-history.db"
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False, "timeout": 30.0})
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _configure_test_app(monkeypatch, db_url, engine, testing_session_local)

    database.Base.metadata.create_all(bind=engine)

    with TestClient(app) as client:
        token_a = _register_and_login(client, "carol@example.com")
        token_b = _register_and_login(client, "dave@example.com")
        api_key_b = _create_api_key(client, token_b, "dave-sdk")

        resp_b = client.post(
            "/api/v1/sdk/checkpoint",
            json={
                "model_id": "private-model",
                "epoch": 4,
                "behavior_change_index": 7.0,
                "state_summary": {"weights": "b"},
            },
            headers=_auth_headers(api_key_b),
        )
        assert resp_b.status_code == 200, resp_b.text

        models_b = client.get("/api/v1/models", headers=_auth_headers(token_b))
        assert models_b.status_code == 200, models_b.text
        model_id_b = models_b.json()[0]["id"]

        blocked = client.get(
            f"/api/v1/sdk/models/{model_id_b}/history",
            headers=_auth_headers(token_a),
        )
        assert blocked.status_code == 404, blocked.text


def test_sdk_history_includes_verification_and_checkpoint_deltas(tmp_path, monkeypatch):
    db_path = tmp_path / "sdk-verification.db"
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False, "timeout": 30.0})
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _configure_test_app(monkeypatch, db_url, engine, testing_session_local)

    database.Base.metadata.create_all(bind=engine)

    with TestClient(app) as client:
        token = _register_and_login(client, "erin@example.com")
        api_key = _create_api_key(client, token, "erin-sdk")

        first = client.post(
            "/api/v1/sdk/checkpoint",
            json={
                "model_id": "verified-model",
                "epoch": 1,
                "label": "baseline",
                "behavior_change_index": 3.5,
                "state_summary": {"layer_stats": {"layer0": {"norm": 1.0}}, "fingerprint": "fp-a"},
                "verification": {
                    "probe_count": 10,
                    "monitored_layers": [0, 3, 6],
                    "mean_probe_drift": 0.058,
                    "layer_drifts": {"0": 0.02, "3": 0.06, "6": 0.09},
                },
            },
            headers=_auth_headers(api_key),
        )
        assert first.status_code == 200, first.text
        first_id = first.json()["analysis_id"]

        second = client.post(
            "/api/v1/sdk/checkpoint",
            json={
                "model_id": "verified-model",
                "epoch": 2,
                "label": "retrained",
                "baseline_id": first_id,
                "behavior_change_index": 19.25,
                "state_summary": {
                    "layer_stats": {"layer0": {"norm": 1.4}, "layer1": {"norm": 0.8}},
                    "fingerprint": "fp-b",
                },
                "verification": {
                    "probe_count": 10,
                    "monitored_layers": [0, 3, 6],
                    "mean_probe_drift": 0.321,
                    "max_layer_drift": 0.41,
                    "layer_drifts": {"0": 0.18, "3": 0.37, "6": 0.41},
                },
            },
            headers=_auth_headers(api_key),
        )
        assert second.status_code == 200, second.text

        history = client.get(
            "/api/v1/sdk/models/verified-model/history",
            headers=_auth_headers(token),
        )
        assert history.status_code == 200, history.text
        checkpoints = history.json()["checkpoints"]
        assert len(checkpoints) == 2
        baseline, retrained = checkpoints
        assert baseline["verification_status"] == "client_probe_verified"
        assert retrained["verification_status"] == "client_probe_verified"
        assert retrained["baseline_id"] == first_id
        assert retrained["compared_to_analysis_id"] == first_id
        assert retrained["compared_to_label"] == "baseline"
        assert abs(retrained["bci_delta"] - 15.75) < 1e-6
        assert retrained["verification"]["probe_count"] == 10
        assert "layer0" in retrained["changed_layer_stats"]


def test_demo_routes_can_be_disabled(tmp_path, monkeypatch):
    db_path = tmp_path / "demo-disabled.db"
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False, "timeout": 30.0})
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _configure_test_app(monkeypatch, db_url, engine, testing_session_local)

    database.Base.metadata.create_all(bind=engine)

    with TestClient(app) as client:
        health = client.get("/api/v1/demo/health")
        setup = client.post("/api/v1/demo/setup")
        assert health.status_code == 404, health.text
        assert setup.status_code == 404, setup.text
