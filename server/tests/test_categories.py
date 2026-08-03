from __future__ import annotations

from sqlmodel import select

from app.models import TaskCategoryLink
from tests.conftest import make_category, make_task


def test_list_is_empty_initially(client):
    response = client.get("/api/categories")
    assert response.status_code == 200
    assert response.json() == []


def test_create_honours_client_supplied_id(client):
    payload = make_category()
    response = client.post("/api/categories", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == payload["id"]
    assert body["name"] == "Home"
    assert body["emoji"] == "1f3e0"
    assert body["color"] == "#53e45d"
    assert body["lastSave"] == "2026-01-01T10:00:00Z"


def test_create_duplicate_id_conflicts(client):
    client.post("/api/categories", json=make_category())
    response = client.post("/api/categories", json=make_category(name="Home again"))
    assert response.status_code == 409


def test_get_single(client):
    payload = make_category()
    client.post("/api/categories", json=payload)

    response = client.get(f"/api/categories/{payload['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Home"


def test_get_missing_is_404(client):
    assert client.get("/api/categories/does-not-exist").status_code == 404


def test_patch_is_partial(client):
    payload = make_category()
    client.post("/api/categories", json=payload)

    response = client.patch(f"/api/categories/{payload['id']}", json={"name": "Household"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Household"
    # Untouched fields survive.
    assert body["emoji"] == "1f3e0"
    assert body["color"] == "#53e45d"
    assert body["lastSave"] == "2026-01-01T10:00:00Z"


def test_patch_missing_is_404(client):
    assert client.patch("/api/categories/nope", json={"name": "x"}).status_code == 404


def test_patch_ignores_an_id_in_the_body(client):
    """The client sends its whole canonical payload, `id` included."""
    payload = make_category()
    client.post("/api/categories", json=payload)

    response = client.patch(f"/api/categories/{payload['id']}", json={**payload, "name": "House"})
    assert response.status_code == 200
    assert response.json()["id"] == payload["id"]
    assert response.json()["name"] == "House"


def test_delete(client):
    payload = make_category()
    client.post("/api/categories", json=payload)

    assert client.delete(f"/api/categories/{payload['id']}").status_code == 204
    assert client.get(f"/api/categories/{payload['id']}").status_code == 404


def test_delete_missing_is_404(client):
    assert client.delete("/api/categories/nope").status_code == 404


def test_deleting_a_category_unlinks_it_without_deleting_tasks(client, session):
    """The acceptance scenario: delete a category, keep the task."""
    cat_a = make_category(id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name="A")
    cat_b = make_category(id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name="B")
    client.post("/api/categories", json=cat_a)
    client.post("/api/categories", json=cat_b)

    task = make_task(category=[{"id": cat_a["id"]}, {"id": cat_b["id"]}])
    assert client.post("/api/tasks", json=task).status_code == 201

    assert client.delete(f"/api/categories/{cat_a['id']}").status_code == 204

    response = client.get(f"/api/tasks/{task['id']}")
    assert response.status_code == 200
    assert [c["id"] for c in response.json()["category"]] == [cat_b["id"]]

    links = session.exec(select(TaskCategoryLink)).all()
    assert [link.category_id for link in links] == [cat_b["id"]]
