'use strict';

/** Username PPPoE yang punya password billing tapi belum ada di radcheck. */
function pppoeRowsMissingFromRadcheck(rows, radcheckNames) {
  const have = new Set(
    [...(radcheckNames || [])].map((u) => String(u || '').trim()).filter(Boolean)
  );
  const out = [];
  for (const row of rows || []) {
    const username = String(row.pppoe_username || '').trim();
    const password = String(row.pppoe_password || '');
    if (!username || !password) continue;
    if (have.has(username)) continue;
    out.push({
      id: row.id,
      tenant_id: row.tenant_id,
      pppoe_username: username,
      pppoe_password: password,
      isolir_status: row.isolir_status
    });
  }
  return out;
}

module.exports = { pppoeRowsMissingFromRadcheck };
