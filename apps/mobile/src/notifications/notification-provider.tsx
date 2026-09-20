import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Linking, Platform } from 'react-native';
import { useSession } from '../auth/session-provider';
import { resolveNotificationJoinUrl } from './notification-data';
import { installationCapabilityStore } from './installation-capability-store';
import { notificationsApi } from './notifications-api';
import { pushTokenStore } from './push-token-store';
import { unregisterPushRegistration } from './push-unregistration';
import type {
  NotificationPermissionStatus,
  NotificationRegistrationStatus,
} from './notification-settings-state';

export type NotificationRegistrationResult = {
  status: Exclude<NotificationRegistrationStatus, 'idle' | 'registering' | 'unregistering'>;
  message: string;
};

type NotificationContextValue = {
  status: NotificationRegistrationStatus;
  permissionStatus: NotificationPermissionStatus;
  message: string | null;
  requestPermissionAndRegister(): Promise<NotificationRegistrationResult>;
  unregister(): Promise<NotificationRegistrationResult>;
  openSystemSettings(): Promise<void>;
  refreshStatus(): Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function easProjectId() {
  const configured = Constants.expoConfig?.extra?.eas?.projectId;
  return Constants.easConfig?.projectId ?? (typeof configured === 'string' ? configured : null);
}

function permissionStatus(value: Notifications.PermissionStatus): NotificationPermissionStatus {
  if (value === 'granted' || value === 'denied' || value === 'undetermined') return value;
  return 'unknown';
}

async function openDocumentedNotification(response: Notifications.NotificationResponse | null) {
  const url = resolveNotificationJoinUrl(response?.notification.request.content.data);
  if (url) await Linking.openURL(url);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [status, setStatus] = useState<NotificationRegistrationStatus>('idle');
  const [currentPermission, setCurrentPermission] =
    useState<NotificationPermissionStatus>('unknown');
  const [message, setMessage] = useState<string | null>(null);

  const registerExpoToken = useCallback(
    async (expoPushToken: string) => {
      if (!session) throw new Error('Authentication is required to register push notifications.');
      const capability = await installationCapabilityStore.getOrCreate();
      return pushTokenStore.reconcileRegistration(
        expoPushToken,
        session.user.id,
        session.sessionId,
        capability,
        (registration) =>
          notificationsApi.register(session.accessToken, {
            expoPushToken: registration.token,
            sessionId: session.sessionId,
            previousExpoPushToken: registration.previousToken,
            previousRegistrationRevision: registration.previousRegistrationRevision,
            installationId: registration.installationId,
            installationSecret: registration.installationSecret,
            registrationRevision: registration.registrationRevision,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            deviceName: Device.deviceName,
            deviceModel: Device.modelName,
            osVersion: Device.osVersion,
            appVersion: Constants.expoConfig?.version ?? null,
          }),
      );
    },
    [session],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: Notifications.NotificationResponse) => {
        void openDocumentedNotification(response);
      },
    );
    void Notifications.getLastNotificationResponseAsync().then(openDocumentedNotification);
    return () => subscription.remove();
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!session) {
      setStatus('idle');
      setCurrentPermission('unknown');
      setMessage(null);
      return;
    }
    if (!Device.isDevice) {
      setStatus('unsupported');
      setCurrentPermission('unknown');
      setMessage('الإشعارات غير متاحة في المحاكي. استخدم جهاز iPhone حقيقيًا للاختبار.');
      return;
    }
    if (!easProjectId()) {
      setStatus('missing-project-id');
      setCurrentPermission('unknown');
      setMessage('هذا الإصدار لا يحتوي معرّف مشروع EAS، لذلك لا يمكن تسجيل الإشعارات.');
      return;
    }
    try {
      const [permissions, storedRegistration] = await Promise.all([
        Notifications.getPermissionsAsync(),
        pushTokenStore.getRegistration(),
      ]);
      const nextPermission = permissionStatus(permissions.status);
      setCurrentPermission(nextPermission);
      if (nextPermission === 'denied') {
        setStatus('denied');
        setMessage('لم تمنح إذن الإشعارات. يمكنك تفعيله من الإعدادات.');
      } else if (
        nextPermission === 'granted' &&
        storedRegistration?.ownerUserId === session.user.id
      ) {
        setStatus('registered');
        setMessage('إشعارات الغرف والحساب مفعّلة على هذا الجهاز.');
      } else {
        setStatus('idle');
        setMessage(null);
      }
    } catch {
      setCurrentPermission('unknown');
    }
  }, [session]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!session || !Device.isDevice) return;
    const projectId = easProjectId();
    if (!projectId) return;
    let active = true;
    void Notifications.getPermissionsAsync()
      .then(async (permissions) => {
        if (permissions.status !== 'granted') return null;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        return registerExpoToken(token);
      })
      .then((registration) => {
        if (!active || !registration) return;
        setStatus('registered');
        setMessage('إشعارات الغرف والحساب مفعّلة على هذا الجهاز.');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        setMessage('تعذّر مزامنة تسجيل الإشعارات. سنحاول مجددًا عند فتح التطبيق.');
      });
    return () => {
      active = false;
    };
  }, [registerExpoToken, session]);

  useEffect(() => {
    if (!session || !Device.isDevice) return;
    const projectId = easProjectId();
    if (!projectId) return;
    let active = true;
    const subscription = Notifications.addPushTokenListener(() => {
      void Notifications.getExpoPushTokenAsync({ projectId })
        .then(({ data }: { data: string }) => registerExpoToken(data))
        .then(() => {
          if (!active) return;
          setStatus('registered');
          setMessage('تم تحديث تسجيل الإشعارات لهذا الجهاز.');
        })
        .catch(() => {
          if (!active) return;
          setStatus('error');
          setMessage('تعذّر تحديث تسجيل الإشعارات. سنحاول مجددًا لاحقًا.');
        });
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [registerExpoToken, session]);

  const requestPermissionAndRegister =
    useCallback(async (): Promise<NotificationRegistrationResult> => {
      if (!session) {
        const result = { status: 'error' as const, message: 'سجّل الدخول أولًا لتفعيل الإشعارات.' };
        setStatus(result.status);
        setMessage(result.message);
        return result;
      }
      if (!Device.isDevice) {
        const result = {
          status: 'unsupported' as const,
          message: 'الإشعارات غير متاحة في المحاكي. استخدم جهاز iPhone حقيقيًا للاختبار.',
        };
        setStatus(result.status);
        setMessage(result.message);
        return result;
      }
      const projectId = easProjectId();
      if (!projectId) {
        const result = {
          status: 'missing-project-id' as const,
          message: 'هذا الإصدار لا يحتوي معرّف مشروع EAS، لذلك لا يمكن تسجيل الإشعارات.',
        };
        setStatus(result.status);
        setMessage(result.message);
        return result;
      }

      setStatus('registering');
      setMessage('جارٍ التحقق من الإذن وتسجيل هذا الجهاز…');
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'إشعارات تحدّي',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
        let permissions = await Notifications.getPermissionsAsync();
        setCurrentPermission(permissionStatus(permissions.status));
        if (permissions.status !== 'granted') {
          permissions = await Notifications.requestPermissionsAsync();
          setCurrentPermission(permissionStatus(permissions.status));
        }
        if (permissions.status !== 'granted') {
          const result = {
            status: 'denied' as const,
            message: 'لم تمنح إذن الإشعارات. يمكنك تفعيله من الإعدادات.',
          };
          setStatus(result.status);
          setMessage(result.message);
          return result;
        }

        const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await registerExpoToken(expoPushToken);
        const result = { status: 'registered' as const, message: 'تم تفعيل إشعارات تحدّي.' };
        setStatus(result.status);
        setMessage(result.message);
        return result;
      } catch {
        const result = { status: 'error' as const, message: 'تعذّر تفعيل الإشعارات الآن.' };
        setStatus(result.status);
        setMessage(result.message);
        return result;
      }
    }, [registerExpoToken, session]);

  const unregister = useCallback(async (): Promise<NotificationRegistrationResult> => {
    if (!session) {
      const result = { status: 'error' as const, message: 'سجّل الدخول أولًا لتعديل الإشعارات.' };
      setStatus(result.status);
      setMessage(result.message);
      return result;
    }
    setStatus('unregistering');
    setMessage('جارٍ إلغاء تسجيل هذا الجهاز…');
    try {
      const registration = await pushTokenStore.getCleanupCandidate(
        session.user.id,
        session.sessionId,
      );
      if (registration) {
        const capability = await installationCapabilityStore.getOrCreate();
        await unregisterPushRegistration({
          registration,
          capability,
          unregister: (input) => notificationsApi.unregister(session.accessToken, input),
          clear: pushTokenStore.clearIfMatches,
        });
      }
      const result = { status: 'disabled' as const, message: 'تم تعطيل إشعارات هذا الجهاز.' };
      setStatus(result.status);
      setMessage(result.message);
      return result;
    } catch {
      const result = { status: 'error' as const, message: 'تعذّر تعطيل الإشعارات الآن.' };
      setStatus(result.status);
      setMessage(result.message);
      return result;
    }
  }, [session]);

  const openSystemSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      setStatus('error');
      setMessage('تعذّر فتح إعدادات iPhone. افتحها يدويًا ثم اختر تطبيق تحدّي.');
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      permissionStatus: currentPermission,
      message,
      requestPermissionAndRegister,
      unregister,
      openSystemSettings,
      refreshStatus,
    }),
    [
      currentPermission,
      message,
      openSystemSettings,
      refreshStatus,
      requestPermissionAndRegister,
      status,
      unregister,
    ],
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationProvider.');
  return value;
}
