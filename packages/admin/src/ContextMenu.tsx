import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  /** Destructive items are set apart below a separator. */
  danger?: boolean;
}
interface Opened<T> {
  value: T;
  trigger: HTMLElement;
  x: number;
  y: number;
}

const LONG_PRESS_MS = 500;
const MARGIN = 8;

/**
 * Replaces the browser menu on any number of targets with one shared menu.
 * It opens from a right-click, Shift+F10 or the context-menu key, or a touch
 * long press, which iOS never reports as a contextmenu event.
 */
export function useContextMenu<T>() {
  const [opened, setOpened] = useState<Opened<T> | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => cancelPress, [cancelPress]);
  const close = useCallback(
    (restoreFocus = false) => {
      setOpened(null);
      if (restoreFocus) opened?.trigger.focus();
    },
    [opened],
  );
  const below = (value: T, trigger: HTMLElement) => {
    const { left, bottom } = trigger.getBoundingClientRect();
    setOpened({ value, trigger, x: left, y: bottom });
  };
  const target = (value: T) => ({
    onContextMenu(event: MouseEvent<HTMLElement>) {
      event.preventDefault();
      const trigger = event.currentTarget;
      // Keyboard-invoked contextmenu events carry no pointer position.
      if (!event.clientX && !event.clientY) below(value, trigger);
      else setOpened({ value, trigger, x: event.clientX, y: event.clientY });
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return;
      event.preventDefault();
      below(value, event.currentTarget);
    },
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "touch") return;
      cancelPress();
      const trigger = event.currentTarget;
      const { clientX: x, clientY: y } = event;
      press.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          press.current = null;
          setOpened({ value, trigger, x, y });
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = press.current;
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      )
        cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onClick(event: MouseEvent<HTMLElement>) {
      // Lifting the finger after a long press must not follow the link. A new
      // press closes the menu on pointerdown, so its click still goes through.
      if (opened?.trigger === event.currentTarget) event.preventDefault();
    },
  });
  return { opened, close, target };
}

export function ContextMenu({
  label,
  title,
  x,
  y,
  items,
  onClose,
}: {
  label: string;
  title: string;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: (restoreFocus?: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    // Layout sizes, unlike client rects, ignore the entry animation's scale.
    const { offsetWidth: width, offsetHeight: height } = element;
    const clamp = (point: number, size: number, viewport: number) =>
      Math.max(MARGIN, Math.min(point, viewport - size - MARGIN));
    element.style.left = `${clamp(x, width, innerWidth)}px`;
    element.style.top = `${clamp(y, height, innerHeight)}px`;
    element.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [x, y]);
  useEffect(() => {
    const inside = (event: Event) =>
      event.target instanceof Node && menu.current?.contains(event.target);
    const outside = (event: Event) => {
      if (!inside(event)) onClose();
    };
    const dismiss = () => onClose();
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      } else if (event.key === "Tab") onClose(true); // Tab continues from the trigger.
    };
    const listeners = [
      [document, "pointerdown", outside, true],
      [document, "contextmenu", outside, true],
      [document, "focusin", outside, false],
      [document, "keydown", keyDown, true],
      [window, "scroll", outside, true],
      [window, "resize", dismiss, false],
      [window, "blur", dismiss, false],
    ] as const;
    for (const [node, type, listener, capture] of listeners)
      node.addEventListener(type, listener as EventListener, capture);
    return () => {
      for (const [node, type, listener, capture] of listeners)
        node.removeEventListener(type, listener as EventListener, capture);
    };
  }, [onClose]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]"),
    ];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const next = {
      ArrowDown: options[(index + 1) % options.length],
      ArrowUp: options[(index - 1 + options.length) % options.length],
      Home: options[0],
      End: options.at(-1),
    }[event.key];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  return createPortal(
    <div
      ref={menu}
      className="context-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={navigate}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="context-menu-title" aria-hidden="true">
        {title}
      </div>
      {items.map((item) => (
        <Fragment key={item.label}>
          {item.danger && <hr className="context-menu-separator" />}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={
              item.danger ? "context-menu-item danger" : "context-menu-item"
            }
            onClick={() => {
              // Restore focus first so a dialog opened by the item returns to it.
              onClose(true);
              item.onSelect();
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}
