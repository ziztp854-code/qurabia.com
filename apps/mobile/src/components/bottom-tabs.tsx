import { StyleSheet, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeScreen } from '../navigation/use-navigation';
import { Body, ui } from './ui';
import { theme } from '../theme';

const tabs = [
  { id: 'home', label: 'الرئيسية', icon: require('../../assets/icons/home.svg') },
  { id: 'rooms', label: 'الغرف', icon: require('../../assets/icons/rooms.svg') },
  { id: 'profile', label: 'حسابي', icon: require('../../assets/icons/account.svg') },
] as const;

export function BottomTabs({ screen, disabled = false, onNavigate }: {
  screen: NativeScreen; disabled?: boolean; onNavigate: (screen: NativeScreen) => void;
}) {
  return <View style={styles.rail} accessibilityRole="tablist">
    {tabs.map(({ id, label, icon }) => {
      const selected = screen === id || (id === 'rooms' && screen === 'room');
      return <Pressable key={id} testID={'nav-' + id} disabled={disabled}
        accessibilityRole="tab" accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        onPress={() => onNavigate(id)} android_ripple={{ color: theme.colors.press, borderless: false }}
        style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}>
        <Image source={icon} tintColor={selected ? theme.colors.goldLight : theme.colors.muted}
          style={styles.icon} contentFit="contain" accessible={false} pointerEvents="none"/>
        <Body weight="semibold" style={[ui.caption, styles.label, selected && ui.gold]}>{label}</Body>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  rail: { flexDirection: 'row-reverse', padding: 6, marginHorizontal: 12, marginTop: 6, marginBottom: 6,
    borderRadius: 24, borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface },
  tab: { flex: 1, minHeight: 62, paddingVertical: 6, paddingHorizontal: 4, gap: 2,
    alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1,
    borderColor: theme.colors.surface },
  selected: { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.border },
  icon: { width: 24, height: 24 },
  label: { textAlign: 'center', lineHeight: 20, color: theme.colors.muted },
  pressed: { opacity: 0.78 },
});
