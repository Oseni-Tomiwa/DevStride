import Image from "next/image";

type DevStrideLogoProps = {
  className?: string;
  variant?: "header" | "auth" | "footer" | "landing";
};

const dimensions = {
  header: { width: 84, height: 46 },
  auth: { width: 112, height: 62 },
  footer: { width: 72, height: 40 },
  landing: { width: 96, height: 53 },
} as const;

export function DevStrideLogo({ className, variant = "header" }: DevStrideLogoProps) {
  const size = dimensions[variant];
  return (
    <Image
      src="/brand/devstride-logo.png"
      alt="DevStride"
      width={size.width}
      height={size.height}
      className={className ? `devstride-logo devstride-logo-${variant} ${className}` : `devstride-logo devstride-logo-${variant}`}
      priority={variant === "header" || variant === "landing"}
    />
  );
}
