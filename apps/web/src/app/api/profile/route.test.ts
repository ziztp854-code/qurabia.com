import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  limit: vi.fn(),
  save: vi.fn(),
  form: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/voice/identity', () => ({
  voiceIdentity: mocks.identity,
  voiceRateLimit: mocks.limit,
}));
vi.mock('@/lib/profile/repository', () => ({ saveProfileIdentity: mocks.save }));
vi.mock('@/lib/profile/image', () => ({
  readProfileForm: mocks.form,
  normalizeProfileImage: mocks.normalize,
}));
import { PATCH } from './route';
import { VoiceHttpError } from '@/lib/voice/http';
let form: FormData;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ id: 'self' });
  mocks.limit.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({
    displayName: 'عبدالعزيز',
    username: 'aziz',
    bio: '',
    image: null,
  });
  form = new FormData();
  form.set('displayName', 'عبدالعزيز');
  form.set('username', 'AZIZ');
  form.set('bio', '');
  mocks.form.mockResolvedValue(form);
});
function request(origin = 'http://localhost') {
  return new Request('http://localhost/api/profile', { method: 'PATCH', headers: { origin } });
}
describe('profile update API', () => {
  it('updates only the authenticated account and strips injected role/id claims', async () => {
    form.set('userId', 'other');
    form.set('role', 'OWNER');
    form.set('followers', '999');
    expect((await PATCH(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      'self',
      { displayName: 'عبدالعزيز', username: 'aziz', bio: '' },
      undefined,
    );
  });
  it('requires the allowed origin and a current session before reading the body', async () => {
    expect((await PATCH(request('https://attacker.example'))).status).toBe(403);
    expect(mocks.form).not.toHaveBeenCalled();
    mocks.identity.mockRejectedValue(new VoiceHttpError(401, 'session revoked'));
    expect((await PATCH(request())).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('returns field errors without writing invalid identity and rejects duplicate fields', async () => {
    form.set('username', 'x');
    const response = await PATCH(request());
    expect(response.status).toBe(400);
    expect((await response.json()).fields.username).toHaveLength(1);
    form.append('displayName', 'spoof');
    expect((await PATCH(request())).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('reports a username conflict and retains the existing profile on image validation failure', async () => {
    mocks.save.mockRejectedValue(new VoiceHttpError(409, 'مستخدم بالفعل', 'USERNAME_TAKEN'));
    const response = await PATCH(request());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('USERNAME_TAKEN');
    mocks.save.mockClear();
    form.set('image', new File(['invalid'], 'image.png', { type: 'image/png' }));
    mocks.normalize.mockRejectedValue(new VoiceHttpError(400, 'الصورة تالفة'));
    expect((await PATCH(request())).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('passes explicit removal, keeping image omission separate from deletion', async () => {
    form.set('removeImage', 'true');
    expect((await PATCH(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('self', expect.any(Object), null);
  });
});
