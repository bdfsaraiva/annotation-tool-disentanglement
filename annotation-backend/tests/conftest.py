import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure test DB is used before importing app modules.
os.environ["DATABASE_URL"] = "sqlite:///./test_backend.db"
os.environ["SECRET_KEY"] = "test-secret-key-32chars-minimum-123456"
os.environ["FIRST_ADMIN_USERNAME"] = "test_admin"
os.environ["FIRST_ADMIN_PASSWORD"] = "test_admin_pass"
os.environ["PASSWORD_MIN_LENGTH"] = "4"
os.environ["PASSWORD_REQUIRE_DIGIT"] = "false"
os.environ["PASSWORD_REQUIRE_LETTER"] = "false"
os.environ["AUTH_RATE_LIMIT_REQUESTS"] = "1000000"
os.environ["AUTH_RATE_LIMIT_WINDOW_SECONDS"] = "1"

from app.main import app
from app import models
from app.database import get_db as database_get_db
from app import dependencies as dependencies_module
from app.auth import get_password_hash

TEST_DB_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    TEST_DB_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db_session():
    models.Base.metadata.drop_all(bind=engine, checkfirst=True)
    models.Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        models.Base.metadata.drop_all(bind=engine, checkfirst=True)


@pytest.fixture(scope="function")
def client(db_session):
    # Disable startup side effects for tests.
    app.router.on_startup = []

    app.dependency_overrides[database_get_db] = override_get_db
    app.dependency_overrides[dependencies_module.get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def create_user(db, username, password="pass", is_admin=False):
    user = models.User(
        username=username,
        hashed_password=get_password_hash(password),
        is_admin=is_admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_project(db, name="proj", annotation_type="disentanglement", relation_types=None):
    if relation_types is None:
        relation_types = []
    project = models.Project(
        name=name,
        description="desc",
        annotation_type=annotation_type,
        relation_types=relation_types
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def create_chat_room(db, project_id, name="room"):
    room = models.ChatRoom(name=name, project_id=project_id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def create_message(db, chat_room_id, turn_id, user_id="u1", text="hello", reply_to_turn=None):
    message = models.ChatMessage(
        turn_id=str(turn_id),
        user_id=str(user_id),
        turn_text=text,
        reply_to_turn=reply_to_turn,
        chat_room_id=chat_room_id
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def assign_user(db, user_id, project_id):
    assignment = models.ProjectAssignment(user_id=user_id, project_id=project_id)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def create_annotation(db, message_id, annotator_id, project_id, thread_id="T1"):
    annotation = models.Annotation(
        message_id=message_id,
        annotator_id=annotator_id,
        project_id=project_id,
        thread_id=thread_id
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


def create_pair(db, from_message_id, to_message_id, annotator_id, project_id, relation_type="rel"):
    pair = models.AdjacencyPair(
        from_message_id=from_message_id,
        to_message_id=to_message_id,
        annotator_id=annotator_id,
        project_id=project_id,
        relation_type=relation_type
    )
    db.add(pair)
    db.commit()
    db.refresh(pair)
    return pair


def auth_headers(client, username, password):
    response = client.post(
        "/auth/token",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
