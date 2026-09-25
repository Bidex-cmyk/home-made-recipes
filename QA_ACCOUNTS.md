# QA Test Accounts (staging project only)

These accounts exist in the **staging** Firebase project (`home-made-recipe-c857f-staging`) only.
Their uids were previously hard-coded in `index.html` for messaging QA; that map was removed in
the P0 stabilization (application logic must not depend on hard-coded uids). To message a QA
account, paste its uid directly into **New Message → Recipient**.

| Account | UID |
|---|---|
| `qa_test_staging@example.com` | `V6DvhW8DeLTBirChuw6MstlkeHw2` |
| `qa_user_b@example.com` | `PJxKmNdGXqg7fZLrh3CanJzlEW93` |
| `test@example.com` | `IkO78KtDGYawSo2kOHzRJTABkKO2` |

Notes:
- These are throwaway QA identities in staging — never recreate them in production.
- Do not hard-code these uids back into application code.
- The `qa_user_b@example.com` placeholder text in the New Message modal was also removed;
  recipients are now entered as raw uids until a backend user-directory lookup exists.
