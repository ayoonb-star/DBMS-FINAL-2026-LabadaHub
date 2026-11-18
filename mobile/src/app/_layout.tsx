import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthScreen } from '@/components/auth-screen';
import AppTabs from '@/components/app-tabs';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { LaundryProvider } from '@/context/laundry-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <LaundryProvider>
          <AnimatedSplashOverlay />
          <Application />
        </LaundryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function Application() {
  const { user } = useAuth();
  return <View style={styles.app}>{user ? <AppTabs /> : <AuthScreen />}</View>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
