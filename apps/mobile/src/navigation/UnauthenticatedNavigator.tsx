import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import type { MobileAuthClient } from "../auth/auth-service";
import { SignInScreen } from "../components/SignInScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { SignUpScreen } from "../screens/auth/SignUpScreen";
import { VerificationPendingScreen } from "../screens/auth/VerificationPendingScreen";
import type { AppColors } from "../theme";
import type { SessionSnapshot } from "../types";

export type UnauthenticatedRoute = "SignIn" | "ForgotPassword";

type UnauthenticatedStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  VerificationPending: { email: string };
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<UnauthenticatedStackParamList>();

export function UnauthenticatedNavigator({ auth, colors, initialRoute = "SignIn", notice, onAuthenticated }: { auth: MobileAuthClient; colors: AppColors; initialRoute?: UnauthenticatedRoute; notice: string | null; onAuthenticated: (session: SessionSnapshot) => void }) {
  const navigationTheme: Theme = {
    dark: colors.background !== "#F4F7F5",
    colors: { primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, notification: colors.error },
    fonts: {
      regular: { fontFamily: "System", fontWeight: "400" },
      medium: { fontFamily: "System", fontWeight: "500" },
      bold: { fontFamily: "System", fontWeight: "700" },
      heavy: { fontFamily: "System", fontWeight: "800" },
    },
  };
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }}>
        <Stack.Screen name="SignIn">
          {({ navigation }) => <SignInScreen auth={auth} colors={colors} notice={notice} onForgotPassword={() => navigation.navigate("ForgotPassword")} onSignUp={() => navigation.navigate("SignUp")} />}
        </Stack.Screen>
        <Stack.Screen name="SignUp">
          {({ navigation }) => <SignUpScreen auth={auth} colors={colors} onAuthenticated={onAuthenticated} onBack={() => navigation.navigate("SignIn")} onPending={(email) => navigation.replace("VerificationPending", { email })} />}
        </Stack.Screen>
        <Stack.Screen name="VerificationPending">
          {({ navigation, route }) => <VerificationPendingScreen auth={auth} colors={colors} email={route.params.email} onBack={() => navigation.navigate("SignIn")} />}
        </Stack.Screen>
        <Stack.Screen name="ForgotPassword">
          {({ navigation }) => <ForgotPasswordScreen auth={auth} colors={colors} onBack={() => navigation.navigate("SignIn")} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
