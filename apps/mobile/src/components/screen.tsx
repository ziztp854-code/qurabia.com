import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  includeTopInset = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  includeTopInset?: boolean;
}) {
  const content = <View style={styles.content}>{children}</View>;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={keyboardAvoiding}
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={includeTopInset ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  keyboardAvoiding: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
    direction: 'rtl',
  },
});
