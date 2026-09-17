import { useColorScheme } from "react-native";

const lightColors = {
  background: "#F4F7F5",
  surface: "#FFFFFF",
  text: "#17211D",
  mutedText: "#526159",
  border: "#C9D3CD",
  primary: "#215C48",
  primaryPressed: "#174535",
  onPrimary: "#FFFFFF",
  error: "#A92D34",
  errorSurface: "#FCEBEC",
  tag: "#E4EFE9",
};

const darkColors = {
  background: "#0D1512",
  surface: "#17211D",
  text: "#F1F5F2",
  mutedText: "#B4C1BA",
  border: "#405048",
  primary: "#74C8A6",
  primaryPressed: "#5BAF8E",
  onPrimary: "#0A2319",
  error: "#FFB3B7",
  errorSurface: "#3B2023",
  tag: "#273D33",
};

export function useAppTheme() {
  const isDark = useColorScheme() === "dark";
  return { isDark, colors: isDark ? darkColors : lightColors };
}

export type AppColors = typeof lightColors;
