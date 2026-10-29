/* Standalone review host only. Original planner/engine sources remain unchanged. */
hubNavigation = () => Promise.resolve();
const STANDALONE_BUILDS_KEY = 'td2-optimizer:standalone-builds:v1';
buildAccountRequest = async function (method, body = {}) {
  const records = JSON.parse(localStorage.getItem(STANDALONE_BUILDS_KEY) || '[]');
  if (method === 'GET') return { data: records };
  const index = records.findIndex(row => row.id === body.id);
  if (method === 'PATCH' || method === 'DELETE') {
    if (index < 0) throw Error('not_found');
    if (records[index].revision !== body.revision) throw Error('changed');
  }
  let record;
  if (method === 'DELETE') records.splice(index, 1);
  else if (method === 'POST' || method === 'PATCH') {
    if (!body.name?.trim() || body.name.length > 60 || !body.document) throw Error('invalid');
    const old = index >= 0 ? records[index] : null;
    record = { id: old?.id || crypto.randomUUID(), name: body.name.trim(), document: body.document,
      revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (old) records[index] = record; else records.push(record);
  } else throw Error('invalid');
  localStorage.setItem(STANDALONE_BUILDS_KEY, JSON.stringify(records));
  return { data: record || null };
};
const originalShareAction = buildShareAction;
buildShareAction = function (kind) {
  if (kind === 'forum') {
    buildShareNotice(L('独立版不连接论坛；可复制配装链接或导出图片。', 'This standalone version has no forum. Copy a build link or export an image.'));
    return;
  }
  return originalShareAction(kind);
};
