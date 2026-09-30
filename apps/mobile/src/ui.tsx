import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from './theme';

const FontsReadyContext = createContext(false);

export const FontsReadyProvider = FontsReadyContext.Provider;

export function useFontsReady() {
  return useContext(FontsReadyContext);
}

type Weight = 'regular' | 'semibold' | 'bold' | 'heading';

const FONT_FAMILIES: Record<Weight, string> = {
  regular: theme.fonts.body,
  semibold: theme.fonts.bodySemibold,
  bold: theme.fonts.bodyBold,
  heading: theme.fonts.heading,
};

const FALLBACK_WEIGHTS: Record<Weight, TextStyle['fontWeight']> = {
  regular: '400',
  semibold: '600',
  bold: '700',
  heading: '800',
};

export function AppText({
  weight = 'regular',
  style,
  ...props
}: TextProps & { weight?: Weight; style?: StyleProp<TextStyle> }) {
  const fontsReady = useContext(FontsReadyContext);
  return (
    <Text
      {...props}
      style={[
        styles.text,
        fontsReady
          ? { fontFamily: FONT_FAMILIES[weight] }
          : { fontWeight: FALLBACK_WEIGHTS[weight] },
        style,
      ]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <View pointerEvents="none" style={styles.backdrop} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, styles.flex]}>
          <View style={[styles.content, styles.flex]}>{children}</View>
        </View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={{ color: theme.colors.press }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        pressed && !inactive ? styles.buttonPressed : null,
        inactive ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? theme.colors.onGold : theme.colors.gold} />
      ) : (
        <AppText
          weight="heading"
          style={[styles.buttonText, primary ? styles.buttonTextPrimary : styles.buttonTextGhost]}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export const uiStyles = StyleSheet.create({
  eyebrow: { color: theme.colors.gold, fontSize: 14 },
  title: { color: theme.colors.text, fontSize: 25, lineHeight: 36, marginTop: theme.spacing.xs },
  body: { color: theme.colors.textSoft, fontSize: 15, lineHeight: 26, marginTop: theme.spacing.sm },
  small: { color: theme.colors.muted, fontSize: 12, lineHeight: 20 },
  danger: { color: theme.colors.danger, fontSize: 13, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { color: theme.colors.text, textAlign: 'right', writingDirection: 'rtl' },
  safeArea: { flex: 1, backgroundColor: theme.colors.background, direction: 'rtl' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: theme.spacing.md },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    experimental_backgroundImage: [
      'linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px)',
      'linear-gradient(0deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px)',
      'linear-gradient(120deg, transparent 36%, rgba(255, 197, 89, 0.045) 36.2%, rgba(255, 197, 89, 0.045) 36.45%, transparent 36.7%)',
      'linear-gradient(240deg, transparent 62%, rgba(0, 212, 255, 0.04) 62.2%, rgba(0, 212, 255, 0.04) 62.45%, transparent 62.7%)',
    ].join(', '),
    experimental_backgroundSize: '88px 88px, 88px 88px, auto, auto',
  },
  card: {
    backgroundColor: theme.colors.surface,
    experimental_backgroundImage: theme.gradients.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    boxShadow: '0 24px 70px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.gold,
    experimental_backgroundImage: theme.gradients.gold,
    borderColor: 'rgba(255, 197, 89, 0.42)',
    boxShadow: '0 16px 42px rgba(245, 165, 36, 0.18)',
  },
  buttonGhost: {
    backgroundColor: theme.colors.ghost,
    borderColor: theme.colors.borderSoft,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.055)',
  },
  buttonPressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, textAlign: 'center' },
  buttonTextPrimary: { color: theme.colors.onGold },
  buttonTextGhost: { color: theme.colors.text },
});
