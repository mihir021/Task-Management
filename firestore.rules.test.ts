import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

function loadRulesText(): string {
  if (fs.existsSync(rulesPath)) {
    return fs.readFileSync(rulesPath, 'utf-8');
  }
  return fs.readFileSync(draftRulesPath, 'utf-8');
}

test('Firestore rules enforce all Dirty Dozen security invariants', () => {
  const rules = loadRulesText();

  // 1. Default deny catch-all
  assert.equal(rules.includes('allow read, write: if false;'), true);

  // 2. Verified email requirement (blocks Payload 2: Unverified Email Spoof Attack)
  assert.equal(rules.includes('request.auth.token.email_verified == true'), true);

  // 3. Identity integrity (blocks Payload 1: Identity Spoofing)
  assert.equal(rules.includes('data.ownerId == request.auth.uid'), true);

  // 4. Strict key allowlisting (blocks Payload 3: Shadow Field Injection)
  assert.equal(rules.includes('data.keys().hasAll('), true);
  assert.equal(rules.includes('data.keys().hasOnly('), true);

  // 5. Path variable hardening (blocks Payload 4: Path Variable Poisoning)
  assert.equal(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"), true);

  // 6. Master Gate relational lookup on subcollection (blocks Payloads 5 & 6)
  assert.equal(
    rules.includes('exists(/databases/$(database)/documents/chatThreads/$(threadId))'),
    true
  );
  assert.equal(
    rules.includes(
      'get(/databases/$(database)/documents/chatThreads/$(threadId)).data.ownerId == request.auth.uid'
    ),
    true
  );

  // 7. Terminal State Locking (blocks Payload 7)
  assert.equal(rules.includes("existing().status != 'Locked'"), true);

  // 8. Immortal fields & Temporal Integrity (blocks Payloads 8 & 9)
  assert.equal(rules.includes('incoming().ownerId == existing().ownerId'), true);
  assert.equal(rules.includes('incoming().createdAt == existing().createdAt'), true);
  assert.equal(rules.includes('incoming().createdAt == request.time'), true);
  assert.equal(rules.includes('incoming().updatedAt == request.time'), true);

  // 9. Bounded Array Guarding (blocks Payload 10)
  assert.equal(rules.includes('data.tags.size() <= 10'), true);

  // 10. Action-Based Update with validation helper first (blocks Payload 11)
  assert.equal(rules.includes('isValidWorkspaceTask(incoming())'), true);
  assert.equal(rules.includes('incoming().diff(existing()).affectedKeys().hasOnly('), true);

  // 11. Zero-Delegation List Query Enforcer (blocks Payload 12)
  assert.equal(
    rules.includes('allow list: if isVerifiedUser() && resource.data.ownerId == request.auth.uid;'),
    true
  );
});
