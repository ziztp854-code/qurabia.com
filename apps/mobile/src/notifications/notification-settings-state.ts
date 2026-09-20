export type NotificationRegistrationStatus =
  | 'idle'
  | 'registering'
  | 'registered'
  | 'unregistering'
  | 'disabled'
  | 'denied'
  | 'unsupported'
  | 'missing-project-id'
  | 'error';

export type NotificationPermissionStatus = 'unknown' | 'undetermined' | 'denied' | 'granted';

export type NotificationSettingsAction = 'enable' | 'disable' | 'settings' | 'sign-in' | 'none';

type NotificationSettingsInput = {
  authenticated: boolean;
  status: NotificationRegistrationStatus;
  permissionStatus: NotificationPermissionStatus;
  message: string | null;
};

export function notificationSettingsState(input: NotificationSettingsInput) {
  if (!input.authenticated) {
    return {
      action: 'sign-in' as const,
      actionLabel: 'تسجيل الدخول للتفعيل',
      busy: false,
      description: 'سجّل الدخول لربط إشعارات هذا الجهاز بحسابك بأمان.',
      permissionLabel: 'يتطلب حسابًا',
      tone: 'neutral' as const,
    };
  }
  if (input.status === 'registering') {
    return {
      action: 'enable' as const,
      actionLabel: 'جارٍ التفعيل…',
      busy: true,
      description: input.message ?? 'جارٍ تسجيل هذا الجهاز للإشعارات.',
      permissionLabel: 'جارٍ التفعيل',
      tone: 'neutral' as const,
    };
  }
  if (input.status === 'unregistering') {
    return {
      action: 'disable' as const,
      actionLabel: 'جارٍ التعطيل…',
      busy: true,
      description: input.message ?? 'جارٍ إلغاء تسجيل هذا الجهاز.',
      permissionLabel: 'جارٍ التعطيل',
      tone: 'neutral' as const,
    };
  }
  if (input.status === 'unsupported') {
    return {
      action: 'none' as const,
      actionLabel: null,
      busy: false,
      description:
        input.message ?? 'الإشعارات غير متاحة في المحاكي. استخدم جهاز iPhone حقيقيًا للاختبار.',
      permissionLabel: 'غير مدعومة في المحاكي',
      tone: 'error' as const,
    };
  }
  if (input.status === 'missing-project-id') {
    return {
      action: 'none' as const,
      actionLabel: null,
      busy: false,
      description:
        input.message ?? 'هذا الإصدار لا يحتوي معرّف مشروع EAS، لذلك لا يمكن تسجيل الإشعارات.',
      permissionLabel: 'إعداد EAS ناقص',
      tone: 'error' as const,
    };
  }
  if (input.status === 'denied' || input.permissionStatus === 'denied') {
    return {
      action: 'settings' as const,
      actionLabel: 'فتح إعدادات iPhone',
      busy: false,
      description: input.message ?? 'إذن الإشعارات مرفوض. افتح إعدادات iPhone للسماح به يدويًا.',
      permissionLabel: 'الإذن مرفوض',
      tone: 'warning' as const,
    };
  }
  if (input.status === 'registered') {
    return {
      action: 'disable' as const,
      actionLabel: 'تعطيل إشعارات هذا الجهاز',
      busy: false,
      description: input.message ?? 'إشعارات الغرف والحساب مفعّلة على هذا الجهاز.',
      permissionLabel: 'مفعّلة على هذا الجهاز',
      tone: 'success' as const,
    };
  }
  if (input.status === 'disabled') {
    return {
      action: 'enable' as const,
      actionLabel: 'إعادة تفعيل الإشعارات',
      busy: false,
      description: input.message ?? 'توقفت إشعارات الحساب على هذا الجهاز.',
      permissionLabel: 'متوقفة على هذا الجهاز',
      tone: 'success' as const,
    };
  }
  if (input.status === 'error') {
    return {
      action: 'enable' as const,
      actionLabel: 'المحاولة مجددًا',
      busy: false,
      description: input.message ?? 'تعذّر تحديث إعدادات الإشعارات الآن.',
      permissionLabel: 'تعذّر التحديث',
      tone: 'error' as const,
    };
  }
  if (input.permissionStatus === 'granted') {
    return {
      action: 'enable' as const,
      actionLabel: 'تسجيل هذا الجهاز',
      busy: false,
      description: 'إذن النظام ممنوح، لكن هذا الجهاز غير مسجل حاليًا في حساب تحدّي.',
      permissionLabel: 'الإذن ممنوح',
      tone: 'neutral' as const,
    };
  }
  if (input.permissionStatus === 'undetermined') {
    return {
      action: 'enable' as const,
      actionLabel: 'تفعيل الإشعارات',
      busy: false,
      description: 'الإذن لم يُطلب بعد. لن يظهر طلب النظام إلا بعد ضغطك على زر التفعيل.',
      permissionLabel: 'الإذن لم يُطلب',
      tone: 'neutral' as const,
    };
  }
  return {
    action: 'enable' as const,
    actionLabel: 'تفعيل الإشعارات',
    busy: false,
    description: 'اضغط التفعيل للتحقق من الإذن وتسجيل هذا الجهاز.',
    permissionLabel: 'حالة الإذن غير معروفة',
    tone: 'neutral' as const,
  };
}
