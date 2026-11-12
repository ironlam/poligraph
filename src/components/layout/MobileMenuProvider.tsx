"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

interface MobileMenuContextValue {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  /** The control that opened the menu, so closing can hand focus back to it */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const MobileMenuContext = createContext<MobileMenuContextValue>({
  isOpen: false,
  setIsOpen: () => {},
  triggerRef: { current: null },
});

export function useMobileMenu() {
  return useContext(MobileMenuContext);
}

/**
 * Shares the open state of the mobile menu between the menu itself, rendered inside the header,
 * and its trigger, which lives in the bottom tab bar outside of it.
 */
export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const value = useMemo(() => ({ isOpen, setIsOpen, triggerRef }), [isOpen]);

  return <MobileMenuContext.Provider value={value}>{children}</MobileMenuContext.Provider>;
}
