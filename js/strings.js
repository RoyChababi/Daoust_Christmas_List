// All user-facing text lives here. To add French, copy the `en` block to `fr`,
// translate the values, and add 'fr' to AVAILABLE. A language toggle appears
// automatically in the header when more than one language is available.
window.I18N = (function () {
  'use strict';

  const STRINGS = {
    en: {
      appTitle: 'Family Christmas List',
      loading: 'Loading…',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      ok: 'OK',
      yes: 'Yes',
      back: 'Back',
      confirm: 'Confirm',
      edit: 'Edit',
      delete: 'Delete',
      remove: 'Remove',
      tryAgain: 'Try again',

      // Login
      passcodeTitle: 'Welcome!',
      passcodeIntro: 'Enter the family passcode Roy sent you.',
      passcodeLabel: 'Family passcode',
      passcodeButton: 'Continue',
      whoTitle: 'Who are you?',
      whoLabel: 'Pick your name',
      whoPlaceholder: '— Choose your name —',
      pinLabel: 'Your 4-digit PIN',
      pinNewIntro: "First time here! Choose a 4-digit PIN. You'll use it to log in on a new phone or computer. Keep it to yourself.",
      pinNewLabel: 'Choose a 4-digit PIN',
      pinConfirmLabel: 'Type the same PIN again',
      loginButton: 'Log in',
      setPinButton: 'Save PIN and log in',
      differentPasscode: 'Use a different passcode',
      forgotPin: 'Forgot your PIN? Ask Roy to reset it.',
      pinMismatch: "The two PINs don't match. Please type them again.",
      pinMustBe4: 'Your PIN must be exactly 4 digits.',
      pickNameFirst: 'Please pick your name first.',
      badPinLeft: 'Wrong PIN. {n} tries left before a 10-minute lock.',

      // Header / nav
      hello: 'Hi, {name}',
      switchUser: 'Switch user',
      navMyList: 'My List',
      navFamily: 'Family',
      navClaims: 'My Claims',
      navAdmin: 'Admin',

      // My list
      myListTitle: 'My wish list',
      myListIntro: 'Add the gifts you would like. Your family sees this list. You will never see who picked what — that stays a surprise!',
      addItem: '+ Add an item',
      downloadExcel: 'Download Excel',
      uploadExcel: 'Upload Excel',
      excelHelp: 'Prefer Excel? Download the file, fill it in, then upload it here. Uploading replaces your list with what is in the file.',
      emptyMyList: 'Your list is empty. Tap “Add an item” to start.',
      addItemTitle: 'Add an item',
      editItemTitle: 'Edit item',
      deleteItemConfirm: 'Remove “{name}” from your list?',
      itemAdded: 'Added to your list.',
      itemSaved: 'Saved.',
      itemDeleted: 'Removed from your list.',

      // Item fields
      fItem: 'Item',
      fItemHint: 'What is it? (required)',
      fLink: 'Link',
      fLinkHint: 'Web page where it can be bought (optional)',
      fPrice: 'Price ($ CAD)',
      fSizeColor: 'Size / Color',
      fPriority: 'Priority',
      fNotes: 'Notes',
      priorityNone: '—',
      priorityHigh: 'High',
      priorityMedium: 'Medium',
      priorityLow: 'Low',
      viewLink: 'View online ↗',

      // Upload preview
      uploadPreviewTitle: 'Check before saving',
      uploadPreviewSummary: '{added} new, {updated} updated, {removed} removed',
      uploadUnchanged: '{n} unchanged',
      uploadSkipped: '{n} rows had no Item name and will be skipped.',
      uploadSkippedOne: '1 row had no Item name and will be skipped.',
      uploadNew: 'New',
      uploadUpdated: 'Updated',
      uploadRemoved: 'Removed',
      uploadAllRemovedWarn: 'Careful: this file has no items, so your whole list will be cleared.',
      uploadConfirm: 'Save my list',
      uploadDone: 'Your list is updated.',
      uploadNothing: 'Nothing changed — your list already matches this file.',
      uploadReading: 'Reading your file…',

      // Excel
      excelSheetName: 'My list',
      excelHelpSheetName: 'How to',
      excelHelpLines: [
        'How to fill in your Christmas list',
        '',
        '1. Go to the "My list" sheet. Keep the first row (the column titles) as it is.',
        '2. Put one gift per row. Only the "Item" column is required.',
        '3. Price is in Canadian dollars. Just the number is fine (e.g. 25 or 24.99).',
        '4. Priority: High, Medium or Low.',
        '5. Save the file, then upload it on the "My List" page.',
        '',
        'Uploading replaces your list with what is in the file.',
        'To change an item, keep the same name in the "Item" column and edit the other columns.',
      ],
      excelFileName: 'Christmas list - {name}.xlsx',

      // Family
      familyTitle: 'Family lists',
      familyIntro: 'Tap a person to see their list and claim a gift.',
      familyEmpty: 'No one else has been added yet.',
      itemCount: '{n} items',
      itemCountOne: '1 item',
      itemCountZero: 'No items yet',
      claimedCount: '{n} claimed',
      listOf: "{name}'s list",
      everyone: '← Everyone',
      hideClaimed: 'Hide claimed items',
      emptyFamilyList: "{name} hasn't added anything yet.",
      allClaimedHidden: 'Every item is claimed. Turn off “Hide claimed items” to see them.',
      claim: 'Claim',
      unclaim: 'Unclaim',
      claimedBy: 'Claimed by {name}',
      youClaimed: 'You claimed this',
      removedAfterClaim: 'Removed by {name} after you claimed it. Unclaim to clear it away.',
      claimedToast: 'Claimed! It’s on your “My Claims” list.',
      unclaimedToast: 'Unclaimed.',
      alreadyClaimed: 'Already claimed by {name}.',
      alreadyClaimedByYou: 'You already claimed this.',
      adminClearClaim: 'Clear claim (admin)',
      adminClearClaimConfirm: 'Clear the claim on “{item}”? It will become available again.',
      claimCleared: 'Claim cleared.',

      // My claims
      claimsTitle: 'My claims',
      claimsIntro: 'Your shopping list. Only you can see the “Bought” checkmarks.',
      claimsEmpty: 'You haven’t claimed anything yet. Go to “Family” to pick gifts.',
      claimsSummary: '{n} gifts · {bought} bought',
      claimsSummaryOne: '1 gift · {bought} bought',
      claimsTotal: 'Total: {total}',
      forName: 'For {name}',
      bought: 'Bought',

      // Admin
      adminTitle: 'Admin',
      adminSeason: 'Current season: {season}',
      adminMembers: 'Family members',
      adminAddMember: 'Add a person',
      adminAddPlaceholder: 'Name',
      adminAdd: 'Add',
      adminRename: 'Rename',
      adminRenameTitle: 'Rename {name}',
      adminResetPin: 'Reset PIN',
      adminResetPinConfirm: 'Reset {name}’s PIN? They will choose a new one next time they log in.',
      adminPinReset: 'PIN reset. {name} will choose a new PIN at next login.',
      adminMakeAdmin: 'Make admin',
      adminRemoveAdmin: 'Remove admin',
      adminRemoveMember: 'Remove',
      adminRemoveConfirm: 'Remove {name}? Their list and all their claims will be deleted. This cannot be undone.',
      adminBadgeAdmin: 'Admin',
      adminBadgeYou: 'You',
      adminBadgeNoPin: 'No PIN yet',
      adminBadgeLocked: 'Locked',
      adminPasscodeTitle: 'Family passcode',
      adminPasscodeIntro: 'Change the passcode everyone uses to get in. People already logged in stay logged in.',
      adminPasscodeLabel: 'New passcode',
      adminPasscodeSaved: 'Passcode changed. Remember to text the new one to the family.',
      adminNewYearTitle: 'New year',
      adminNewYearIntro: 'Start a fresh season. Everyone keeps their account and PIN.',
      adminNewSeasonLabel: 'New season',
      adminArchive: 'Archive and start new season',
      adminArchiveConfirm: 'Start season {season}? All current lists and claims will be hidden (kept in the database). Switching back to {old} later brings them back.',
      adminWipe: 'Wipe everything',
      adminWipeConfirm: 'Permanently delete EVERY list and claim (all seasons) and start season {season}? This cannot be undone. Type WIPE to confirm.',
      adminWipeWord: 'WIPE',
      adminSeasonChanged: 'Season {season} started.',
      adminSaved: 'Saved.',

      // Errors (codes come from the database)
      errors: {
        E_NETWORK: "Can't reach the server. Check your internet and try again. (If nobody has used the site for a week, it can take a minute to wake up.)",
        E_UNKNOWN: 'Something went wrong. Please try again.',
        E_CONFIG: 'The site is not set up yet: config.js is missing the Supabase URL and key.',
        E_NO_PASSCODE: 'The family passcode has not been set up yet. Ask Roy.',
        E_BAD_PASSCODE: "That passcode isn't right. Check Roy's text and try again.",
        E_NO_MEMBER: 'That name is no longer on the list. Please pick again.',
        E_NO_PIN: 'You need to choose a PIN first.',
        E_BAD_PIN: 'Wrong PIN. Please try again.',
        E_LOCKED: 'Too many wrong tries. Please wait {minutes} minutes and try again, or ask Roy to reset your PIN.',
        E_PIN_FORMAT: 'Your PIN must be exactly 4 digits.',
        E_PIN_ALREADY_SET: 'A PIN was already set for this name. Enter that PIN, or ask Roy to reset it.',
        E_SESSION: 'You have been logged out. Please log in again.',
        E_NOT_ADMIN: 'Only an admin can do that.',
        E_NAME_REQUIRED: 'Please enter a name.',
        E_DUPLICATE: 'That item is already on your list.',
        E_NOT_FOUND: "That item isn't there anymore. The page has been refreshed.",
        E_TOO_MANY: 'That is too many items (300 max).',
        E_BAD_INPUT: 'Something about that was not valid. Please check and try again.',
        E_OWN_LIST: "You can't view your own list here. Use “My List”.",
        E_OWN_ITEM: "You can't claim items on your own list.",
        E_NOT_YOUR_CLAIM: 'Only the person who claimed this can unclaim it.',
        E_ALREADY_CLAIMED: 'Already claimed by {claimer_name}.',
        E_NAME_TAKEN: 'Someone already has that name. Add a last initial to tell them apart.',
        E_SELF: "You can't do that to your own account.",
        E_PASSCODE_SHORT: 'The passcode must be at least 4 characters.',
        E_BAD_SEASON: 'Please enter a different year (for example {next}).',
        E_NO_ITEM_COLUMN: 'This file has no “Item” column. Please use the Excel file from “Download Excel” and keep its first row as is.',
        E_EMPTY_FILE: 'This file is empty.',
        E_BAD_FILE: "This file couldn't be read. Please upload an .xlsx or .csv file.",
      },
    },
  };

  const AVAILABLE = ['en'];
  let lang = 'en';
  try {
    const saved = localStorage.getItem('xmas.lang');
    if (saved && AVAILABLE.includes(saved)) lang = saved;
  } catch (e) { /* storage blocked */ }

  function lookup(key) {
    const parts = key.split('.');
    let v = STRINGS[lang];
    let fallback = STRINGS.en;
    for (const p of parts) {
      v = v == null ? undefined : v[p];
      fallback = fallback == null ? undefined : fallback[p];
    }
    return v != null ? v : fallback;
  }

  function t(key, vars) {
    let s = lookup(key);
    if (s == null) return key;
    if (typeof s !== 'string') return s;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  function setLang(l) {
    if (!AVAILABLE.includes(l)) return;
    lang = l;
    try { localStorage.setItem('xmas.lang', l); } catch (e) { /* ignore */ }
  }

  return { t, setLang, get lang() { return lang; }, AVAILABLE };
})();
