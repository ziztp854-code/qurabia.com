import { createContext, useContext, type ReactNode } from 'react';
import { View, StyleSheet, type TextProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Action, Body, FormScreen, Panel } from '../components/ui';
import { theme } from './theme';

const FontsReadyContext = createContext(false);
export const FontsReadyProvider = FontsReadyContext.Provider;
export const useFontsReady = () => useContext(FontsReadyContext);
export function AppText({ weight = 'regular', ...props }: TextProps & {
  weight?: 'regular' | 'semibold' | 'bold' | 'heading'; style?: StyleProp<TextStyle>;
}) { return <Body {...props} weight={weight === 'heading' ? 'bold' : weight}/>; }
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return <FormScreen footer={footer}><View style={styles.content}>{children}</View></FormScreen>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}><Panel>{children}</Panel></View>;
}
export function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, accessibilityHint }: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost'; loading?: boolean;
  disabled?: boolean; accessibilityHint?: string;
}) {
  return <View accessibilityHint={accessibilityHint}><Action label={label} onPress={onPress}
    tone={variant === 'ghost' ? 'secondary' : 'primary'} busy={loading} disabled={disabled}/></View>;
}
export const uiStyles = StyleSheet.create({
  eyebrow: { color: theme.colors.gold, fontSize: 14 },
  title: { color: theme.colors.text, fontSize: 25, lineHeight: 38, marginTop: theme.spacing.xs },
  body: { color: theme.colors.muted, fontSize: 15, lineHeight: 26, marginTop: theme.spacing.sm },
  small: { color: theme.colors.muted, fontSize: 12, lineHeight: 20 },
  danger: { color: theme.colors.danger, fontSize: 13, lineHeight: 21 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm },
});
const styles = StyleSheet.create({ content: { flexGrow: 1, gap: theme.spacing.md } });
