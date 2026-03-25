# Exporting Results

Exports are available from the project view in the Admin Dashboard.

---

## Disentanglement — JSON

Each annotator's labels for each room are exported as a JSON file.

**Trigger:** Open the project → click **Export**.

**Output:** A ZIP archive containing one JSON file per annotator per room.

```json
{
  "project": "My Project",
  "room": "room-01",
  "annotator": "alice",
  "annotations": [
    { "turn_id": "T001", "thread_id": "A" },
    { "turn_id": "T002", "thread_id": "A" },
    { "turn_id": "T003", "thread_id": "B" }
  ]
}
```

---

## Adjacency Pairs — ZIP

Each annotator's links for each room are exported as a plain-text file, one directed edge per line.

**Trigger:** Open the project → click **Export**.

**Output:** A ZIP archive containing one `.txt` file per annotator per room.

```
T002,T001,Question - Response
T004,T001,Assessment - Agreement/Disagreement
```

Format: `<from_turn_id>,<to_turn_id>,<relation_type>` — one directed edge per line, no header row.

This format is the same as the import format, so exported files can be re-imported directly.

---

## IAA Matrix

The inter-annotator agreement matrix can be viewed in the **IAA** tab of the project and is included in the export package.

| Metric | Annotation type | Description |
|---|---|---|
| Macro-averaged F1 | Disentanglement | F1 per matched thread pair, averaged over all threads |
| LinkF1 × (α + (1−α) × TypeAcc) | Adjacency pairs | Structural agreement weighted with relation-type accuracy; α configurable per project |

See [Architecture — IAA](../development/architecture.md#iaa--metrics) for the formal definitions.
