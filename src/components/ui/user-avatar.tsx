import Image from "next/image";

export function UserAvatar({
  name,
  src,
  className = "size-10 rounded-xl",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Image
      src={src || "/avatars/default-user.svg"}
      width={256}
      height={256}
      alt={`Avatar ${name}`}
      className={`object-cover ${className}`}
    />
  );
}
