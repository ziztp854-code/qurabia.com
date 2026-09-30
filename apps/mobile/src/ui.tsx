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

type Weight = 'regular' | 'semibold' | 'bold';

const FONT_FAMILIES: Record<Weight, string> = {
  regular: 'ReadexPro_400Regular',
  semibold: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
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
      style={[styles.text, fontsReady ? { fontFamily: FONT_FAMILIES[weight] } : null, style]}
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
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientBottom} />
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
        <ActivityIndicator color={primary ? theme.colors.background : theme.colors.gold} />
      ) : (
        <AppText
          weight="bold"
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
  title: { color: theme.colors.text, fontSize: 26, lineHeight: 36, marginTop: theme.spacing.xs },
  body: { color: theme.colors.muted, fontSize: 15, lineHeight: 26, marginTop: theme.spacing.sm },
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
  ambientTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.colors.gold,
    opacity: 0.055,
    top: -130,
    right: -80,
  },
  ambientBottom: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: theme.colors.cyan,
    opacity: 0.035,
    bottom: -140,
    left: -110,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.gold,
    borderColor: theme.colors.goldLight,
    shadowColor: theme.colors.gold,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonGhost: { backgroundColor: 'transparent', borderColor: theme.colors.border },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 17, textAlign: 'center' },
  buttonTextPrimary: { color: theme.colors.background },
  buttonTextGhost: { color: theme.colors.goldLight },
});
