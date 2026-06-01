import NextLink from "next/link";
import type { ComponentProps } from "react";

type NextLinkProps = ComponentProps<typeof NextLink>;

/**
 * App-wide `Link`. Identical to `next/link` except automatic prefetching is
 * disabled by default — the forum is link-dense (feeds, thread trees, author
 * mentions) and we don't want Next eagerly prefetching every visible route.
 * Pass `prefetch` explicitly to opt a specific link back in.
 */
export function Link({ prefetch = false, ...props }: NextLinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}

export default Link;
