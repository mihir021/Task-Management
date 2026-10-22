# MIHIR Workspace — Firestore Zero-Trust Security Specification (`security_spec.md`)

## 1. Master Source of Truth & Data Invariants
1. **Identity & Verified Email Invariant**: Every write operation across all collections (`/tasks/{taskId}`, `/workNotes/{noteId}`, `/timeEntries/{entryId}`, `/chatThreads/{threadId}`, `/chatThreads/{threadId}/messages/{messageId}`) requires an authenticated user (`request.auth != null`) with a verified Google email (`request.auth.token.email_verified == true`) and `incoming().ownerId == request.auth.uid`.
2. **Master Gate Relational Invariant (`/chatThreads/{threadId}/messages/{messageId}`)**: A `ChatMessage` cannot be created, read, updated, or deleted unless the parent document `/chatThreads/$(threadId)` exists AND `get(/databases/$(database)/documents/chatThreads/$(threadId)).data.ownerId == request.auth.uid`.
3. **Strict Key & Volumetric Boundary Invariant**: Every entity helper (`isValidWorkspaceTask`, `isValidWorkspaceNote`, `isValidWorkspaceTimeEntry`, `isValidChatThread`, `isValidChatMessage`) enforces `data.keys().hasAll(...)` and `data.keys().hasOnly(...)`, exact regex validation (`^[a-zA-Z0-9_\-]+$`) on IDs/codes, string `.size()` bounds matching `firebase-blueprint.json`, and bounded array guards (`tags.size() <= 10`).
4. **Temporal & Immutable Field Invariant**: On `create`, `createdAt == request.time && updatedAt == request.time`. On `update`, `ownerId` and `createdAt` are strictly immutable (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`) and `incoming().updatedAt == request.time`.
5. **Terminal State Locking Invariant**: Once any document reaches `status == 'Locked'`, no subsequent updates are permitted (`existing().status != 'Locked'`).
6. **Zero-Delegation List Query Invariant**: Every `allow list` rule enforces `isSignedIn() && isVerifiedUser() && resource.data.ownerId == request.auth.uid` without `get()` or `exists()` lookups.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on Task Create)**:
   ```json
   {
     "collection": "/tasks/task_001",
     "auth": { "uid": "attacker_uid", "email_verified": true },
     "payload": { "ownerId": "victim_uid", "taskCode": "MIHIR-001", "title": "Spoofed Task" }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`incoming().ownerId == request.auth.uid` fails).

2. **Payload 2 (Unverified Email Spoof Attack)**:
   ```json
   {
     "collection": "/tasks/task_001",
     "auth": { "uid": "user_1", "email": "rathodmihir1113@gmail.com", "email_verified": false },
     "payload": { "ownerId": "user_1", "taskCode": "MIHIR-001", "title": "Unverified Write" }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`request.auth.token.email_verified == true` fails).

3. **Payload 3 (Shadow Field / Ghost Property Injection)**:
   ```json
   {
     "collection": "/workNotes/note_001",
     "auth": { "uid": "user_1", "email_verified": true },
     "payload": {
       "ownerId": "user_1",
       "title": "Valid Note",
       "content": "Body",
       "relatedTaskCode": "MIHIR-001",
       "status": "Active",
       "isAdmin": true
     }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` rejects `isAdmin`).

4. **Payload 4 (Path Variable Poisoning — 2KB Junk Document ID)**:
   ```json
   {
     "collection": "/tasks/invalid$id!with*spaces_and_over_128_chars...",
     "auth": { "uid": "user_1", "email_verified": true }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`isValidId(taskId)` fails).

5. **Payload 5 (Orphaned Subcollection Write — Message Without Owned Parent Thread)**:
   ```json
   {
     "collection": "/chatThreads/nonexistent_thread/messages/msg_001",
     "auth": { "uid": "user_1", "email_verified": true },
     "payload": {
       "ownerId": "user_1",
       "threadId": "nonexistent_thread",
       "sender": "user",
       "text": "Hello",
       "modelUsed": "gemini-3.8-flash",
       "status": "Final"
     }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`exists()` and `get()` Master Gate on `/chatThreads/$(threadId)` fails).

6. **Payload 6 (Cross-Tenant Subcollection Hijack — Writing Message to Another User's Thread)**:
   ```json
   {
     "collection": "/chatThreads/victim_thread/messages/msg_002",
     "auth": { "uid": "attacker_uid", "email_verified": true },
     "payload": {
       "ownerId": "attacker_uid",
       "threadId": "victim_thread",
       "sender": "user",
       "text": "Injected prompt",
       "modelUsed": "gemini-3.8-flash",
       "status": "Final"
     }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`get(.../chatThreads/$(threadId)).data.ownerId == request.auth.uid` fails).

7. **Payload 7 (Terminal State Bypass — Updating a Locked Task)**:
   ```json
   {
     "collection": "/tasks/locked_task_01",
     "existingStatus": "Locked",
     "auth": { "uid": "user_1", "email_verified": true },
     "updatePayload": { "status": "In Progress" }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`existing().status != 'Locked'` fails).

8. **Payload 8 (Immortal Field Mutation — Changing `ownerId` or `createdAt` on Update)**:
   ```json
   {
     "collection": "/tasks/task_001",
     "auth": { "uid": "user_1", "email_verified": true },
     "updatePayload": { "ownerId": "user_2" }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`incoming().ownerId == existing().ownerId` and `affectedKeys().hasOnly(...)` fail).

9. **Payload 9 (Temporal Integrity Forgery — Backdating `createdAt` / `updatedAt`)**:
   ```json
   {
     "collection": "/timeEntries/entry_001",
     "auth": { "uid": "user_1", "email_verified": true },
     "payload": { "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "2020-01-01T00:00:00Z" }
   }
   ```
   - **Expected**: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

10. **Payload 10 (Unbounded Array Exhaustion — 50 Tags on Task)**:
    ```json
    {
      "collection": "/tasks/task_001",
      "auth": { "uid": "user_1", "email_verified": true },
      "payload": { "tags": ["t1","t2","t3","t4","t5","t6","t7","t8","t9","t10","t11"] }
    }
    ```
    - **Expected**: `PERMISSION_DENIED` (`data.tags.size() <= 10` fails).

11. **Payload 11 (Value Poisoning on Update — Invalid Enum or Oversized String)**:
    ```json
    {
      "collection": "/tasks/task_001",
      "auth": { "uid": "user_1", "email_verified": true },
      "updatePayload": { "status": "HACKED_STATUS" }
    }
    ```
    - **Expected**: `PERMISSION_DENIED` (`isValidWorkspaceTask(incoming())` rejects invalid status enum).

12. **Payload 12 (Blanket List Scraping Across Users)**:
    ```json
    {
      "operation": "list /tasks without where('ownerId', '==', auth.uid)",
      "auth": { "uid": "attacker_uid", "email_verified": true }
    }
    ```
    - **Expected**: `PERMISSION_DENIED` (`resource.data.ownerId == request.auth.uid` rejects cross-user list queries).
