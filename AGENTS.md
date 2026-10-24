# Repository identity

This is the personal repository `Kryophun/FarmFrenzy`. Use **only Kryophun**
for commit authorship, committers, pushes, and authenticated GitHub operations.
Never inherit another account from the machine's global configuration.

Before committing, verify the repository-local settings:

- `user.name`: `Kryophun`
- `user.email`: `42459481+Kryophun@users.noreply.github.com`
- `credential.https://github.com.username`: `Kryophun`
- Origin: `https://Kryophun@github.com/Kryophun/FarmFrenzy.git`

For GitHub CLI operations, use `.\scripts\github.ps1` instead of invoking `gh`
directly. It retrieves only the stored Kryophun credential, verifies the account
before running the requested command, and does not change global authentication.
It must fail rather than fall back to another account. Never print or commit tokens.

Make changes directly on `main`, commit completed changes, and push them.
Do not rewrite published history without the user's explicit authorization.
