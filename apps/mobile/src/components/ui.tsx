import { createContext, useContext, useEffect, useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
  type ImageSourcePropType, type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

const FontsContext = createContext(false);
export function UiProvider({ fontsReady = false, children }: { fontsReady?: boolean; children: ReactNode }) {
  return <FontsContext.Provider value={fontsReady}>{children}</FontsContext.Provider>;
}
export function Body({ style, weight = 'regular', muted = false, ...props }: TextProps & {
  weight?: keyof typeof theme.fonts; muted?: boolean;
}) {
  const fontsReady = useContext(FontsContext);
  return <Text {...props} style={[styles.body, muted && styles.muted,
    fontsReady && { fontFamily: theme.fonts[weight] }, style]} />;
}
export function Title({ children, small = false, ...props }: TextProps & {small?: boolean}) {
  return <Body {...props} weight="bold" accessibilityRole="header"
    style={[small ? styles.smallTitle : styles.title, props.style]}>{children}</Body>;
}
export function Action({ label, onPress, busy = false, disabled = false, tone = 'primary', testID, compact = false }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger'; testID?: string; compact?: boolean;
}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy}
    onPress={onPress} android_ripple={{color: theme.colors.press}}
    style={({pressed}) => [styles.button, compact && styles.compact, styles[tone],
      pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
    {busy ? <ActivityIndicator color={tone === 'primary' ? theme.colors.ink : theme.colors.gold} /> :
      <Body weight="bold" style={[styles.buttonLabel, tone === 'primary' && styles.primaryLabel,
        tone === 'danger' && styles.dangerText]}>{label}</Body>}
  </Pressable>;
}
export function Field({ label, error, ltr = false, inputRef, ...props }: TextInputProps & {label: string; error?: string; ltr?: boolean; inputRef?: Ref<TextInput>}) {
  const fontsReady = useContext(FontsContext);
  return <View style={styles.field}>
    <Body weight="semibold">{label}</Body>
    <TextInput {...props} ref={inputRef} accessibilityLabel={props.accessibilityLabel || label}
      placeholderTextColor={theme.colors.placeholder} selectionColor={theme.colors.gold}
      style={[styles.input, fontsReady && {fontFamily:theme.fonts.regular}, ltr && styles.ltr, error && styles.inputError, props.style]} />
    {!!error && <Notice message={error} />}
  </View>;
}
export function Notice({ message, tone = 'error', testID }: {message?: string | null; tone?: 'error' | 'info'; testID?: string}) {
  if (!message) return null;
  return <View testID={testID} style={[styles.notice, tone === 'error' && styles.noticeError]}>
    <Body accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite"
      style={tone === 'error' ? styles.dangerText : styles.muted}>{message}</Body>
  </View>;
}
export function Loading({ label = 'جارٍ التحميل…' }: {label?: string}) {
  return <View style={styles.loading} accessibilityLiveRegion="polite">
    <ActivityIndicator color={theme.colors.gold}/><Body muted>{label}</Body>
  </View>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return <View style={styles.empty}><Title small>{title}</Title><Body muted>{description}</Body></View>;
}
export function Avatar({ name, source, size = 48, speaking = false }: {
  name: string; source?: ImageSourcePropType; size?: number; speaking?: boolean;
}) {
  const [failed,setFailed]=useState(false);
  const sourceKey=typeof source==='number'?String(source):JSON.stringify(source);
  useEffect(()=>setFailed(false),[sourceKey]);
  return <View accessible accessibilityLabel={name} style={[styles.avatar, {width: size, height: size, borderRadius: size / 2},
    speaking && styles.speaking]}>
    {source && !failed ? <Image source={source} onError={()=>setFailed(true)} style={{width: size - 6, height: size - 6, borderRadius: size / 2}}
      accessible={false} /> : <Body weight="bold" style={{fontSize: size / 3}}>{name.trim().slice(0, 1) || '؟'}</Body>}
  </View>;
}
export function Panel({ children, style }: {children: ReactNode; style?: ViewStyle}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function FormScreen({ children }: {children: ReactNode}) {
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}
export function Sheet({ title, visible, onClose, children }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top','bottom','left','right']}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.sheetHeader}><Title small>{title}</Title>
          <Action label="إغلاق" tone="secondary" compact onPress={onClose}/></View>
        <FormScreen>{children}</FormScreen>
      </View>
    </SafeAreaView>
  </Modal>;
}
export const ui = StyleSheet.create({
  flex: {flex: 1}, row: {flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm},
  wrap: {flexDirection: 'row-reverse', flexWrap: 'wrap', gap: theme.spacing.sm},
  grow: {flex: 1}, content: {padding: theme.spacing.md, gap: theme.spacing.md, width: '100%', maxWidth: 760, alignSelf: 'center'},
  gap: {gap: theme.spacing.md}, caption: {fontSize: theme.type.caption}, small: {fontSize: theme.type.small},
  gold: {color: theme.colors.gold}, center: {textAlign: 'center'}, ltr: {writingDirection: 'ltr', textAlign: 'left'},
  rule: {height: 1, backgroundColor: theme.colors.borderSoft},
});
const styles = StyleSheet.create({
  flex: {flex: 1},
  body: {fontSize: theme.type.body, lineHeight: 26, color: theme.colors.text, textAlign: 'right', writingDirection: 'rtl'},
  muted: {color: theme.colors.muted}, title: {fontSize: theme.type.title, lineHeight: 38},
  smallTitle: {fontSize: 19, lineHeight: 30},
  button: {minHeight: theme.touch, paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1},
  compact: {paddingHorizontal: 12, paddingVertical: 8},
  primary: {backgroundColor: theme.colors.gold, borderColor: theme.colors.goldLight},
  secondary: {backgroundColor: theme.colors.surfaceStrong, borderColor: theme.colors.controlBorder},
  danger: {backgroundColor: theme.colors.surfaceStrong, borderColor: theme.colors.danger},
  buttonLabel: {fontSize: theme.type.small, textAlign: 'center'}, primaryLabel: {color: theme.colors.ink},
  dangerText: {color: theme.colors.danger}, pressed: {opacity: 0.75}, disabled: {opacity: 0.5},
  field: {gap: theme.spacing.sm}, input: {minHeight: 56, borderWidth: 1, borderColor: theme.colors.controlBorder,
    backgroundColor: theme.colors.background, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md,
    paddingVertical: 12, fontSize: theme.type.body, color: theme.colors.text, textAlign: 'right', writingDirection: 'rtl'},
  ltr: {textAlign: 'left', writingDirection: 'ltr'}, inputError: {borderColor: theme.colors.danger},
  notice: {padding: theme.spacing.sm, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.borderSoft},
  noticeError: {borderColor: theme.colors.danger},
  loading: {padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center'},
  empty: {padding: theme.spacing.lg, gap: theme.spacing.sm},
  avatar: {backgroundColor: theme.colors.surfaceStrong, borderWidth: 2, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  speaking: {borderColor: theme.colors.success},
  panel: {padding: theme.spacing.md, gap: theme.spacing.sm, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface},
  formContent: {flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center',
    padding: theme.spacing.md, gap: theme.spacing.md},
  modal: {flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end', padding: theme.spacing.sm},
  sheet: {maxHeight: '94%', minHeight: 240, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', flexShrink: 1},
  sheetHeader: {flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    gap: theme.spacing.sm, padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSoft},
});
