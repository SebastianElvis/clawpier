import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FocusTrap } from "../FocusTrap";

describe("FocusTrap", () => {
  it("focuses the first focusable element on mount", () => {
    const { getByTestId } = render(
      <FocusTrap>
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
      </FocusTrap>
    );

    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("returns focus to the previously focused element on unmount", () => {
    const outer = document.createElement("button");
    outer.textContent = "Outer";
    document.body.appendChild(outer);
    outer.focus();
    expect(document.activeElement).toBe(outer);

    const { unmount } = render(
      <FocusTrap>
        <button>Inside</button>
      </FocusTrap>
    );

    // Focus should have moved inside the trap
    expect(document.activeElement).not.toBe(outer);

    unmount();

    // Focus should return to the outer button
    expect(document.activeElement).toBe(outer);

    document.body.removeChild(outer);
  });

  it("traps Tab on the last element — wraps to first", () => {
    const { getByTestId } = render(
      <FocusTrap>
        <button data-testid="first">First</button>
        <button data-testid="last">Last</button>
      </FocusTrap>
    );

    const last = getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("traps Shift+Tab on the first element — wraps to last", () => {
    const { getByTestId } = render(
      <FocusTrap>
        <button data-testid="first">First</button>
        <button data-testid="last">Last</button>
      </FocusTrap>
    );

    const first = getByTestId("first");
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("does not trap focus when active is false", () => {
    const outer = document.createElement("button");
    outer.textContent = "Outer";
    document.body.appendChild(outer);
    outer.focus();

    render(
      <FocusTrap active={false}>
        <button>Inside</button>
      </FocusTrap>
    );

    // Focus should NOT have moved inside the trap
    expect(document.activeElement).toBe(outer);

    document.body.removeChild(outer);
  });

  it("skips disabled buttons when finding focusable elements", () => {
    const { getByTestId } = render(
      <FocusTrap>
        <button disabled>Disabled</button>
        <button data-testid="enabled">Enabled</button>
      </FocusTrap>
    );

    expect(document.activeElement).toBe(getByTestId("enabled"));
  });
});
