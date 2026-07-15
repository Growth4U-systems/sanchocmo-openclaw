"use client";

import { Sprout } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface GrowieAvatarProps {
  className?: string;
  fallbackIconSize?: number;
}

export function GrowieAvatar({
  className,
  fallbackIconSize = 16,
}: GrowieAvatarProps) {
  return (
    <Avatar
      aria-hidden="true"
      className={cn("bg-[var(--sc-sun-100)]", className)}
    >
      <AvatarImage src="/agents/growie-avatar.png" alt="" />
      <AvatarFallback className="bg-[var(--sc-sage-500)] text-[var(--sc-white)]">
        <Sprout size={fallbackIconSize} strokeWidth={2.5} />
      </AvatarFallback>
    </Avatar>
  );
}
