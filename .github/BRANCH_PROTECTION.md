# Protecting the `main` branch

These are the exact steps to lock down `main` so outsiders — and accidental local pushes —
cannot change it directly. It takes about two minutes in the browser.

GitHub has two systems for this. **Rulesets** are the current one and are what these
instructions use. (Classic "Branch protection rules" still work and are noted at the end.)

---

## Part 1 — Protect the branch

1. Go to **https://github.com/Ahd-Aljadeed/class-scheduler/settings/rules**
   (or: repository → **Settings** → **Rules** → **Rulesets**).

2. Click **New ruleset** → **New branch ruleset**.

3. **Ruleset name:** `protect-main`

4. **Enforcement status:** switch from `Disabled` to **Active**.
   This is easy to miss — a ruleset left disabled does nothing.

5. **Bypass list:** leave it **empty**.
   Adding yourself here defeats the purpose; you can always disable the ruleset temporarily if
   you genuinely need to. (If you want a safety hatch, add `Repository admin` — but know that
   it means your own mistaken pushes are not blocked.)

6. Under **Target branches** → **Add target** → **Include default branch**.

7. Under **Rules**, tick these:

   | Rule | Why |
   |---|---|
   | **Restrict deletions** | Nobody can delete `main`. |
   | **Block force pushes** | Nobody can rewrite history and erase commits. |
   | **Require a pull request before merging** | All changes are reviewed as a PR. |
   | **Require linear history** | Keeps history readable; no merge-commit tangles. |

8. Expand **Require a pull request before merging** and set:

   - **Required approvals:** `1`
     *(Working solo? See the note below — this will block your own PRs.)*
   - **Dismiss stale pull request approvals when new commits are pushed** — ✅
     So an approval cannot be reused for code that changed after it.
   - **Require review from Code Owners** — ✅
     This activates the `.github/CODEOWNERS` file already in the repo.
   - **Require conversation resolution before merging** — ✅

9. Tick **Require status checks to pass**, then **Add checks** and search for `build`.

   > If nothing comes up, the check name is only registered after the workflow has run once on
   > a pull request. Open your first PR, let it run, then come back and add it.

   Also tick **Require branches to be up to date before merging**.

10. Click **Create**.

### If you are the only person working on this

GitHub does not let you approve your own pull request. With **Required approvals: 1** you will
open a PR and then be unable to merge it.

Pick one:

- **Set Required approvals to `0`.** You still get the PR workflow, the status checks and the
  protection against force-push and deletion — you just self-merge. This is the usual choice
  for a solo repo, and it is what the rest of this setup assumes.
- **Keep it at `1`** and add a collaborator who reviews.

You can raise it later without redoing anything else.

---

## Part 2 — Make the repository harder to change from outside

On a **public** repository, outsiders already cannot push — they can only fork and open a pull
request. The ruleset above is what stops a direct push to `main` by anyone with write access.
Two more things are worth setting:

1. **Settings → Actions → General → Fork pull request workflows**
   Set approval to **Require approval for all external contributors**, so a pull request from a
   stranger cannot run CI until you have looked at it.

2. **Settings → Collaborators**
   Confirm the list contains only people you intend to have write access.

---

## Part 3 — Turn on GitHub Pages

The deploy workflow is already in the repo, but it cannot publish until Pages is enabled:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
   Do **not** choose "Deploy from a branch" — that serves stale committed files instead of the
   CI build.
3. Push to `main` (or run the workflow manually from the **Actions** tab → *Deploy Vite site to
   Pages* → **Run workflow**).
4. The site appears at **https://ahd-aljadeed.github.io/class-scheduler/**

First deployment usually takes a couple of minutes.

---

## Verifying it worked

From a local clone, try to push to `main` directly:

```bash
git switch main
git commit --allow-empty -m "test protection"
git push origin main
```

You should be rejected with something like:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
```

Then undo the local test commit:

```bash
git reset --hard origin/main
```

---

## Using classic branch protection instead

If you prefer the older interface: **Settings → Branches → Add branch protection rule**,
branch name pattern `main`, then enable *Require a pull request before merging*, *Require
status checks to pass*, *Require linear history*, and leave *Allow force pushes* and *Allow
deletions* unchecked. Rulesets are recommended — they are additive, can target multiple
branches, and show you exactly which rule blocked a push.
