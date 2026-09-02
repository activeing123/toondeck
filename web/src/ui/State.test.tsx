/*
UX-C2 RED: <State> three-state component — the anti-evaporation primitive.
Every catch→null point that silently swallowed a failed fetch now renders
loading / unreachable(+retry) / empty / data. This file pins the contract.
*/

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import State from "./State";

function ui(props: Partial<Parameters<typeof State>[0]> = {}) {
  return (
    <State loading={false} {...props}>
      <div>the data</div>
    </State>
  );
}

describe("State component", () => {
  it("renders data when everything is fine", () => {
    render(<I18nProvider>{ui()}</I18nProvider>);
    expect(screen.getByText("the data")).toBeInTheDocument();
  });

  it("renders loading state while fetching", () => {
    render(<I18nProvider>{ui({ loading: true })}</I18nProvider>);
    expect(screen.getByText(/loading deck…|加载中…/)).toBeInTheDocument();
    expect(screen.queryByText("the data")).toBeNull();
  });

  it("renders unreachable + retry when the fetch failed", async () => {
    const onRetry = vi.fn();
    render(<I18nProvider>{ui({ unreachable: true, onRetry })}</I18nProvider>);
    expect(screen.getByText(/engine unreachable|引擎无响应/)).toBeInTheDocument();
    expect(screen.queryByText("the data")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /retry|重试/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders a custom empty message when there is nothing to show", () => {
    render(
      <I18nProvider>
        <State loading={false} empty emptyLabel="no skills yet">
          <div>the data</div>
        </State>
      </I18nProvider>,
    );
    expect(screen.getByText("no skills yet")).toBeInTheDocument();
    expect(screen.queryByText("the data")).toBeNull();
  });
});
