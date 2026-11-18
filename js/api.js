// Thin wrapper around the Supabase RPC functions in supabase/schema.sql.
// Every call throws an Error with a `.code` (e.g. 'E_BAD_PIN') on failure,
// and `.data` holding any extra info the server sent back.
window.Api = (function () {
  'use strict';

  let client = null;
  let token = null;

  function configured() {
    const c = window.CONFIG || {};
    return c.SUPABASE_URL && !/YOUR-PROJECT/.test(c.SUPABASE_URL) &&
           c.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(c.SUPABASE_ANON_KEY);
  }

  function getClient() {
    if (!client) {
      if (!configured() || !window.supabase) throw codeError('E_CONFIG');
      client = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return client;
  }

  function codeError(code, data) {
    const e = new Error(code);
    e.code = code;
    e.data = data || {};
    return e;
  }

  async function rpc(fn, args) {
    const c = getClient();
    let res;
    try {
      res = await c.rpc(fn, args || {});
    } catch (err) {
      throw codeError('E_NETWORK');
    }
    if (res.error) {
      const msg = String(res.error.message || '');
      const m = msg.match(/E_[A-Z_]+/);
      if (m) throw codeError(m[0]);
      if (/fetch|network|load failed|timeout/i.test(msg) || !res.status || res.status >= 500) {
        throw codeError('E_NETWORK');
      }
      console.error('RPC error', fn, res.error);
      throw codeError('E_UNKNOWN');
    }
    const data = res.data;
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
      throw codeError(data.error, data);
    }
    return data;
  }

  const authed = (fn) => (extra) => rpc(fn, Object.assign({ p_token: token }, extra || {}));

  return {
    configured,
    setToken(t) { token = t; },

    // Login (passcode based)
    listMembers: (passcode) => rpc('list_members', { p_passcode: passcode }),
    login: (passcode, memberId, pin) => rpc('login', { p_passcode: passcode, p_member_id: memberId, p_pin: pin }),
    setPin: (passcode, memberId, pin) => rpc('set_pin', { p_passcode: passcode, p_member_id: memberId, p_pin: pin }),
    logout: () => (token ? rpc('logout', { p_token: token }).catch(() => {}) : Promise.resolve()),
    getSession: () => authed('get_session')(),

    // Own list
    getMembers: () => authed('get_members')(),
    getMyList: () => authed('get_my_list')(),
    upsertMyList: (items) => authed('upsert_my_list')({ p_items: items }),
    addItem: (item) => authed('add_item')({ p_item: item }),
    updateItem: (id, item) => authed('update_item')({ p_item_id: id, p_item: item }),
    deleteItem: (id) => authed('delete_item')({ p_item_id: id }),

    // Family + claims
    getFamilyList: (memberId) => authed('get_family_list')({ p_target_member_id: memberId }),
    claimItem: (itemId) => authed('claim_item')({ p_item_id: itemId }),
    unclaimItem: (itemId) => authed('unclaim_item')({ p_item_id: itemId }),
    getMyClaims: () => authed('get_my_claims')(),
    setBought: (claimId, bought) => authed('set_bought')({ p_claim_id: claimId, p_bought: bought }),

    // Admin
    adminListMembers: () => authed('admin_list_members')(),
    adminAddMember: (name) => authed('admin_add_member')({ p_name: name }),
    adminRenameMember: (id, name) => authed('admin_rename_member')({ p_member_id: id, p_name: name }),
    adminRemoveMember: (id) => authed('admin_remove_member')({ p_member_id: id }),
    adminResetPin: (id) => authed('admin_reset_pin')({ p_member_id: id }),
    adminSetAdmin: (id, isAdmin) => authed('admin_set_admin')({ p_member_id: id, p_is_admin: isAdmin }),
    adminSetPasscode: (passcode) => authed('admin_set_passcode')({ p_passcode: passcode }),
    adminClearClaim: (itemId) => authed('admin_clear_claim')({ p_item_id: itemId }),
    adminNewYear: (mode, season) => authed('admin_new_year')({ p_mode: mode, p_season: season }),
  };
})();
