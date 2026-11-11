"""The application imports, starts and answers its health check."""


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_docs_are_not_served_outside_debug(client):
    from app.core.config import settings

    response = client.get("/openapi.json")
    assert response.status_code == (200 if settings.DEBUG else 404)
