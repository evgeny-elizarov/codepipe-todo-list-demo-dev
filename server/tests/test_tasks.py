from __future__ import annotations

from tests.conftest import make_category, make_task

CAT_A = make_category(id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name="A")
CAT_B = make_category(id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name="B")


def seed_categories(client):
    client.post("/api/categories", json=CAT_A)
    client.post("/api/categories", json=CAT_B)


def test_list_is_empty_initially(client):
    response = client.get("/api/tasks")
    assert response.status_code == 200
    assert response.json() == []


def test_create_honours_client_supplied_id(client):
    payload = make_task()
    response = client.post("/api/tasks", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == payload["id"]
    assert body["name"] == "Buy milk"
    assert body["description"] == "2 litres"
    assert body["done"] is False
    assert body["pinned"] is False
    assert body["position"] == 0
    assert body["category"] == []
    assert body["date"] == "2026-01-01T09:00:00Z"
    assert body["deadline"] == "2026-01-05T18:00:00Z"


def test_create_duplicate_id_conflicts(client):
    client.post("/api/tasks", json=make_task())
    assert client.post("/api/tasks", json=make_task()).status_code == 409


def test_create_with_two_categories(client):
    seed_categories(client)
    payload = make_task(category=[{"id": CAT_A["id"]}, {"id": CAT_B["id"]}])

    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    assert sorted(c["id"] for c in response.json()["category"]) == sorted(
        [CAT_A["id"], CAT_B["id"]]
    )


def test_create_with_unknown_category_is_400(client):
    response = client.post("/api/tasks", json=make_task(category=[{"id": "ghost"}]))
    assert response.status_code == 400


def test_create_without_date_is_422(client):
    payload = make_task()
    del payload["date"]
    assert client.post("/api/tasks", json=payload).status_code == 422


def test_get_single(client):
    payload = make_task()
    client.post("/api/tasks", json=payload)

    response = client.get(f"/api/tasks/{payload['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Buy milk"


def test_get_missing_is_404(client):
    assert client.get("/api/tasks/nope").status_code == 404


def test_patch_is_partial(client):
    payload = make_task()
    client.post("/api/tasks", json=payload)

    response = client.patch(f"/api/tasks/{payload['id']}", json={"done": True})
    assert response.status_code == 200
    body = response.json()
    assert body["done"] is True
    assert body["name"] == "Buy milk"
    assert body["deadline"] == "2026-01-05T18:00:00Z"


def test_patch_missing_is_404(client):
    assert client.patch("/api/tasks/nope", json={"done": True}).status_code == 404


def test_patch_ignores_an_id_in_the_body(client):
    """The client sends its whole canonical payload, `id` included."""
    payload = make_task()
    client.post("/api/tasks", json=payload)

    response = client.patch(f"/api/tasks/{payload['id']}", json={**payload, "name": "Buy bread"})
    assert response.status_code == 200
    assert response.json()["id"] == payload["id"]
    assert response.json()["name"] == "Buy bread"


def test_patch_without_category_leaves_links_intact(client):
    seed_categories(client)
    payload = make_task(category=[{"id": CAT_A["id"]}])
    client.post("/api/tasks", json=payload)

    response = client.patch(f"/api/tasks/{payload['id']}", json={"name": "Buy oat milk"})
    assert response.status_code == 200
    assert [c["id"] for c in response.json()["category"]] == [CAT_A["id"]]


def test_patch_with_empty_category_clears_links(client):
    seed_categories(client)
    payload = make_task(category=[{"id": CAT_A["id"]}])
    client.post("/api/tasks", json=payload)

    response = client.patch(f"/api/tasks/{payload['id']}", json={"category": []})
    assert response.status_code == 200
    assert response.json()["category"] == []


def test_patch_replaces_the_whole_link_set(client):
    seed_categories(client)
    payload = make_task(category=[{"id": CAT_A["id"]}])
    client.post("/api/tasks", json=payload)

    response = client.patch(
        f"/api/tasks/{payload['id']}", json={"category": [{"id": CAT_B["id"]}]}
    )
    assert response.status_code == 200
    assert [c["id"] for c in response.json()["category"]] == [CAT_B["id"]]


def test_delete(client):
    payload = make_task()
    client.post("/api/tasks", json=payload)

    assert client.delete(f"/api/tasks/{payload['id']}").status_code == 204
    assert client.get(f"/api/tasks/{payload['id']}").status_code == 404


def test_delete_missing_is_404(client):
    assert client.delete("/api/tasks/nope").status_code == 404


def test_non_utc_offsets_come_back_normalised_to_z(client):
    """Regression test for the SQLite timezone round-trip.

    A test that only posts `Z` values passes even when the normalisation is
    missing, because SQLite drops the zone silently either way.
    """
    payload = make_task(
        date="2026-01-01T12:00:00+03:00",
        deadline="2026-01-05T21:00:00+03:00",
        lastSave="2026-01-01T13:00:00+03:00",
    )
    response = client.post("/api/tasks", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["date"] == "2026-01-01T09:00:00Z"
    assert body["deadline"] == "2026-01-05T18:00:00Z"
    assert body["lastSave"] == "2026-01-01T10:00:00Z"

    # And the same after a read-back, not just from the write-side echo.
    assert client.get(f"/api/tasks/{payload['id']}").json()["lastSave"] == "2026-01-01T10:00:00Z"
