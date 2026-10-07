const DB_NAME = 'xinghui-media';
const DB_VERSION = 1;
const STICKER_STORE = 'stickers';
const AVATAR_STORE = 'avatars';
let dbPromise = null;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('indexeddb-unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STICKER_STORE)) db.createObjectStore(STICKER_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(AVATAR_STORE)) db.createObjectStore(AVATAR_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb-open-failed'));
  });
  return dbPromise;
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb-request-failed'));
  });
}

async function putRecord(storeName, record) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await requestPromise(tx.objectStore(storeName).put(record));
  return record;
}

async function getRecord(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return requestPromise(tx.objectStore(storeName).get(id));
}

async function deleteRecord(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await requestPromise(tx.objectStore(storeName).delete(id));
}

export async function putStickerBlob(id, blob, metadata = {}) {
  return putRecord(STICKER_STORE, {
    id,
    blob,
    mimeType: blob.type || metadata.mimeType || 'image/*',
    size: blob.size,
    createdAt: metadata.createdAt || Date.now(),
    enabled: metadata.enabled !== false,
  });
}

export async function getStickerBlob(id) {
  const record = await getRecord(STICKER_STORE, id);
  return record?.blob || null;
}

export async function listStickerRecords() {
  const db = await openDatabase();
  const tx = db.transaction(STICKER_STORE, 'readonly');
  const records = await requestPromise(tx.objectStore(STICKER_STORE).getAll());
  return records.map((record) => ({
    id: record.id,
    storage: 'indexeddb',
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    enabled: record.enabled !== false,
  }));
}
export async function deleteStickerBlob(id) {
  return deleteRecord(STICKER_STORE, id);
}

export async function putAvatarBlob(id, blob, metadata = {}) {
  return putRecord(AVATAR_STORE, {
    id,
    blob,
    mimeType: blob.type || metadata.mimeType || 'image/*',
    size: blob.size,
    createdAt: metadata.createdAt || Date.now(),
  });
}

export async function getAvatarBlob(id) {
  const record = await getRecord(AVATAR_STORE, id);
  return record?.blob || null;
}

export async function deleteAvatarBlob(id) {
  return deleteRecord(AVATAR_STORE, id);
}

export function dataUrlToBlob(dataUrl) {
  const [header, payload] = String(dataUrl).split(',');
  if (!header || payload === undefined || !header.startsWith('data:')) throw new Error('invalid-data-url');
  const mimeType = header.slice(5).split(';')[0] || 'application/octet-stream';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
    reader.addEventListener('error', () => reject(reader.error || new Error('blob-read-failed')));
    reader.readAsDataURL(blob);
  });
}

export function setBlobImage(image, blob) {
  const url = URL.createObjectURL(blob);
  const revoke = () => URL.revokeObjectURL(url);
  image.addEventListener('load', revoke, { once: true });
  image.addEventListener('error', revoke, { once: true });
  image.src = url;
}

export async function migrateLegacyMedia({ stickers = [], character = null, settings = null, onProgress = () => {} } = {}) {
  const migratedStickers = [];
  const failures = [];
  let migratedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < stickers.length; index += 1) {
    const sticker = stickers[index];
    if (sticker?.storage === 'indexeddb' || !sticker?.image) {
      migratedStickers.push(sticker);
      onProgress(index + 1, stickers.length);
      continue;
    }

    try {
      if (!String(sticker.image).startsWith('data:image/')) throw new Error('unsupported-legacy-image');
      const blob = dataUrlToBlob(sticker.image);
      await putStickerBlob(sticker.id, blob, sticker);
      migratedStickers.push({
        id: sticker.id,
        storage: 'indexeddb',
        mimeType: blob.type,
        size: blob.size,
        createdAt: sticker.createdAt || Date.now(),
        enabled: sticker.enabled !== false,
      });
      migratedCount += 1;
    } catch (error) {
      migratedStickers.push(sticker);
      failures.push(sticker.id);
      failedCount += 1;
    }
    onProgress(index + 1, stickers.length);
  }

  let avatar = character?.avatar || '';
  if (avatar && avatar.startsWith('data:image/')) {
    try {
      await putAvatarBlob('star', dataUrlToBlob(avatar));
      avatar = 'idb:star';
    } catch (error) {
      failures.push('star-avatar');
      failedCount += 1;
    }
  }

  let userAvatar = settings?.userAvatar || '';
  if (userAvatar && userAvatar.startsWith('data:image/')) {
    try {
      await putAvatarBlob('user', dataUrlToBlob(userAvatar));
      userAvatar = 'idb:user';
    } catch (error) {
      failures.push('user-avatar');
      failedCount += 1;
    }
  }

  return { stickers: migratedStickers, avatar, userAvatar, migratedCount, failedCount, failures };
}

export async function collectMediaAssets({ avatars = [] } = {}) {
  const db = await openDatabase();
  const tx = db.transaction([STICKER_STORE, AVATAR_STORE], 'readonly');
  const [stickers, avatarRecords] = await Promise.all([
    requestPromise(tx.objectStore(STICKER_STORE).getAll()),
    requestPromise(tx.objectStore(AVATAR_STORE).getAll()),
  ]);
  const assets = [];

  for (const record of stickers) {
    assets.push({
      kind: 'sticker',
      id: record.id,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      enabled: record.enabled !== false,
      dataUrl: await blobToDataUrl(record.blob),
    });
  }

  for (const record of avatarRecords) {
    assets.push({
      kind: 'avatar',
      id: record.id,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      dataUrl: await blobToDataUrl(record.blob),
    });
  }

  return assets;
}

export async function restoreMediaAssets(assets = []) {
  for (const asset of assets) {
    if (!asset?.dataUrl?.startsWith('data:image/')) continue;
    const blob = dataUrlToBlob(asset.dataUrl);
    if (asset.kind === 'sticker') {
      await putStickerBlob(asset.id, blob, asset);
    } else if (asset.kind === 'avatar') {
      await putAvatarBlob(asset.id, blob, asset);
    }
  }
}
