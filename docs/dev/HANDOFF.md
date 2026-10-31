# Handoff notes

Each Claude Code session ends a task with `/handoff`, which adds a note at the **top** of this file (`docs/dev/HANDOFF.md`). Each session starts with `/sync`, which pulls and reads the newest notes. Keep the 20 most recent entries; git history keeps older ones.

Notes are public. Write about the code, never about people: no names, emails, machine owners, or credentials.

Entry format:

```
## <YYYY-MM-DD> · <machine role> (<platform>) · <branch>
**Changed:** what was done, with the commit range.
**Found:** anything learned that others need (bugs, surprises, flaky tests).
**Checked:** what was run and the result (be exact; say what was not run).
**Next platform must check:** concrete steps for the other machines, or "nothing".
**Open:** unfinished work or questions for the user.
```

---

## 2026-10-31 · lead (macOS, Apple silicon) · main
**Changed:** v1.2.3 was published as a pre-release from `600a19c` at the user's request (1.2.0 stays Latest), and development moved on to 1.2.4.
- The + at the end of the section tabs stays in view however many sections there are. It is pinned to the strip's right end, and tabs scroll beneath it.
- A clicked, newly opened, or tabbed-to tab is brought clear of the + (`reveal` in `SectionTabs.tsx`).
- The strip no longer shows a stray vertical scroll bar, which 1.2.2 showed wherever scroll bars are always shown.
- Details are in the 1.2.3 section of `DEVELOPMENT_PLAN.md`; the Chromium lessons are in `PLATFORM_NOTES.md` (Everywhere).

**Found:** Two independent reviews of the change confirmed eleven problems, and all were fixed:
- scrolling back after renaming another tab;
- a double-click landing on the wrong tab;
- Tab focus left beneath the +;
- the strip jumping when the window regains focus;
- a 1 px vertical scroll;
- a stale scroll position when switching notebooks;
- smaller layout and test-timing points.

This Mac's test windows use always-shown scroll bars, which is how the vertical scroll bar was found.

**Checked:**
- Mac: type check, 104 unit tests, and every end-to-end suite, three full runs.
- Each new check in phase 1's step 10 fails without its fix, and the 1.2.2 component fails the first one.
- Screenshots of the strip from 1.2.2 and 1.2.3, with three sections and with none, match pixel for pixel apart from the removed scroll bar.
- GitHub's macOS and Windows tests passed, including the new step, as did the release build. `releases/latest` still opens v1.2.0.

**Next platform must check:** Windows: install `PageBinder-Setup-1.2.3.exe` from the v1.2.3 pre-release.
- In a notebook with many sections, the + stays at the right end.
- Adding a section with it shows the new tab.
- No vertical scroll bar appears in the tab strip.
- The Tab key moves through the tabs.
- The spelling checks listed for 1.2.2 below still apply.

**Open:** The Windows hand tests above. The dev app started for the user could not open their last notebook, because their own PageBinder window had it open.

## 2026-10-27 · lead (macOS, Apple silicon) · main
**Changed:** At the user's request, `fix/windows-spelling` was merged into `main` (fast-forward to `6fa0a44`) and v1.2.2 was published as a pre-release from `1402db1` (1.2.0 stays Latest), so the user can try Windows spelling by hand on a second Windows computer. Development moved on to 1.2.3. While `WINDOWS_SPELLING_PENDING` is true, `scripts/e2e-spelling.ts` prints a warning instead of failing when Windows offers no suggestion; macOS stays strict. The `fix/windows-spelling` branch was deleted.
**Found:** GitHub's Windows run still offers no suggestion. The browser's report of the test's right-click names no misspelled word (`word: ''`, no suggestions), although "recieve" is underlined (20 red pixels) and selected. Whether a real right-click by hand does better is not known yet. On this Mac, two full end-to-end runs each failed once, at different steps: spelling ("recieve" not found on the page) and phase 6 (the rubber band selected nothing). Both suites passed every time on their own and in a third full run. The spelling failure now prints the page's text.
**Checked:** Mac: type check, 104 unit tests, and every end-to-end suite (the third full run passed). The release build of `1402db1` passed on macOS and Windows, and `releases/latest` still opens v1.2.0.
**Next platform must check:** Windows (the user's second computer): install `PageBinder-Setup-1.2.2.exe` from the v1.2.2 pre-release and run the checks in the Windows entry below:
- right-click "recieve" once it is underlined;
- up to five suggestions in bold, and choosing one replaces the word;
- Add to dictionary;
- a correctly spelled word gets the usual menu;
- an underlined word in a table cell.
If suggestions appear by hand, find a way for the automated run to see them too before setting `WINDOWS_SPELLING_PENDING` to false. If they do not appear, a possible fallback (needs the user's go-ahead) is to turn off Chromium's `WinUseBrowserSpellChecker` feature, so the page's own Hunspell dictionaries check spelling and `webFrame` can answer as on macOS.
**Open:** The Windows hand test of 1.2.2.

## 2026-10-27 · platform (Windows x64) · fix/windows-spelling
**Changed:** Spelling suggestions on right-click now reach the menu on Windows, where 1.2.1 never showed any (this commit). On Windows a text box lets a right-click on its text go on to the browser (`spellingFromRightClick` in `spelling.ts`); the main process passes the word and suggestions from Electron's `context-menu` event to the window (`spell:misspelling`, preload `spell.onMisspelling`), and `Canvas` adds them to the top of the menu already open for that text box when the reported word is the one under the pointer (`misspellingFromReport`). macOS is unchanged. `scripts/e2e-spelling.ts` now runs its spelling steps on Windows. Also `PLATFORM_NOTES.md` (Windows, Spelling) and the 1.2.2 sections of `DEVELOPMENT_PLAN.md` and `REVISION_LOG.txt`.
**Found:** The cause, from the Electron and Chromium sources: on Windows the red underline comes from Windows' own spelling checker in the browser process, while `webFrame.isWordMisspelled` and `getWordSuggestions` ask only the page's Hunspell dictionaries, which Chromium switches off for every language Windows checks (`SpellCheck::SpellCheckWord` then finds no enabled language and calls every word correct). Electron's own tests of these calls do not run on Windows. Electron patches Chromium (`fix_win32_synchronous_spellcheck.patch`) so that Windows' suggestions travel with each underline into the `context-menu` event's `misspelledWord` and `dictionarySuggestions`, but that event fires only when the page does not cancel `contextmenu`. CI did not catch this: `e2e-spelling.ts` took a false `isWordMisspelled('recieve')` to mean "no dictionary" and skipped. On Windows, Chromium selects an underlined word when it is right-clicked; the menu works the same either way.
**Checked:** Nothing ran on this machine: it has no Node.js, so the type check, unit tests, and end-to-end suites did not run here, and the changes were checked by reading only. The CI run on this push is their first run, and its Windows end-to-end run now goes through the right-click path. The app was not tried by hand here.
**Next platform must check:** Windows, once CI passes: install the Windows installer from this branch's CI run, type a misspelled word such as "recieve" in a text box, and right-click it once it is underlined: up to five suggestions in bold at the top, choosing one replaces the word, and Add to dictionary removes the underline. Also right-click a correctly spelled word (the usual menu) and an underlined word in a table cell. macOS: nothing should change; the macOS end-to-end run covers it.
**Open:** Merge into `main` after CI passes and the user has tried it.

## 2026-10-25 · lead (macOS, Apple silicon) · main
**Changed:** v1.2.1 was published as a pre-release at the user's request, from `cbed23c` (its revision-log section dated, and the draft rebuilt from that commit first); 1.2.0 stays the Latest full release. Development moved on to 1.2.2. The compatibility rule was replaced: each release must be fully compatible with the previous one, new features included, and any upgrade a feature needs is built in, offered when an old notebook is opened, and written as a new notebook with the version in its name (see `CLAUDE.md`).
**Found:** Nothing new.
**Checked:** The release build of `cbed23c` passed on macOS and Windows; `releases/latest` still opens v1.2.0.
**Next platform must check:** Windows: install `PageBinder-Setup-1.2.1.exe` from the v1.2.1 pre-release and run the checks in the earlier 1.2.1 notes below.
**Open:** Nothing.

## 2026-10-25 · lead (macOS, Apple silicon) · main
**Changed:** 1.2.1 work: a page made from a template is named after its first line of text and follows it until it is renamed by hand (new optional page field `titleSource`; see the 1.2.1 section of DEVELOPMENT_PLAN.md). Requests that name a page folder a save has just moved are followed to it (`livePage` in `ipc.ts`), and a page keeps its place in the list when a save moves its folder. The v1.2.1 draft was rebuilt from this work at the user's request.
**Found:** The user found two bugs while testing. Clicking a page's name after editing its first line failed, because the click saved the page (moving its folder) and then opened the old folder. The page also jumped to the top of the list, because the index re-added it with no place. Both are fixed, with end-to-end checks shown to fail without the fixes. `npm run dev` reopens its window on every main-process edit; the user wants it on the second display (`PAGEBINDER_TEST_DISPLAY=2 npm run dev`).
**Checked:** Type check, 104 unit tests, and every end-to-end suite (149 s). The user tried the feature and both fixes in the running app.
**Next platform must check:** Windows, from the rebuilt v1.2.1 draft: make a page from a template; it is named after its first line, with no naming step. Edit that line (the name changes in the list), click the page's name (no error, and it keeps its place), then rename it by hand (the name then stays, whatever the line says). Also the spelling and recent-notebook checks in the 2026-10-20 note.
**Open:** v1.2.1 is a draft only.

## 2026-10-20 · lead (macOS, Apple silicon) · main
**Changed:** 1.2.1 work: spelling suggestions on right-click (up to five, in bold, then Add to dictionary) and *Open in Finder/Explorer* plus *Remove from this list* on a recent notebook's right-click menu on the start screen. Built as the v1.2.1 draft at the user's request, for testing on Windows.
**Found:** Electron's `context-menu` event reported no misspelled word on macOS when tried, but `webFrame.isWordMisspelled` and `getWordSuggestions` use the system checker and work; the app uses those. macOS does not flag every typo (it accepts "Teh").
**Checked:** Type check, 96 unit tests, and every end-to-end suite (142 s), including the new `scripts/e2e-spelling.ts`. The user tried both features in the running app on the Mac.
**Next platform must check:** Windows, from the v1.2.1 draft's installer: right-click a red-underlined word (for example "recieve") in a text box; suggestions appear first, choosing one replaces the word, Add to dictionary removes the underline. On the start screen, right-click a recent notebook: *Open in Explorer* opens its folder, *Remove from this list* removes it. Before working on Windows, update that clone as the 2026-10-15 note says.
**Open:** v1.2.1 is a draft only.

## 2026-10-15 · lead (macOS, Apple silicon) · main
**Changed:** At the user's request (a strict rule: nothing on GitHub may contain personal information), the whole history was rewritten and force-pushed. One commit message that named the owner was cleaned, and every commit and tag now records UTC instead of the local time zone. The files in every commit are unchanged. All commit IDs changed; every tag, the published v1.2.0 included, was moved to its rewritten commit, and these notes quote the new IDs. `CLAUDE.md`, `DECISIONS.md`, and `/handoff` now carry the rule: commit and tag with `TZ=UTC`, and check commit messages and image or document metadata before pushing. The lead Mac's clone has a local pre-push hook that refuses anything else.
**Found:** An audit of everything on GitHub found only that one name and the time zones: every commit and its message, every tag, every file in every version, the metadata of every image and document, all releases and their notes, the profile, the public activity feed, and the Actions runs. GitHub can still show the old commits at their direct links until it cleans up; the account owner can ask GitHub Support to purge them.
**Checked:** All 107 rewritten commits have the same files, authors, and times as before, and each tag points at the rewritten twin of its old commit. The macOS and Windows run started by this push checks the new main.
**Next platform must check:** Every other clone must start again from GitHub: save any unpushed work elsewhere, then `git fetch origin --tags --force` and `git reset --hard origin/main` (or clone afresh). From now on, commit and tag with `TZ=UTC`.
**Open:** The GitHub Support purge of the old commits, which only the account owner can request.

## 2026-10-13 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.2.0 was published as the first full release (Latest, not a pre-release) from `afd859f`, at the user's request. Its notes are brief: one sentence, the three downloads, and the install pointer. The revision log now starts at 1.2.0 (the earlier sections were removed; git history keeps them). The pre-release mark was cleared on the v1.1.0 to v1.1.3 drafts, so every earlier release, v1.1.0 to v1.1.5, is a plain draft. The version moved on to 1.2.1, with its revision-log section started. Also: the future-features list no longer keeps ideas for compatibility with older versions (the user's decision).
**Found:** Nothing new.
**Checked:** Type check and 96 unit tests locally. The release build and the full macOS and Windows run on `afd859f` both passed. `releases/latest` now opens v1.2.0.
**Next platform must check:** Windows: first the remote and email update from the note below, then install `PageBinder-Setup-1.2.0.exe` from the release and check it starts (and asks Keep or Start fresh when earlier settings exist).
**Open:** Nothing.

## 2026-10-13 · lead (macOS, Apple silicon) · main
**Changed:** The user renamed the GitHub account from PageBinder to sovnode (the same account, number 4245724), so the repository is now `sovnode/PageBinder`. The README's download and clone links, the commit email in `CLAUDE.md`, `DECISIONS.md`, `/handoff`, and `tag.yml` (now `4245724+sovnode@users.noreply.github.com`; the author name stays PageBinder), and the v1.1.5 draft's README link point at the new name. This clone's `origin` is `https://github.com/sovnode/PageBinder.git`.
**Found:** GitHub redirects the old repository links and pushes until someone else takes the name PageBinder and makes a repository called PageBinder. Commits made with the old ID-based noreply address stay linked to the account. The v1.1.0 to v1.1.4 drafts' notes still link to the old README address (it redirects); they were left as they are.
**Checked:** No app code changed. `git ls-remote` through the new remote; the macOS and Windows run on this push checks the workflows.
**Next platform must check:** On every other machine, before anything else: `git remote set-url origin https://github.com/sovnode/PageBinder.git` and `git config user.email 4245724+sovnode@users.noreply.github.com` in the clone, and update its `CLAUDE.local.md`.
**Open:** `gh auth status` still labels the account PageBinder until the next `gh auth login`; the token works.

## 2026-10-13 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.5, at the user's request, built as a new draft release so the v1.1.4 draft (from `bcf2d50`) stays as it was. The revision log and the development plan give 1.1.4 its own draft notes and list everything after it under 1.1.5. The GitHub workflows now use the Node.js 24 versions of their steps: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, and `actions/download-artifact@v8`.
**Found:** GitHub warned that the v4 steps target the retired Node.js 20. The newer versions' breaking changes do not touch the inputs these workflows use.
**Checked:** Type check and 96 unit tests locally. The macOS and Windows run on this push checks the new steps before the v1.1.5 tag is pushed; `release.yml` then builds the draft.
**Next platform must check:** Windows: install the v1.1.5 draft's installer and try the Templates notebook (the steps in the previous note).
**Open:** v1.1.4 and v1.1.5 are drafts, and nothing is public.

## 2026-10-13 · lead (macOS, Apple silicon) · main
**Changed:** 1.1.4 work, commits `675c3cd..19d6355` and this note. Select several pages (Ctrl/Cmd-click, Shift-click) and cut, copy, paste, or delete them together, each as one undo step; Cut moves pages; selected rows stay highlighted under the pointer. The Templates notebook is now an ordinary notebook in the settings folder (`Templates notebook`), so sections, groups, undo, the recycle folder, search, Page History, Properties, Export, and Verify all work there. Save as Template copies the page, attachments included, into a chosen section; section defaults are `template:<page id>`. Templates and defaults from earlier versions are not carried over (the user waived the compatibility rule for templates only; see DECISIONS.md). Copied pages, pictures, and files paste into another notebook (the source must be the Templates notebook or in Recent). At the user's confirmed request, the v1.1.0 to v1.1.3 pre-releases were turned into drafts (notes, installers, and tags kept); nothing is public now.
**Found:** Search lost a page's text after it was moved, pasted, or restored from the recycle folder: the section refresh records only where a page is, and the folder check skips unchanged files. Fixed with `indexArrivedPage` in `ipc.ts`. Paste page here had been offered in another notebook since 1.1.0 but always failed; it works now. GitHub's `releases/latest` link, used by the README, only finds full releases, so it already led to the Releases list, which is now empty for the public.
**Checked:** Type check; 96 unit tests; every end-to-end suite (140 s). Phase 6 adds a search check for a pasted and restored page; phase 6b is rewritten for the Templates notebook (11 steps). The user tried it in the running app.
**Next platform must check:** Windows: open Templates from the start screen (one section, General) and add a section; Save as Template from a notebook page (it asks for the section when there are several); in a notebook, the + menu lists templates under section headings, and a page made from one has its pictures and files; copy a page and a picture in a notebook and paste both into the Templates notebook; search finds a page's text after it is cut and pasted.
**Open:** The v1.1.4 draft (tag at `bcf2d50`) predates this work; rebuild it only when the user asks. Bringing in templates from earlier versions is listed in FUTURE_FEATURES.md.

## 2026-10-03 · lead (macOS, Apple silicon) · main
**Changed:** 1.1.4 work: pictures show on template pages in the Templates notebook (the `pagebinder://` handler now serves `@global/…` and `@nb/…` paths with no regular notebook open). Pushed with a v1.1.4 draft release at the user's request.
**Found:** The Templates notebook is reached through the Welcome screen, which closes the regular notebook; every picture request was refused in that state.
**Checked:** Type check; 94 unit tests; every end-to-end suite (137 s). Phase 6b now checks pictures on a template page, in its text box, inserted while editing, and on a page made from the template. The user tried it in the running app.
**Next platform must check:** Windows: save a page with a picture as a template, open it in the Templates notebook, and check the picture shows.
**Also changed:** Templates are global only (the user's decision with explicit permission under the compatibility rule): no library choice in Save as Template, only Global templates in the Templates notebook and menus, and section defaults naming old notebook-only templates are ignored. The v1.1.4 draft was rebuilt with it.
**Next platform must check (also):** Windows: Save as Template asks only for a name; the Templates notebook shows only Global templates.
**Open:** v1.1.4 stays a draft until the user says to publish.

## 2026-10-02 · lead (macOS, Apple silicon) · main
**Changed:** End-to-end tests save through File > Save's command (`saveViaMenu`, `app/scripts/e2e-save.ts`) instead of pressing Cmd/Ctrl+S, which tests cannot deliver to a menu shortcut; every save had been waiting for the 20-second autosave. `e2e.ts` checks the Save shortcut by reading the File menu. This is step 1 of a local build plan the user asked for (build and test Mac and Windows on the lead Mac, GitHub private, no Actions minutes; the plan itself is an artifact in the lead session, not in the repository).
**Found:** The processor sat idle 97% of the test time. Full local end-to-end run: about 21 minutes before, 133–137 seconds after (phase 8: 7.5–8.7 minutes to 40 seconds). Faster tests exposed one hidden race: Insert signature fills in its text a moment after the click, so the step now waits for it before saving.
**Checked:** Type check; 94 unit tests; every end-to-end suite three times in a row on this Mac, all passing.
**Next platform must check:** The next GitHub run (or the Windows PC) should show the Windows suites finishing in a few minutes instead of about 25; report any suite that now fails on Windows, since shorter waits can expose platform timing differences.
**Also changed:** File menu: "Export This Page as PDF…" removed (Print Preview's Save as PDF and Export Notebook's "This page" cover it), and "Export Pages…" renamed "Export Notebook…" (same dialog and shortcut); `e2e.ts` checks both. The v1.1.3 draft was rebuilt from this commit at the user's request.
**Next platform must check (also):** Windows: the File menu shows Export Notebook… (Ctrl+Shift+E) and no Export This Page as PDF….
**Open:** Plan steps 2 to 6 (free disk space, Windows 11 VM, local check and release commands, GitHub manual then private, optional self-hosted runners) wait for the user.

## 2026-10-01 · lead (macOS, Apple silicon) · main (later)
**Changed:** Page border and grid are saved with each page (`pageBorder`, `pageGrid`, optional); View > Toggle Page Border and Toggle Grid change only the open page; with the border off the editor shows one endless canvas (no sheet-break gaps), while printing is unchanged; templates carry both settings. The v1.1.3 draft was rebuilt from this commit at the user's request.
**Found:** Nothing new.
**Checked:** Type check; 94 unit tests; every end-to-end suite on this Mac (phase 5 needed a rerun after a one-off closed window).
**Next platform must check:** Windows, in addition to the earlier note: on a page with text past the first sheet, turn the border off (the gap closes, text runs on), turn the grid on, switch pages and back (each page keeps its own); Print Preview still shows separate sheets; a page made from a borderless template starts borderless.
**Open:** v1.1.3 stays a draft until the user says to publish.

## 2026-10-01 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.3 work so far, pushed with a draft release (v1.1.3, not published): Paste picture on a text box's right-click menu; File > Export Pages > "Web page with attachments (.zip)" writes one shareable zip (HTML plus every picture and attachment, relative links; `exportHtmlPackage` in `app/src/main/export.ts`, new dependency `fflate`); the Export dialog explains each format and its drop-downs fit. Future features: infinite canvas with the page border off, and border and grid stored per page (decisions recorded).
**Found:** The installed 1.1.2 on the lead Mac was the Intel build (`-x64.dmg`) running under Rosetta, which caused macOS's "will not open in macOS 28" warning; the release log shows both Mac installers were built from the right app.
**Checked:** Type check; 93 unit tests; every end-to-end suite on this Mac.
**Next platform must check:** Windows (the user continues there on a `fix/windows-…` branch): the user suspects problems with cut, paste, and undo when moving pictures in and out of text boxes; also try Export Pages > Web page on Windows, unzip the result, and open the HTML (pictures shown, attachment cards open their files). When the Windows work is merged, the v1.1.3 draft is rebuilt from the new commit by moving the v1.1.3 tag (a draft only; ask the user before moving or deleting any tag).
**Open:** v1.1.3 is a draft; not to be published until the user says so.

## 2026-09-30 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.2, published as a pre-release: Outlook email bodies stored only as HTML or compressed RTF are searchable (index version 5, so every notebook re-indexes once); new pages start with a title block (name in bold 20 px, creation date and time); format painter; the last notebook and page reopen at start (remembered in the app's settings); small remove button on recent notebooks; narrow margins for new notebooks only; the page.html backup and Page History show the whole canvas while printing and Print Preview use the sheets; cut and paste moves pictures between the page and text boxes, and page objects can be cut; File > Notebook Properties (last edit with the account name, now recorded as `modifiedBy` on each save; size and files; history; large attachments); Verify Notebook explains its checks, buttons, and findings.
**Found:** Opening a page must not wait on the settings write (it made a quick undo and redo race), but quitting must: on Windows CI a quit right after opening a page lost the remembered page, so `before-quit` now waits for pending writes (`recentWritesPending` in `recent.ts`); the platforms test now expects the last notebook to reopen at start; page picture objects are not listed in `manifest.images` (existing quirk, worked around when pasting into a box); a test's Cmd+V does not trigger the Edit menu's paste, so phase 8 dispatches the paste event itself.
**Checked:** Type check; 92 unit tests; every end-to-end suite on this Mac. The user tried each feature in the running app.
**Next platform must check:** Windows: install PageBinder-Setup-1.1.2.exe; drag an Outlook email onto a page and search for a word from its body (the HTML/RTF fix has only unit tests); check Notebook Properties shows the Windows account name; open a page.html backup in a browser (whole canvas) and print it (sheets only); cut a picture on the page and paste it into a text box.
**Open:** Nothing.

## 2026-09-29 · lead (macOS, Apple silicon) · main
**Changed:** Since the last note: pictures in text boxes resize from any corner and also arrive by drop, paste, or Insert > Picture while the cursor is in a box; four alignment buttons with drawn symbols (Justify added, no selected highlight); a click outside a text box clears its highlight; heading buttons and shortcuts removed (the heading node stays for existing pages; `@tiptap/extension-heading` is now a direct dependency). At the user's explicit, confirmed request the published v1.1.1 pre-release was deleted and rebuilt from this code as 1.1.1, with the 1.1.1 and 1.1.2 revision-log sections merged; the version then moves to 1.1.2.
**Found:** A copy of the old 1.1.1 (28 September build) may exist on some machines under the same number. It does not know pictures in text boxes: do not edit such pages with it.
**Checked:** Type check; unit tests; every end-to-end suite after the highlight fix. The heading removal was checked by the user in the running app; its phase 2 test change has not been run yet.
**Next platform must check:** Windows: install the new PageBinder-Setup-1.1.1.exe; check the alignment buttons, that no heading buttons show, and that a page with pictures in a text box prints as shown.
**Open:** Nothing. Afterwards the phase 8 picture step failed on the GitHub macOS runner only: its smaller screen left the text box's move bar under the toolbar, so the drag missed it. The test now hovers the bar into view, checks it is uncovered, and measures the picture relative to the box (commits `109bbfc`, `23f30a4`). CI passes on macOS and Windows, and phase 2 passes locally with the heading change.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Word wrap reworked after the user's testing: pictures are now anchored in a text box (the box's `pictures` list) at a spot the user chooses, a fixed pixel size, text flowing down beside them. Drag to move, corner to resize, Delete to remove, Insert picture at the right-clicked spot. Shared float layout in `app/src/shared/render/anchoredPictures.ts`, editor widgets in `app/src/renderer/src/anchoredPicturesView.ts`. New standing rule: the user tests new features before anything is pushed (`CLAUDE.md`).
**Found:** The first version (a picture inside a line) resized with the box, could not be placed freely, and wrapped in line rather than beside the text.
**Checked:** Type check; 78 unit tests (new: float layout); phase 8's rewritten picture step (placed at the click, three or more lines beside it, corner resize keeps shape, box resize keeps its size, drag lands exactly, moves with the box, same spot in page.html, copied to another page with its file, Delete) and every other suite. Waiting for the user's hands-on test before pushing.
**Next platform must check:** After approval: Windows, insert and drag a picture in a text box and compare with Print Preview.
**Open:** Text flows down one side of a picture only.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** New rule: once a version is released, development moves to the next number immediately. The version is now 1.1.2 (in development); the revision log and development plan sections for pictures in text are headed 1.1.2.
**Found:** Nothing new.
**Checked:** Version fields in `package.json` and `package-lock.json`.
**Next platform must check:** Nothing.
**Open:** Unchanged.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Pictures inside text (word wrap option 1): Insert picture… in a text box's right-click menu; Wrap (in line, left, right), Size (25, 50, 75, 100 per cent), and Remove picture on a picture's right-click menu. Stored as a `textImage` node naming a file in the page's images folder, listed in the manifest. Page breaks count an in-line picture as part of its line. The app keeps its own manifest when the canvas reports a change. Recorded under "Next version" in the revision log and development plan; the version number is unchanged until the next release.
**Found:** Inserting a picture into text lost its manifest entry, because the canvas's change carried a file list a moment old; fixed in `onPageChange`. Versions 1.1.1 and earlier do not know the new content: they show such a text box empty, and typing in that box there replaces its stored text (checked in TipTap 3.31's content loading; noted in FUTURE_FEATURES.md).
**Checked:** Type check; 77 unit tests (new: picture rendering, name listing and renaming); phase 8's new step (insert, stored and listed, loads, prints, wraps with text beside it, sizes to a quarter, copies with its text box to another page, removes); every other window suite rerun. Screenshots of the editor and page.html match.
**Next platform must check:** Windows: insert a picture into text, wrap it left, and check the screen against Print Preview.
**Open:** Release the next version when the user asks; until it is installed everywhere, do not edit pages with pictures in text in 1.1.1 or 1.1.0.

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** Version 1.1.1 (line-by-line page breaks, line spacing, the Order menu, editor and print alignment), to be published as a pre-release. Added `docs/REVISION_LOG.txt`, a plain-text description of every version for users; `release.yml` now attaches it to every release as `PageBinder-revision-log.txt` and puts the version's own section in the release notes. The development plan has a Version 1.1.1 section. The user asked for exactly two published pre-releases (1.1.0 and 1.1.1) and nothing else, so the duplicate v1.1.0 draft is deleted.
**Found:** GitHub's "latest release" link skips pre-releases; with only pre-releases, the README's download link lands on the Releases page, which lists them, so it still works.
**Checked:** The notes extraction was run locally against the log for 1.1.1 and 1.0.1. See the commit's workflow run, the 1.1.1 release run, and the final release list.
**Next platform must check:** Windows: install PageBinder-Setup-1.1.1.exe over 1.1.0 and confirm the Keep or Start fresh question and that notebooks open unchanged.
**Open:** Word wrap choice; tall tables across page breaks; document-wide undo (all in FUTURE_FEATURES.md).

## 2026-09-28 · lead (macOS, Apple silicon) · main
**Changed:** New standing rule: a published release is never overwritten (see `CLAUDE.md`, "Published releases"). `release.yml` gained a first job that checks for a published release of the version: when publishing a draft created the tag, the run stops quietly; when started by hand for a published version, it fails and asks for a new version number. Builds no longer run in either case.
**Found:** v1.1.0 was published as a pre-release on 27 September from `7606ede` (printout search). Publishing created the `v1.1.0` tag, which started `release.yml` and produced a second, identical v1.1.0 draft. Nothing public was replaced; the extra draft is still there.
**Checked:** The workflow parses; its release query, run against the repository, finds one published v1.1.0 release and none for v1.2.0. The first run of the changed workflow will be the proof.
**Next platform must check:** Nothing.
**Open:** The changes since `7606ede` (line-by-line page breaks, line spacing, the Order menu, editor/print alignment) need a new version number (for example 1.1.1 or 1.2.0) to reach a new draft. The duplicate v1.1.0 draft can be deleted if the user wants.
