# Admin Walkthrough

This guide covers the full admin workflow: creating a project, importing a corpus, assigning annotators, and monitoring progress.

---

## 1. Log in as Admin

Navigate to the LACE frontend (default: `http://localhost:3721`) and log in with the admin credentials set in `.env`.

The **Admin Dashboard** opens automatically for admin accounts.

---

## 2. Create a Project

1. Click **New Project** in the dashboard.
2. Fill in the project name and an optional description.
3. Choose the **annotation type**:
    - **Disentanglement** — annotators group turns into threads.
    - **Adjacency Pairs** — annotators draw typed directed links between turns.
4. If you chose *Adjacency Pairs*, define the **relation types** (e.g. `question/answer`, `request/compliance`). These labels are presented to annotators as a dropdown when creating a link.
5. Click **Create**.

![Admin Dashboard](../screenshots/admin_dashboard.png)

---

## 3. Import a Corpus

Each CSV file becomes one **chat room** within the project.

1. Open the project and click **Import Chat Room**.
2. Select a CSV file. See [Data Format](../reference/data-format.md) for the expected structure.
3. LACE parses the file and shows a **row-level preview** — inspect it for malformed rows before committing.
4. Click **Confirm Import** to write the data to the database.

Repeat for each room you want to add to the project.

!!! tip
    A sample CSV is available at [`docs/sample_chat_room.csv`](../sample_chat_room.csv).

---

## 4. Assign Annotators

1. In the project view, go to the **Annotators** tab.
2. Select users from the list and click **Assign**.

Only assigned annotators can see and annotate the rooms in this project. Annotators see all rooms assigned to them across all their projects on their home screen.

!!! note
    Users must already have an account. Create annotator accounts from **Users → New User** in the admin panel.

---

## 5. Monitor Progress

The project view shows each chat room alongside a completion indicator per annotator. A room is marked complete when an annotator explicitly clicks **Mark as Complete** in the annotation interface.

The **Status** column in the chat-rooms table shows per-room progress (Completed / Partial / Insufficient data), together with how many annotators have finished and the average pairwise agreement at a glance.

---

## 6. Inspect Per-Turn Annotator Status

Click any room name in the project view to open the **Admin Room View**, which overlays annotator activity on every message turn:

- **Disentanglement projects** — each turn shows which annotators have assigned it to a thread and what thread ID they chose.
- **Adjacency-pair projects** — each turn shows which annotators have marked it as read (green badge) and which have not yet reviewed it.

This allows targeted feedback to annotators without needing to export data first.

---

## 7. Inter-Annotator Agreement

Once at least two annotators have annotated the same rooms, you can compute pairwise agreement:

1. Open the project and click the **IAA** (chart) icon next to a room.
2. A pairwise matrix is displayed.
   - **Disentanglement** — macro-averaged F1 after optimal thread alignment.
   - **Adjacency pairs** — Combined IAA = α × LinkF1 + (1 − α) × TypeAcc, where α=1 gives pure structural agreement (LinkF1) and α=0 gives pure label agreement (TypeAcc). Use the **Combined / Link F1 / Type Accuracy** toggle to inspect each sub-score independently.

![IAA Analysis](../screenshots/iaa_analysis.png)

### Adjusting α (adjacency-pair projects only)

The α weight (default **0.8**) is saved per project and affects the Combined IAA score.

1. On the IAA analysis page, find the **α parameter** editor.
2. Enter a value between 0.0 and 1.0 and click **Save α**.
3. The matrix recalculates immediately using the new weight.

Cells with low agreement are highlighted for targeted review.
