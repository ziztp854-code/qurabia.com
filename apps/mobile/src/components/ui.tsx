import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useNetworkState } from '../network/network-provider';
import { theme } from '../theme';

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

export function Card({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <View style={[styles.card, accent ? styles.cardAccent : null]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  accessibilityHint,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? `${label}، جارٍ التنفيذ` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && !busy ? styles.buttonPressed : null,
        disabled || busy ? styles.buttonDisabled : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.background} accessible={false} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  accessibilityHint,
}: {
  label: string;
  onPress(): void;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} accessible={false}>
        {label}
      </Text>
      <TextInput
        {...props}
        style={[styles.input, props.style, error ? styles.inputError : null]}
        placeholderTextColor={theme.colors.placeholder}
        selectionColor={theme.colors.gold}
        accessibilityLabel={label}
        accessibilityHint={props.accessibilityHint}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ConnectionBanner() {
  const state = useNetworkState();
  const text =
    state === 'online' ? 'الإنترنت متاح' : state === 'offline' ? 'لا يوجد اتصال' : 'نفحص الاتصال';
  return (
    <View
      style={[styles.connection, state === 'offline' ? styles.connectionOffline : null]}
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      accessible
    >
      <View
        style={[styles.connectionDot, state === 'offline' ? styles.connectionDotOffline : null]}
        accessible={false}
      />
      <Text style={styles.connectionText} accessible={false}>
        {text}
      </Text>
    </View>
  );
}

export function LoadingStatus({ label }: { label: string }) {
  return (
    <View
      style={styles.loadingStatus}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
      accessible
    >
      <ActivityIndicator color={theme.colors.gold} accessible={false} />
      <Text style={styles.loadingStatusText} accessible={false}>
        {label}
      </Text>
    </View>
  );
}

export function FeatureRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.featureRow}>
        <View style={styles.featureCopy}>
          <Text style={styles.featureTitle}>{title}</Text>
          <Text style={styles.featureDescription}>{description}</Text>
        </View>
        {action}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { gap: theme.spacing.xs },
  eyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.typography.semibold,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 30,
    lineHeight: 40,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  description: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 15,
    lineHeight: 25,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderSoft,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardAccent: { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceStrong },
  primaryButton: {
    minHeight: theme.touch.minimum,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.gold,
    borderWidth: 1,
    borderColor: theme.colors.goldLight,
  },
  secondaryButton: {
    minHeight: theme.touch.minimum,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: theme.colors.background,
    fontFamily: theme.typography.bold,
    fontSize: 16,
    writingDirection: 'rtl',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 15,
    writingDirection: 'rtl',
  },
  field: { gap: theme.spacing.xs },
  label: {
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    minHeight: 52,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.typography.regular,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputError: { borderColor: theme.colors.danger },
  error: {
    color: theme.colors.danger,
    fontFamily: theme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  connection: {
    minHeight: 32,
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  connectionOffline: { borderColor: theme.colors.danger },
  connectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  connectionDotOffline: { backgroundColor: theme.colors.danger },
  connectionText: {
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
    writingDirection: 'rtl',
  },
  loadingStatus: {
    minHeight: theme.touch.minimum,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  loadingStatusText: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  featureRow: { gap: theme.spacing.md },
  featureCopy: { flex: 1, gap: theme.spacing.xs },
  featureTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  featureDescription: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
