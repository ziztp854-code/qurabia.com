const QUESTION_IMAGE_BUCKET = 'question-images';
export const MAX_QUESTION_IMAGE_BYTES = 3 * 1024 * 1024;

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof allowedMimeTypes)[number];

const extensions: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class QuestionImageError extends Error {}

function getStorageConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?.trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new QuestionImageError(
      'رفع الصور غير مهيأ. أضف SUPABASE_URL أو NEXT_PUBLIC_SUPABASE_URL مع SUPABASE_SERVICE_ROLE_KEY في Vercel.',
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

function storageHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function detectMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export async function validateQuestionImage(file: File) {
  if (file.size > MAX_QUESTION_IMAGE_BYTES) {
    throw new QuestionImageError('حجم الصورة يجب ألا يتجاوز 3 ميجابايت.');
  }
  if (!allowedMimeTypes.includes(file.type as AllowedMimeType)) {
    throw new QuestionImageError('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.');
  }

  const declaredMimeType = file.type as AllowedMimeType;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedMimeType = detectMimeType(bytes);
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    throw new QuestionImageError('محتوى الصورة لا يطابق صيغتها.');
  }

  return {
    mimeType: detectedMimeType,
    extension: extensions[detectedMimeType],
  };
}

export function getQuestionImageFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || value.size === 0) return null;
  return value;
}

async function ensureQuestionImageBucket() {
  const { supabaseUrl, serviceRoleKey } = getStorageConfig();
  const headers = storageHeaders(serviceRoleKey);
  const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${QUESTION_IMAGE_BUCKET}`, {
    headers,
    cache: 'no-store',
  });

  if (bucketResponse.ok) return;
  if (bucketResponse.status !== 404) {
    throw new QuestionImageError('تعذّر الاتصال بمخزن الصور.');
  }

  const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: QUESTION_IMAGE_BUCKET,
      name: QUESTION_IMAGE_BUCKET,
      public: true,
      file_size_limit: MAX_QUESTION_IMAGE_BYTES,
      allowed_mime_types: allowedMimeTypes,
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new QuestionImageError('تعذّر تجهيز مخزن صور الأسئلة.');
  }
}

function encodeStoragePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function uploadQuestionImage(file: File, ownerId: string) {
  const { mimeType, extension } = await validateQuestionImage(file);
  await ensureQuestionImageBucket();

  const { supabaseUrl, serviceRoleKey } = getStorageConfig();
  const safeOwnerId = ownerId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeOwnerId) {
    throw new QuestionImageError('تعذّر تحديد مالك الصورة.');
  }

  const path = `${safeOwnerId}/${crypto.randomUUID()}.${extension}`;
  const encodedPath = encodeStoragePath(path);
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${QUESTION_IMAGE_BUCKET}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        ...storageHeaders(serviceRoleKey),
        'Content-Type': mimeType,
        'x-upsert': 'false',
      },
      body: await file.arrayBuffer(),
    },
  );

  if (!response.ok) {
    throw new QuestionImageError('تعذّر رفع الصورة إلى Supabase.');
  }

  return `${supabaseUrl}/storage/v1/object/public/${QUESTION_IMAGE_BUCKET}/${encodedPath}`;
}

export async function deleteQuestionImage(imageUrl: string | null | undefined) {
  if (!imageUrl) return;

  const { supabaseUrl, serviceRoleKey } = getStorageConfig();
  const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/${QUESTION_IMAGE_BUCKET}/`;
  if (!imageUrl.startsWith(expectedPrefix)) return;

  const encodedPath = imageUrl.slice(expectedPrefix.length).split('?')[0];
  if (!encodedPath) return;

  await fetch(`${supabaseUrl}/storage/v1/object/${QUESTION_IMAGE_BUCKET}/${encodedPath}`, {
    method: 'DELETE',
    headers: storageHeaders(serviceRoleKey),
  });
}
