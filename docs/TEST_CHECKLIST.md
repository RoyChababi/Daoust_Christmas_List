# Test checklist

Run this once after setup, before sending the link to the family. Use two
devices (or one normal window and one private window) so two people can be
logged in at once.

Setup for the tests: add three test people on the Admin page (**Test A**,
**Test B**, **Test C**). Delete them afterwards (Admin → Remove).

**Automated:** `supabase/tests.sql` checks all of the database rules below
(sections 2–5). Run it in the Supabase SQL Editor. It should end with
`ALL TESTS PASSED`. The manual steps check the same rules through the real screens.

---

## 1. Login

- [ ] A wrong passcode shows "That passcode isn't right…".
- [ ] The passcode works in any capitalization (`NOEL` = `noel`).
- [ ] On first login as **Test A**, the site asks to choose a PIN and type it twice. If the two PINs don't match, it shows a clear message.
- [ ] After a reload, **Test A** is still logged in.
- [ ] **Switch user**, then pick **Test A** again: the site asks for the PIN (it doesn't offer to set a new one).
- [ ] A wrong PIN shows "Wrong PIN. 4 tries left…". After 5 wrong tries, the account is locked for 10 minutes, even with the right PIN.
- [ ] Admin → **Reset PIN** for Test A: Test A is logged out on every device and chooses a new PIN at the next login.

## 2. Re-upload merge (requirements section 6)

As **Test A**, upload a file with: `Red Sweater` (price 50), `Lego Set`, `Book`, `Scarf`.
As **Test B**, claim **Red Sweater** and **Book**.

Then, as **Test A**, upload a second file with: `red sweater!` (price 60, size L), `Scarf`, `Socks`.
The preview should say **1 new, 1 updated, 2 removed** (1 unchanged).

| # | Case | Check | ✓ |
|---|---|---|---|
| 6.1 | Row matches an existing item | Test A sees "red sweater!" at $60.00, size L. Test B still sees **You claimed this** on it. Test C sees **Claimed by Test B**. | [ ] |
| 6.2 | Row has no match | **Socks** appears for Test A. Test B and Test C see it with a **Claim** button. | [ ] |
| 6.3 | Missing from the file, unclaimed | **Lego Set** is gone for everyone. | [ ] |
| 6.4 | Missing from the file, claimed | Test A does **not** see **Book**. Test B sees it crossed out on Test A's list and in My Claims, with "Removed by Test A after you claimed it." Test C does **not** see Book at all. | [ ] |
| 6.5 | Owner re-adds a removed item | Test A uploads a file that includes `Book` again (or adds "book" with **Add an item**). Test A sees Book. Test B still has **You claimed this** on it, with no "removed" note. | [ ] |

The same rules apply to one-at-a-time edits in the browser:

- [ ] Test A **edits** a claimed item (changes the price or name): Test B's claim stays.
- [ ] Test A **deletes** a claimed item: it disappears for Test A, and Test B sees the "removed" note.
- [ ] Test A **deletes** an unclaimed item: it's gone for everyone.
- [ ] Test A tries to add an item with the same name as one already on the list ("SCARF"): the site shows "That item is already on your list."
- [ ] Test B **unclaims** a removed item: it disappears for good.

## 3. Owner never sees claims

- [ ] On Test A's **My List**, after all of the above there's no "claimed", no names, no strike-through, and no difference between claimed and unclaimed items.
- [ ] Test A's own name doesn't appear on the **Family** page.
- [ ] Typing `#/family/<Test A's id>` in the address bar while logged in as Test A goes back to My List. (The database refuses this request too.)

## 4. Claim race (requirements section 7)

- [ ] Test B and Test C both open Test A's list on two devices and tap **Claim** on the same unclaimed item as close together as possible. One sees "Claimed!"; the other sees **"Already claimed by …"**, and the list refreshes to show the winner.
- [ ] Test C opens Test A's list. Test B claims an item on another device. Without refreshing, Test C taps **Claim** on that item and sees "Already claimed by Test B".
- [ ] Test A can't claim anything on their own list (there's no Claim button, and the database rejects it anyway).
- [ ] Only Test B can unclaim Test B's claim. Test C sees "Claimed by Test B" with no Unclaim button.
- [ ] Admin: **Clear claim (admin)** on a claimed item makes it available again.

## 5. My Claims

- [ ] Claims are grouped by person, with a total per person and an overall total.
- [ ] The **Bought** checkbox stays checked after a reload, and Test C can't see Test B's checkmarks.
- [ ] **Unclaim** removes the item from My Claims, and it shows a **Claim** button again on the family list.

## 6. Excel

- [ ] **Download Excel** with an empty list gives a file with a header row only, plus a "How to" sheet.
- [ ] **Download Excel** with items gives the current list, ready to edit and re-upload.
- [ ] Uploading the downloaded file without changes says "Nothing changed".
- [ ] A `.csv` file with the same columns works.
- [ ] A file without an **Item** column shows "This file has no 'Item' column…" and changes nothing.
- [ ] Empty rows are ignored, rows with data but no Item are reported as skipped, and extra spaces are trimmed.
- [ ] A price like `24,99` or `$1,299.99` is read correctly.

## 7. Admin

- [ ] Add, rename and remove a person. Adding a duplicate name shows a clear message.
- [ ] Removing a person deletes their list and claims. Their claimed items become claimable again.
- [ ] Changing the passcode works. The old passcode stops working, and people already logged in stay logged in.
- [ ] **Archive and start new season** gives everyone empty lists. Switching back to the old year brings the old lists back.
- [ ] **Wipe everything** asks you to type WIPE, then deletes everything.
- [ ] A non-admin doesn't see the Admin tab, and `#/admin` sends them to My List.

## 8. Phones

- [ ] iPhone Safari: no zooming when tapping fields, the PIN field shows a number keypad, and the bottom tabs aren't hidden behind the home bar.
- [ ] Android Chrome: same checks.
- [ ] Links on items open in a new tab.
- [ ] The first page load on mobile data takes under about 2 seconds.
