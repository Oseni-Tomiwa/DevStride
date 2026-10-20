import { fireEvent, render, screen } from "@testing-library/react-native";

import { lightAppColors } from "../theme";
import { UnauthenticatedNavigator } from "./UnauthenticatedNavigator";

function createAuth() {
  return {
    exchangeCodeForSession: jest.fn(),
    getUser: jest.fn(),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    updateUser: jest.fn(),
  };
}

describe("UnauthenticatedNavigator", () => {
  it("navigates among Sign In, Sign Up, and Forgot Password with predictable back actions", async () => {
    await render(
      <UnauthenticatedNavigator
        auth={createAuth()}
        colors={lightAppColors}
        notice={null}
        onAuthenticated={jest.fn()}
      />,
    );
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Create an account" }));
    expect(await screen.findByRole("header", { name: "Create your account" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Back to Sign In" }));
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByRole("header", { name: "Reset your password" })).toBeOnTheScreen();
  });

  it("can open directly on the recovery request screen", async () => {
    await render(
      <UnauthenticatedNavigator
        auth={createAuth()}
        colors={lightAppColors}
        initialRoute="ForgotPassword"
        notice={null}
        onAuthenticated={jest.fn()}
      />,
    );
    expect(await screen.findByRole("header", { name: "Reset your password" })).toBeOnTheScreen();
  });
});
