"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

type NextLinkProps = ComponentProps<typeof NextLink>;

export function Link({ prefetch = false, ...props }: NextLinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}
