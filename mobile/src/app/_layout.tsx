import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerBackTitle: 'FoodRescue' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
      <AnimatedSplashOverlay />
    </>
  );
}
