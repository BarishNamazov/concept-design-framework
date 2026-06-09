"use client";

import { useEffect, useRef } from "react";

const HASH_TARGET_NAVIGATION_EVENT = "hash-target:navigate";

function targetIdFromHash(hash = window.location.hash): string | null {
  if (!hash || hash === "#") return null;

  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

export function notifyHashTargetNavigation(targetId?: string | null) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent(HASH_TARGET_NAVIGATION_EVENT, {
        detail: { targetId },
      }),
    );
  }, 0);
}

export function useHashTargetHighlight({
  enabled = true,
  deps = [],
  highlightClassName = "hash-target-highlight",
  highlightDurationMs = 2400,
  behavior = "smooth",
  block = "center",
}: {
  enabled?: boolean;
  deps?: ReadonlyArray<unknown>;
  highlightClassName?: string;
  highlightDurationMs?: number;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
} = {}) {
  const highlightedElement = useRef<HTMLElement | null>(null);
  const clearHighlightTimer = useRef<number | null>(null);
  const dependencyKey = deps.map((dep) => String(dep)).join("\u0000");

  useEffect(() => {
    void dependencyKey;
    if (!enabled) return;

    const pendingTimers = new Set<number>();

    function clearPendingTimers() {
      for (const timer of pendingTimers) window.clearTimeout(timer);
      pendingTimers.clear();
    }

    function clearCurrentHighlight() {
      if (clearHighlightTimer.current !== null) {
        window.clearTimeout(clearHighlightTimer.current);
        clearHighlightTimer.current = null;
      }
      highlightedElement.current?.classList.remove(highlightClassName);
      highlightedElement.current = null;
    }

    function scrollToHashTarget(explicitTargetId?: string | null): boolean {
      const targetId = explicitTargetId ?? targetIdFromHash();
      if (!targetId) return true;

      const target = document.getElementById(targetId);
      if (!target) return false;

      clearCurrentHighlight();
      target.scrollIntoView({ behavior, block, inline: "nearest" });
      void target.offsetWidth;
      target.classList.add(highlightClassName);
      highlightedElement.current = target;
      clearHighlightTimer.current = window.setTimeout(
        clearCurrentHighlight,
        highlightDurationMs,
      );
      return true;
    }

    function scheduleHashTargetScroll(explicitTargetId?: string | null) {
      clearPendingTimers();
      const delays = [0, 50, 150, 350];

      function attempt(index: number) {
        if (
          scrollToHashTarget(explicitTargetId) ||
          index >= delays.length - 1
        ) {
          return;
        }
        const timer = window.setTimeout(
          () => attempt(index + 1),
          delays[index + 1],
        );
        pendingTimers.add(timer);
      }

      const timer = window.setTimeout(() => attempt(0), delays[0]);
      pendingTimers.add(timer);
    }

    function handlePotentialHashLinkClick(event: MouseEvent) {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !url.hash) return;

      scheduleHashTargetScroll(targetIdFromHash(url.hash));
    }

    function handleProgrammaticHashNavigation(event: Event) {
      const targetId =
        event instanceof CustomEvent ? event.detail?.targetId : undefined;
      scheduleHashTargetScroll(
        typeof targetId === "string" ? targetId : undefined,
      );
    }

    function handleLocationHashChange() {
      scheduleHashTargetScroll();
    }

    scheduleHashTargetScroll();
    document.addEventListener("click", handlePotentialHashLinkClick, true);
    window.addEventListener("hashchange", handleLocationHashChange);
    window.addEventListener("popstate", handleLocationHashChange);
    window.addEventListener(
      HASH_TARGET_NAVIGATION_EVENT,
      handleProgrammaticHashNavigation,
    );

    return () => {
      clearPendingTimers();
      clearCurrentHighlight();
      document.removeEventListener("click", handlePotentialHashLinkClick, true);
      window.removeEventListener("hashchange", handleLocationHashChange);
      window.removeEventListener("popstate", handleLocationHashChange);
      window.removeEventListener(
        HASH_TARGET_NAVIGATION_EVENT,
        handleProgrammaticHashNavigation,
      );
    };
  }, [
    enabled,
    highlightClassName,
    highlightDurationMs,
    behavior,
    block,
    dependencyKey,
  ]);
}
