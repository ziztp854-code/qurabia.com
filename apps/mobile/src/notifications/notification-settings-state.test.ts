import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationSettingsState } from './notification-settings-state';

test('offers an explicit enable action without implying that permission was already requested', () => {
  assert.deepEqual(
    notificationSettingsState({
      authenticated: true,
      status: 'idle',
      permissionStatus: 'undetermined',
      message: null,
    }),
    {
      action: 'enable',
      actionLabel: 'تفعيل الإشعارات',
      busy: false,
      description: 'الإذن لم يُطلب بعد. لن يظهر طلب النظام إلا بعد ضغطك على زر التفعيل.',
      permissionLabel: 'الإذن لم يُطلب',
      tone: 'neutral',
    },
  );
});

test('directs a denied permission to system settings instead of retrying a silent prompt', () => {
  assert.deepEqual(
    notificationSettingsState({
      authenticated: true,
      status: 'denied',
      permissionStatus: 'denied',
      message: 'لم تمنح إذن الإشعارات. يمكنك تفعيله من الإعدادات.',
    }),
    {
      action: 'settings',
      actionLabel: 'فتح إعدادات iPhone',
      busy: false,
      description: 'لم تمنح إذن الإشعارات. يمكنك تفعيله من الإعدادات.',
      permissionLabel: 'الإذن مرفوض',
      tone: 'warning',
    },
  );
});

test('shows a disable action only after this device is registered', () => {
  assert.equal(
    notificationSettingsState({
      authenticated: true,
      status: 'registered',
      permissionStatus: 'granted',
      message: null,
    }).action,
    'disable',
  );
});

test('explains simulator and missing EAS configuration without an unusable action', () => {
  for (const status of ['unsupported', 'missing-project-id'] as const) {
    const state = notificationSettingsState({
      authenticated: true,
      status,
      permissionStatus: 'unknown',
      message: null,
    });
    assert.equal(state.action, 'none');
    assert.equal(state.tone, 'error');
    assert.ok(state.description.length > 20);
  }
});
