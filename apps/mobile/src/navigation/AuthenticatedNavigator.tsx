import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text } from "react-native";

import type { DevStrideApi } from "../api";
import { ProfileScreen } from "../components/ProfileScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { ConversationsScreen } from "../screens/ConversationsScreen";
import type { AppColors } from "../theme";
import type { AuthenticatedUser, Profile } from "../types";

export type AuthenticatedStackParamList = {
  Conversations: undefined;
  Chat: { conversationId: string };
  Profile: undefined;
};

type AuthenticatedNavigatorProps = {
  api: DevStrideApi;
  colors: AppColors;
  user: AuthenticatedUser;
  profile: Profile;
  onSignOut: () => Promise<string | null>;
  onUnauthorized: () => void;
};

const Stack = createNativeStackNavigator<AuthenticatedStackParamList>();

export function AuthenticatedNavigator({
  api,
  colors,
  user,
  profile,
  onSignOut,
  onUnauthorized,
}: AuthenticatedNavigatorProps) {
  const navigationTheme: Theme = {
    dark: colors.background !== "#F4F7F5",
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.error,
    },
    fonts: {
      regular: { fontFamily: "System", fontWeight: "400" },
      medium: { fontFamily: "System", fontWeight: "500" },
      bold: { fontFamily: "System", fontWeight: "700" },
      heavy: { fontFamily: "System", fontWeight: "800" },
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Conversations"
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerBackTitle: "Back",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen
          name="Conversations"
          options={({ navigation }) => ({
            headerRight: () => (
              <Pressable
                accessibilityLabel="Open profile"
                accessibilityRole="button"
                onPress={() => navigation.navigate("Profile")}
                style={({ pressed }) => [styles.headerAction, pressed ? { opacity: 0.65 } : null]}
              >
                <Text style={[styles.headerActionText, { color: colors.primary }]}>Profile</Text>
              </Pressable>
            ),
            title: "DevStride",
          })}
        >
          {({ navigation }) => (
            <ConversationsScreen
              api={api}
              colors={colors}
              onOpenConversation={(conversationId) =>
                navigation.navigate("Chat", { conversationId })
              }
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Chat" options={{ title: "Conversation" }}>
          {({ navigation, route }) => (
            <ChatScreen
              api={api}
              colors={colors}
              conversationId={route.params.conversationId}
              onBack={() => navigation.goBack()}
              onUnauthorized={onUnauthorized}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Profile" options={{ title: "Profile" }}>
          {() => (
            <ProfileScreen
              colors={colors}
              onSignOut={onSignOut}
              profile={profile}
              user={user}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 8,
  },
  headerActionText: { fontSize: 16, fontWeight: "700" },
});
