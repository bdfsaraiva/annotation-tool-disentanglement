"""
Seed script: creates a dummy adjacency-pairs project for IAA testing.

What it creates
───────────────
• Project  : "IAA Test (Adj Pairs)"
• Chat room: "Test Room Alpha"  (5 dummy turns)
• User 1   : annotator_alice  / Alice1234!
• User 2   : annotator_bob    / Bob12345!
• Both users assigned to the project
• Alice annotates 4 links, Bob annotates 4 links (3 shared, 2 type-matches)
• Both mark the room as completed  → IAA is computable

Run from the annotation-backend directory:
    python seed_test_adj_pairs.py
"""

import sys
import os

# Allow importing the app package
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app import models, crud, schemas
from app.auth import get_password_hash
from datetime import datetime

def main():
    db = SessionLocal()
    try:
        # ── Project ──────────────────────────────────────────────────────────
        project = db.query(models.Project).filter(
            models.Project.name == "IAA Test (Adj Pairs)"
        ).first()

        if not project:
            project = models.Project(
                name="IAA Test (Adj Pairs)",
                description="Dummy project to verify adjacency-pairs IAA layout.",
                annotation_type="adjacency_pairs",
                relation_types=["Question", "Answer", "Acknowledgement", "Request"],
                iaa_alpha=0.8,
            )
            db.add(project)
            db.commit()
            db.refresh(project)
            print(f"Created project #{project.id}: {project.name}")
        else:
            print(f"Re-using existing project #{project.id}")

        # ── Chat room ────────────────────────────────────────────────────────
        room = db.query(models.ChatRoom).filter(
            models.ChatRoom.project_id == project.id,
            models.ChatRoom.name == "Test Room Alpha",
        ).first()

        if not room:
            room = models.ChatRoom(
                name="Test Room Alpha",
                description="Auto-generated test room",
                project_id=project.id,
            )
            db.add(room)
            db.commit()
            db.refresh(room)
            print(f"Created chat room #{room.id}: {room.name}")
        else:
            print(f"Re-using existing chat room #{room.id}")

        # ── Messages ─────────────────────────────────────────────────────────
        turns = [
            ("T1", "userA", "Hey, can anyone help me with this error?"),
            ("T2", "userB", "Sure, what error are you seeing?"),
            ("T3", "userA", "It says 'undefined reference'."),
            ("T4", "userB", "That's a linker error. Check your includes."),
            ("T5", "userC", "Thanks, that fixed it!"),
        ]

        existing_turns = {
            m.turn_id: m
            for m in db.query(models.ChatMessage).filter(
                models.ChatMessage.chat_room_id == room.id
            ).all()
        }

        msg_map = {}  # turn_id -> ChatMessage
        for turn_id, user_id, text in turns:
            if turn_id not in existing_turns:
                msg = models.ChatMessage(
                    turn_id=turn_id, user_id=user_id, turn_text=text,
                    chat_room_id=room.id,
                )
                db.add(msg)
                db.commit()
                db.refresh(msg)
                msg_map[turn_id] = msg
            else:
                msg_map[turn_id] = existing_turns[turn_id]

        print(f"Messages: {list(msg_map.keys())}")

        # ── Users ─────────────────────────────────────────────────────────────
        def get_or_create_user(username, password):
            user = db.query(models.User).filter(models.User.username == username).first()
            if not user:
                user = models.User(
                    username=username,
                    hashed_password=get_password_hash(password),
                    is_admin=False,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"Created user #{user.id}: {username}")
            else:
                print(f"Re-using existing user #{user.id}: {username}")
            return user

        alice = get_or_create_user("annotator_alice", "Alice1234!")
        bob   = get_or_create_user("annotator_bob",   "Bob12345!")

        # ── Assign users to project ───────────────────────────────────────────
        for user in [alice, bob]:
            exists = db.query(models.ProjectAssignment).filter(
                models.ProjectAssignment.user_id == user.id,
                models.ProjectAssignment.project_id == project.id,
            ).first()
            if not exists:
                db.add(models.ProjectAssignment(user_id=user.id, project_id=project.id))
                db.commit()
                print(f"Assigned {user.username} to project")

        # ── Adjacency pairs ───────────────────────────────────────────────────
        # Alice: T1->T2 (Question), T2->T3 (Answer), T3->T4 (Question), T4->T5 (Answer)
        # Bob  : T1->T2 (Question), T2->T3 (Answer), T3->T4 (Answer),   T1->T5 (Acknowledgement)
        #
        # Agreed links (ignoring type): T1->T2, T2->T3, T3->T4  (3 links)
        # Type match on agreed links  : T1->T2 (Q==Q ✓), T2->T3 (A==A ✓), T3->T4 (Q≠A ✗)
        # TypeAcc = 2/3 ≈ 0.667
        # |LA|=4, |LB|=4, |LA∩LB|=3 → LinkF1 = 6/8 = 0.75
        # Combined IAA (α=0.8) = 0.75 × (0.8 + 0.2 × 0.667) ≈ 0.75 × 0.933 = 0.700

        alice_pairs = [
            (msg_map["T1"].id, msg_map["T2"].id, "Question"),
            (msg_map["T2"].id, msg_map["T3"].id, "Answer"),
            (msg_map["T3"].id, msg_map["T4"].id, "Question"),
            (msg_map["T4"].id, msg_map["T5"].id, "Answer"),
        ]
        bob_pairs = [
            (msg_map["T1"].id, msg_map["T2"].id, "Question"),
            (msg_map["T2"].id, msg_map["T3"].id, "Answer"),
            (msg_map["T3"].id, msg_map["T4"].id, "Answer"),
            (msg_map["T1"].id, msg_map["T5"].id, "Acknowledgement"),
        ]

        def upsert_pairs(user, pairs):
            now = datetime.utcnow()
            for from_id, to_id, rel_type in pairs:
                existing = db.query(models.AdjacencyPair).filter(
                    models.AdjacencyPair.from_message_id == from_id,
                    models.AdjacencyPair.to_message_id == to_id,
                    models.AdjacencyPair.annotator_id == user.id,
                ).first()
                if existing:
                    existing.relation_type = rel_type
                    existing.updated_at = now
                else:
                    db.add(models.AdjacencyPair(
                        from_message_id=from_id,
                        to_message_id=to_id,
                        annotator_id=user.id,
                        project_id=project.id,
                        relation_type=rel_type,
                        created_at=now,
                    ))
            db.commit()
            print(f"Upserted {len(pairs)} pairs for {user.username}")

        upsert_pairs(alice, alice_pairs)
        upsert_pairs(bob,   bob_pairs)

        # ── Mark rooms as completed ───────────────────────────────────────────
        for user in [alice, bob]:
            completion = db.query(models.ChatRoomCompletion).filter(
                models.ChatRoomCompletion.chat_room_id == room.id,
                models.ChatRoomCompletion.annotator_id == user.id,
            ).first()
            if completion:
                completion.is_completed = True
                completion.updated_at = datetime.utcnow()
            else:
                db.add(models.ChatRoomCompletion(
                    chat_room_id=room.id,
                    annotator_id=user.id,
                    project_id=project.id,
                    is_completed=True,
                    created_at=datetime.utcnow(),
                ))
            db.commit()
            print(f"Marked {user.username} as completed in room")

        sep = "=" * 60
        print()
        print(sep)
        print("Seed complete!")
        print(f"  Project ID : {project.id}")
        print(f"  Room ID    : {room.id}")
        print(f"  Alice ID   : {alice.id}  (annotator_alice / Alice1234!)")
        print(f"  Bob ID     : {bob.id}    (annotator_bob   / Bob12345!)")
        print()
        print("Expected IAA (alpha=0.8):")
        print("  Link F1      = 0.750")
        print("  Type Acc     = 0.667  (on 3 agreed links)")
        print("  Combined IAA = 0.700")
        print(sep)

    finally:
        db.close()

if __name__ == "__main__":
    main()
