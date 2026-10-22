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
    fontsReady ? { fontFamily: theme.fonts[weight] } :
      { fontWeight: weight === 'bold' ? '700' : weight === 'semibold' ? '600' : '400' }, style]} />;
}
export function Title({ children, small = false, ...props }: TextProps & {small?: boolean}) {
  return <Body {...props} weight="bold" accessibilityRole="header"
    style={[small ? styles.smallTitle : styles.title, props.style]}>{children}</Body>;
}
export function Action({ label, onPress, busy = false, disabled = false, tone = 'primary', testID, compact = false, accessibilityLabel }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger'; testID?: string; compact?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
    accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy}
    onPress={onPress} android_ripple={{color: theme.colors.press}}
    style={({pressed}) => [styles.button, compact && styles.compact, styles[tone],
      pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
    <View style={styles.buttonContent}>
      {busy && <ActivityIndicator size="small" color={tone === 'primary' ? theme.colors.ink : theme.colors.gold} />}
      <Body weight="bold" style={[styles.buttonLabel, tone === 'primary' && styles.primaryLabel,
        tone === 'danger' && styles.dangerText]}>{label}</Body>
    </View>
  </Pressable>;
}
export function Field({ label, error, ltr = false, inputRef, onFocus, onBlur, hideLabel = false, ...props }: TextInputProps & {
  label: string; error?: string; ltr?: boolean; inputRef?: Ref<TextInput>; hideLabel?: boolean;
}) {
  const fontsReady = useContext(FontsContext);
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    {!hideLabel && <Body weight="semibold" style={styles.fieldLabel}>{label}</Body>}
    <TextInput {...props} ref={inputRef} accessibilityLabel={props.accessibilityLabel || label}
      placeholderTextColor={theme.colors.placeholder} selectionColor={theme.colors.gold}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[styles.input, fontsReady && {fontFamily:theme.fonts.regular}, ltr && styles.ltr,
        focused && styles.inputFocused, error && styles.inputError, props.style]} />
    {!!error && <Notice message={error} />}
  </View>;
}
export function Notice({ message, tone = 'error', testID }: {message?: string | null; tone?: 'error' | 'info'; testID?: string}) {
  if (!message) return null;
  return <View testID={testID} style={[styles.notice, tone === 'error' && styles.noticeError]}>
    <Body accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite"
      style={[ui.small, tone === 'error' ? styles.dangerText : styles.muted]}>{message}</Body>
  </View>;
}
export function Loading({ label = 'جارٍ التحميل…' }: {label?: string}) {
  return <View style={styles.loading} accessibilityLiveRegion="polite">
    <ActivityIndicator color={theme.colors.gold}/><Body muted>{label}</Body>
  </View>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return <View style={styles.empty}>
    <View style={styles.emptyMark} accessible={false}>
      {[16, 28, 40, 28, 16].map((height, index) => <View key={index} style={[styles.soundBar, {height}]}/>)}
    </View>
    <Title small style={ui.center}>{title}</Title><Body muted style={ui.center}>{description}</Body>
  </View>;
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
export function FormScreen({ children, footer }: {children: ReactNode; footer?: ReactNode}) {
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>{children}</ScrollView>
    {footer && <View style={styles.formFooter}>{footer}</View>}
  </KeyboardAvoidingView>;
}
export function Sheet({ title, visible, onClose, children, footer }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top','bottom','left','right']}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.sheetHandle} accessible={false}/>
        <View style={styles.sheetHeader}><Title small style={ui.grow}>{title}</Title>
          <Action label="إغلاق" tone="secondary" compact onPress={onClose}/></View>
        <FormScreen footer={footer}>{children}</FormScreen>
      </View>
    </SafeAreaView>
  </Modal>;
}
export const ui = StyleSheet.create({
  flex: {flex: 1}, row: {flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm},
  wrap: {flexDirection: 'row-reverse', flexWrap: 'wrap', gap: theme.spacing.sm},
  grow: {flex: 1}, content: {padding: theme.spacing.md, paddingBottom: theme.spacing.lg, gap: theme.spacing.md,
    width: '100%', maxWidth: 760, alignSelf: 'center'},
  gap: {gap: theme.spacing.md}, caption: {fontSize: theme.type.caption, lineHeight: theme.lineHeight.caption},
  small: {fontSize: theme.type.small, lineHeight: theme.lineHeight.small}, gold: {color: theme.colors.gold},
  center: {textAlign: 'center'}, ltr: {writingDirection: 'ltr', textAlign: 'left'},
  rule: {height: 1, backgroundColor: theme.colors.borderSoft},
});
const styles = StyleSheet.create({
  flex: {flex: 1},
  body: {fontSize: theme.type.body, lineHeight: theme.lineHeight.body, color: theme.colors.text, textAlign: 'right', writingDirection: 'rtl'},
  muted: {color: theme.colors.muted}, title: {fontSize: theme.type.title, lineHeight: theme.lineHeight.title},
  smallTitle: {fontSize: theme.type.section, lineHeight: theme.lineHeight.section},
  button: {minHeight: 56, paddingHorizontal: theme.spacing.md, paddingVertical: 12,
    borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1},
  buttonContent: {flexDirection: 'row-reverse', gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'center'},
  compact: {minHeight: theme.touch, paddingHorizontal: 12, paddingVertical: 8},
  primary: {backgroundColor: theme.colors.gold, borderColor: theme.colors.goldLight,
    borderBottomWidth: 3, borderBottomColor: theme.colors.goldDark},
  secondary: {backgroundColor: theme.colors.surfaceStrong, borderColor: theme.colors.controlBorder},
  danger: {backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger},
  buttonLabel: {fontSize: theme.type.small, lineHeight: theme.lineHeight.small, flexShrink: 1, textAlign: 'center'},
  primaryLabel: {color: theme.colors.ink}, dangerText: {color: theme.colors.danger},
  pressed: {opacity: 0.78}, disabled: {opacity: 0.55},
  field: {gap: theme.spacing.sm}, fieldLabel: {fontSize: theme.type.small, lineHeight: theme.lineHeight.small},
  input: {minHeight: 56, borderWidth: 1, borderColor: theme.colors.controlBorder,
    backgroundColor: theme.colors.input, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.md,
    paddingVertical: 12, fontSize: theme.type.body, lineHeight: theme.lineHeight.body, color: theme.colors.text, textAlign: 'right', writingDirection: 'rtl'},
  inputFocused: {borderColor: theme.colors.focus}, ltr: {textAlign: 'left', writingDirection: 'ltr'},
  inputError: {borderColor: theme.colors.danger},
  notice: {padding: 12, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.goldSoft, borderRightWidth: 3},
  noticeError: {borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft},
  loading: {padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center'},
  empty: {paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xl, gap: theme.spacing.sm, alignItems: 'center'},
  emptyMark: {height: 64, width: 80, borderRadius: theme.radius.lg, flexDirection: 'row', gap: 5,
    backgroundColor: theme.colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.sm},
  soundBar: {width: 4, borderRadius: 2, backgroundColor: theme.colors.gold},
  avatar: {backgroundColor: theme.colors.goldSoft, borderWidth: 2, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  speaking: {borderColor: theme.colors.success},
  panel: {padding: theme.spacing.lg, gap: 12, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface},
  formContent: {flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center',
    padding: theme.spacing.md, paddingBottom: theme.spacing.lg, gap: theme.spacing.md},
  formFooter: {width: '100%', maxWidth: 760, alignSelf: 'center', padding: theme.spacing.md, gap: theme.spacing.sm,
    borderTopWidth: 1, borderTopColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface},
  modal: {flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end', padding: theme.spacing.sm},
  // Explicit available-height ownership keeps the scroll viewport measurable and
  // prevents a long form from collapsing to the old 240px minimum-sized sheet.
  sheet: {height: '92%', width: '100%', maxWidth: 760, alignSelf: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden'},
  sheetHandle: {width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, backgroundColor: theme.colors.controlBorder},
  sheetHeader: {flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.md,
    padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSoft},
});
