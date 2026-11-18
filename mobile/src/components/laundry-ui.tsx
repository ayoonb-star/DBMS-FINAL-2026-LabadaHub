import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export const Colors = {
  ink: '#12263a',
  muted: '#66798c',
  primary: '#0879ad',
  primaryDark: '#07577c',
  paleBlue: '#e8f4fb',
  green: '#087a55',
  paleGreen: '#e6f5ed',
  amber: '#9a5c08',
  paleAmber: '#fff3db',
  red: '#a83d35',
  paleRed: '#ffebe8',
  border: '#e4ebf1',
  background: '#f4f7fa',
  white: '#ffffff',
};

export function AppScreen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AccountBar />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountBar() {
  const { user, signOut } = useAuth();
  if (!user) {
    return null;
  }
  const roleName = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  return (
    <View style={styles.accountBar}>
      <View style={styles.accountCopy}>
        <Text style={styles.accountName}>{user.name}</Text>
        <Text style={styles.accountRole}>{roleName} account</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          signOut();
          router.replace('/');
        }}
        style={styles.signOutButton}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

export function PageHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function Pill({ children, tone = 'blue' }: PropsWithChildren<{ tone?: 'blue' | 'green' | 'amber' | 'red' | 'neutral' }>) {
  const backgroundStyle = {
    blue: styles.pillBlue,
    green: styles.pillGreen,
    amber: styles.pillAmber,
    red: styles.pillRed,
    neutral: styles.pillNeutral,
  }[tone];
  const textStyle = {
    blue: styles.pillBlueText,
    green: styles.pillGreenText,
    amber: styles.pillAmberText,
    red: styles.pillRedText,
    neutral: styles.pillNeutralText,
  }[tone];
  return (
    <View style={[styles.pill, backgroundStyle]}>
      <Text style={[styles.pillText, textStyle]}>{children}</Text>
    </View>
  );
}

export function ActionButton({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: PropsWithChildren<{ onPress: () => void; secondary?: boolean; disabled?: boolean }>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{children}</Text>
    </Pressable>
  );
}

export function ChoiceButton({
  selected,
  children,
  onPress,
  disabled = false,
}: PropsWithChildren<{ selected: boolean; onPress: () => void; disabled?: boolean }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.choiceDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Metric({ label, value, note, children }: { label: string; value: string; note?: string; children?: ReactNode }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.eyebrow}>{label.toUpperCase()}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {note ? <Text style={styles.detail}>{note}</Text> : null}
      {children}
    </Card>
  );
}

export function money(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 92, gap: 16 },
  accountBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 },
  accountCopy: { gap: 2 },
  accountName: { color: Colors.ink, fontSize: 11, fontWeight: '700' },
  accountRole: { color: Colors.muted, fontSize: 9 },
  signOutButton: { backgroundColor: Colors.paleBlue, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  signOutText: { color: Colors.primaryDark, fontSize: 10, fontWeight: '700' },
  header: { gap: 5, paddingBottom: 2 },
  eyebrow: { color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  pageTitle: { color: Colors.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  detail: { color: Colors.muted, fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: Colors.white, borderColor: Colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  sectionTitle: { gap: 3 },
  sectionText: { color: Colors.ink, fontSize: 16, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pillText: { fontSize: 10, fontWeight: '700' },
  pillBlue: { backgroundColor: Colors.paleBlue },
  pillBlueText: { color: Colors.primaryDark },
  pillGreen: { backgroundColor: Colors.paleGreen },
  pillGreenText: { color: Colors.green },
  pillAmber: { backgroundColor: Colors.paleAmber },
  pillAmberText: { color: Colors.amber },
  pillRed: { backgroundColor: Colors.paleRed },
  pillRedText: { color: Colors.red },
  pillNeutral: { backgroundColor: '#eef1f4' },
  pillNeutralText: { color: Colors.muted },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: Colors.primary },
  buttonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  secondaryButton: { backgroundColor: Colors.paleBlue },
  secondaryButtonText: { color: Colors.primaryDark },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.76 },
  choice: { borderWidth: 1, borderColor: Colors.border, borderRadius: 13, padding: 12, backgroundColor: Colors.white },
  choiceSelected: { borderColor: Colors.primary, backgroundColor: '#f0f9fd' },
  choiceDisabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metric: { flex: 1, padding: 13, gap: 6 },
  metricValue: { color: Colors.ink, fontSize: 22, fontWeight: '800' },
});
