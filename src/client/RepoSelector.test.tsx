import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoProvider } from "./RepoContext.js";
import { RepoSelector } from "./RepoSelector.js";

afterEach(() => {
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch { /* not available in this test env */ }
});

function renderSelector(repos: Array<{ id: string; path: string }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");

    if (url.pathname === "/api/repos" && (!init?.method || init?.method === "GET")) {
      return {
        ok: true,
        status: 200,
        json: async () => repos
      } as Response;
    }

    if (url.pathname === "/api/repos" && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { path: string; id?: string };
      const newRepo = { id: body.id ?? body.path.split("/").at(-1) ?? "repo", path: body.path };
      repos = [...repos, newRepo];
      return { ok: true, status: 201, json: async () => newRepo } as Response;
    }

    const deleteMatch = /^\/api\/repos\/([^/]+)$/.exec(url.pathname);
    if (deleteMatch && init?.method === "DELETE") {
      repos = repos.filter((r) => r.id !== deleteMatch[1]);
      return { ok: true, status: 204, json: async () => undefined } as Response;
    }

    throw new Error(`Unhandled fetch: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  return render(
    <RepoProvider>
      <RepoSelector />
    </RepoProvider>
  );
}

describe("RepoSelector", () => {
  it("renders nothing for a single repo", async () => {
    const { container } = renderSelector([{ id: "main", path: "/work/main" }]);
    // Wait for the provider to load repos
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0));
    // Selector renders null for single repo — no visible tabs
    expect(container.querySelector(".repo-selector-tabs")).toBeNull();
    expect(container.querySelector(".repo-selector-empty")).toBeNull();
  });

  it("renders empty state when there are no repos", async () => {
    renderSelector([]);
    expect(await screen.findByText(/No repositories loaded/i)).toBeInTheDocument();
  });

  it("renders pill tabs for two repos and switches active repo on click", async () => {
    renderSelector([
      { id: "frontend", path: "/work/frontend" },
      { id: "backend", path: "/work/backend" }
    ]);

    const frontendTab = await screen.findByRole("tab", { name: "frontend" });
    const backendTab = screen.getByRole("tab", { name: "backend" });

    // First repo is active by default
    expect(frontendTab).toHaveAttribute("aria-selected", "true");
    expect(backendTab).toHaveAttribute("aria-selected", "false");

    // Click backend tab
    fireEvent.click(backendTab);
    expect(backendTab).toHaveAttribute("aria-selected", "true");
    expect(frontendTab).toHaveAttribute("aria-selected", "false");
  });

  it("shows overflow pill for 3+ repos", async () => {
    renderSelector([
      { id: "alpha", path: "/work/alpha" },
      { id: "beta", path: "/work/beta" },
      { id: "gamma", path: "/work/gamma" }
    ]);

    // Two pinned tabs + overflow pill
    await screen.findByRole("tab", { name: "alpha" });
    expect(screen.queryByRole("tab", { name: "gamma" })).toBeNull();
    expect(screen.getByRole("button", { name: /\+2/ })).toBeInTheDocument();
  });

  it("overflow dropdown shows remaining repos and switches on click", async () => {
    renderSelector([
      { id: "alpha", path: "/work/alpha" },
      { id: "beta", path: "/work/beta" },
      { id: "gamma", path: "/work/gamma" }
    ]);

    await screen.findByRole("tab", { name: "alpha" });
    const overflowBtn = screen.getByRole("button", { name: /\+2/ });

    fireEvent.click(overflowBtn);
    const gammaOption = await screen.findByRole("option", { name: "gamma" });

    fireEvent.click(gammaOption);

    // gamma is now pinned and active; alpha/beta remain pinned via LRU
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "gamma" })).toHaveAttribute("aria-selected", "true")
    );
  });

  it("opens add-repo modal and submits a new repo", async () => {
    renderSelector([
      { id: "main", path: "/work/main" },
      { id: "other", path: "/work/other" }
    ]);

    await screen.findByRole("tab", { name: "main" });
    const addBtn = screen.getByRole("button", { name: "Add repository" });
    fireEvent.click(addBtn);

    expect(screen.getByRole("dialog", { name: "Add repository" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Repository path"), {
      target: { value: "/work/new-repo" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // Modal closes after successful add
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add repository" })).not.toBeInTheDocument()
    );
  });
});
