import Image from "next/image";

const brandAssets = {
  light: { src: "/brand/nextgen-logo-light.svg", width: 1120, height: 260 },
  dark: { src: "/brand/nextgen-logo-dark.svg", width: 1120, height: 260 },
  mark: { src: "/brand/nextgen-mark.svg", width: 512, height: 512 },
  wordmark: { src: "/brand/nextgen-wordmark.svg", width: 760, height: 170 },
} as const;

export type NextgenBrandVariant = keyof typeof brandAssets;

export function NextgenBrand({
  variant = "dark",
  className,
  priority = false,
}: {
  variant?: NextgenBrandVariant;
  className?: string;
  priority?: boolean;
}) {
  const asset = brandAssets[variant];
  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={variant === "mark" ? "NEXTGEN" : "NEXTGEN Operations System"}
      className={className}
      priority={priority}
    />
  );
}

export { brandAssets };
