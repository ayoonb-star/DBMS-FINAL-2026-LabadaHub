import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { useAuth } from '@/context/auth-context';
import type { AccountRole } from '@/context/auth-context';
import { Colors } from './laundry-ui';

const ROLES: {
  id: AccountRole;
  label: string;
  loginLabel: string;
  description: string;
}[] = [
  { id: 'client', label: 'Client', loginLabel: 'Client sign in', description: 'Book laundry services and track your orders.' },
  { id: 'staff', label: 'Staff', loginLabel: 'Staff sign in', description: 'Manage laundry intake and update orders.' },
  { id: 'admin', label: 'Admin', loginLabel: 'Admin sign in', description: 'Manage your branch and team accounts.' },
];

const DEMO_ADMIN_EMAIL = 'admin@freshstream.local';
const DEMO_ADMIN_PASSWORD = 'LaundryAdmin26!';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [role, setRole] = useState<AccountRole | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const changeMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode);
    setError('');
  };

  const chooseRole = (nextRole: AccountRole) => {
    setRole(nextRole);
    setError('');
  };

  const submit = () => {
    setError('');
    if (!role) {
      setError('Choose an account type first.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Enter your name.');
        return;
      }
      if (password.length < 8) {
        setError('Use a password with at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The passwords do not match.');
        return;
      }
      const signupError = signUp({ name, email, password, role, inviteCode });
      if (signupError) {
        setError(signupError);
      }
      return;
    }

    const signInError = signIn(email, password, role);
    if (signInError) {
      setError(signInError);
    }
  };

  const fillDemoAdmin = () => {
    setEmail(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASSWORD);
    setError('');
  };

  const selectedRole = ROLES.find((item) => item.id === role);
  const showingPortalChoices = role === null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Image
            accessibilityLabel="LabadaHub Laundry Booking Management System"
            contentFit="contain"
            source={require('../../assets/images/labadahub-logo.png')}
            style={styles.brandLogo}
          />

          <View style={styles.formCard}>
            <View style={styles.modeSwitch}>
              <ModeButton selected={mode === 'login'} onPress={() => changeMode('login')}>Sign in</ModeButton>
              <ModeButton selected={mode === 'signup'} onPress={() => changeMode('signup')}>Create account</ModeButton>
            </View>

            {showingPortalChoices ? (
              <>
                <Text style={styles.title}>{mode === 'login' ? 'Choose your sign-in portal' : 'Choose account type'}</Text>
                <Text style={styles.subtitle}>
                  {mode === 'login'
                    ? 'Client and admin accounts use separate sign-in forms.'
                    : 'Client accounts are open. Staff and admin accounts need an invitation.'}
                </Text>
                <View style={styles.portalList}>
                  {ROLES.map((item) => (
                    <PortalButton
                      key={item.id}
                      role={item}
                      mode={mode}
                      onPress={() => chooseRole(item.id)}
                    />
                  ))}
                </View>
                {mode === 'signup' ? (
                  <Text style={styles.portalNote}>An administrator can generate staff and admin invitations from the Admin screen.</Text>
                ) : (
                  <View style={styles.demoBox}>
                    <Text style={styles.demoTitle}>Need to try the admin demo?</Text>
                    <Text style={styles.demoDescription}>Open the Admin sign-in form and use its demo-account button.</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRole(null);
                    setError('');
                  }}
                  style={styles.backButton}>
                  <Text style={styles.backText}>‹  {mode === 'login' ? 'Choose another sign-in portal' : 'Choose account type'}</Text>
                </Pressable>

                <Text style={styles.title}>
                  {mode === 'login' ? selectedRole?.loginLabel : `Create ${selectedRole?.label.toLowerCase()} account`}
                </Text>
                <Text style={styles.subtitle}>
                  {mode === 'login'
                    ? selectedRole?.description
                    : role === 'client'
                      ? 'Sign up to book laundry services and track your orders.'
                      : 'Use the one-time invitation code provided by your administrator.'}
                </Text>

                {mode === 'signup' ? (
                  <FormField label="FULL NAME" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" />
                ) : null}
                <FormField
                  label="EMAIL ADDRESS"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <FormField
                  label="PASSWORD"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                {mode === 'signup' ? (
                  <>
                    <FormField
                      label="CONFIRM PASSWORD"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter your password"
                      secureTextEntry
                      autoComplete="new-password"
                    />
                    {role !== 'client' ? (
                      <FormField
                        label="INVITATION CODE"
                        value={inviteCode}
                        onChangeText={setInviteCode}
                        placeholder={`Enter your ${role} invitation code`}
                        autoCapitalize="characters"
                      />
                    ) : null}
                  </>
                ) : null}

                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={submit}
                  style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}>
                  <Text style={styles.submitText}>{mode === 'login' ? `Sign in as ${selectedRole?.label}` : 'Create account'}</Text>
                </Pressable>

                {mode === 'login' && role === 'admin' ? (
                  <View style={styles.demoBox}>
                    <Text style={styles.demoTitle}>Try the admin demo</Text>
                    <Text style={styles.demoDescription}>Sample account for testing staff invitations and store tools.</Text>
                    <Pressable accessibilityRole="button" onPress={fillDemoAdmin} style={styles.demoButton}>
                      <Text style={styles.demoButtonText}>Use demo admin account</Text>
                    </Pressable>
                  </View>
                ) : null}
                {mode === 'signup' && role !== 'client' ? (
                  <View style={styles.inviteBox}>
                    <Text style={styles.inviteTitle}>Invitation required</Text>
                    <Text style={styles.inviteDescription}>Staff and admin accounts are created by an administrator. Ask your store admin for a one-time invite code.</Text>
                  </View>
                ) : null}
              </>
            )}

            <Text style={styles.disclaimer}>Demo only. Accounts are held in memory on this device; this is not production authentication.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PortalButton({
  role,
  mode,
  onPress,
}: {
  role: (typeof ROLES)[number];
  mode: 'login' | 'signup';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.portalButton, pressed && styles.pressed]}>
      <View style={styles.portalCopy}>
        <Text style={styles.portalTitle}>{mode === 'login' ? role.loginLabel : `${role.label} account`}</Text>
        <Text style={styles.portalDescription}>{role.description}</Text>
      </View>
      <Text style={styles.portalArrow}>›</Text>
    </Pressable>
  );
}

function ModeButton({ children, selected, onPress }: { children: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeButton, selected && styles.modeButtonSelected]}>
      <Text style={[styles.modeText, selected && styles.modeTextSelected]}>{children}</Text>
    </Pressable>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'characters' | 'sentences';
  autoComplete?: 'name' | 'email' | 'new-password' | 'current-password';
};

function FormField({ label, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={styles.input}
        placeholderTextColor="#8a9aaa"
        returnKeyType="next"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f1f7fa' },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28, gap: 8 },
  brandLogo: { width: '100%', maxWidth: 360, height: 72, alignSelf: 'center', marginBottom: 8 },
  formCard: { width: '100%', maxWidth: 470, alignSelf: 'center', backgroundColor: '#ffffff', borderColor: '#e4ebf1', borderWidth: 1, borderRadius: 22, padding: 18, gap: 13 },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#f1f5f8', borderRadius: 12, padding: 3 },
  modeButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 39, borderRadius: 10 },
  modeButtonSelected: { backgroundColor: '#ffffff', shadowColor: '#132d41', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  modeText: { color: Colors.muted, fontSize: 12, fontWeight: '600' },
  modeTextSelected: { color: Colors.primaryDark, fontWeight: '700' },
  title: { color: Colors.ink, fontSize: 24, fontWeight: '800', marginTop: 1 },
  subtitle: { color: Colors.muted, fontSize: 12, lineHeight: 17, marginTop: -8 },
  field: { gap: 6 },
  fieldLabel: { color: Colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  input: { minHeight: 45, borderWidth: 1, borderColor: '#dce5ec', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, color: Colors.ink, fontSize: 13, backgroundColor: '#ffffff' },
  error: { borderRadius: 10, backgroundColor: '#ffebe8', color: '#a83d35', paddingHorizontal: 11, paddingVertical: 9, fontSize: 11, lineHeight: 16 },
  submitButton: { minHeight: 48, borderRadius: 13, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  submitText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.78 },
  portalList: { gap: 9 },
  portalButton: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: '#dce5ec', borderRadius: 13, backgroundColor: '#ffffff' },
  portalCopy: { flex: 1, gap: 4 },
  portalTitle: { color: Colors.ink, fontSize: 13, fontWeight: '700' },
  portalDescription: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  portalArrow: { color: Colors.primary, fontSize: 25, fontWeight: '500' },
  portalNote: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 2, marginBottom: -3 },
  backText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  demoBox: { borderRadius: 13, borderWidth: 1, borderColor: '#dbeaf3', backgroundColor: '#f4f9fc', padding: 12, gap: 6 },
  demoTitle: { color: Colors.ink, fontSize: 12, fontWeight: '700' },
  demoDescription: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  demoButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  demoButtonText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  inviteBox: { borderRadius: 13, backgroundColor: '#fff7e7', padding: 12, gap: 5 },
  inviteTitle: { color: '#80500c', fontSize: 12, fontWeight: '700' },
  inviteDescription: { color: '#80500c', fontSize: 10, lineHeight: 15 },
  disclaimer: { color: '#778796', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingTop: 2 },
});
