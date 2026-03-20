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
  it("shows the active repo and add button even when only one repo is loaded", async () => {
    renderSelector([{ id: "main", path: "/work/main" }]);

    const mainTab = await screen.findByRole("tab", { name: "main" });
    expect(mainTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();
    expect(screen.queryByText(/No repositories loaded/i)).not.toBeInTheDocument();
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

    await screen.findByRole("tab", { name: "alpha" });
    expect(screen.getByRole("tab", { name: "beta" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "gamma" })).toBeNull();
    expect(screen.getByRole("button", { name: /\+1/ })).toBeInTheDocument();
  });

  it("overflow dropdown shows remaining repos and switches on click", async () => {
    renderSelector([
      { id: "alpha", path: "/work/alpha" },
      { id: "beta", path: "/work/beta" },
      { id: "gamma", path: "/work/gamma" }
    ]);

    await screen.findByRole("tab", { name: "alpha" });
    const overflowBtn = screen.getByRole("button", { name: /\+1/ });

    fireEvent.click(overflowBtn);
    const gammaOption = await screen.findByRole("option", { name: "gamma" });

    fireEvent.click(gammaOption);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "gamma" })).toHaveAttribute("aria-selected", "true")
    );
  });

  it("keeps pinned repos in most-recent order", async () => {
    renderSelector([
      { id: "alpha", path: "/work/alpha" },
      { id: "beta", path: "/work/beta" },
      { id: "gamma", path: "/work/gamma" }
    ]);

    await screen.findByRole("tab", { name: "alpha" });
    fireEvent.click(screen.getByRole("tab", { name: "beta" }));
    fireEvent.click(screen.getByRole("button", { name: /\+1/ }));
    fireEvent.click(await screen.findByRole("option", { name: "gamma" }));

    await waitFor(() => {
      const tabLabels = screen.getAllByRole("tab").map((tab) => tab.textContent);
      expect(tabLabels).toEqual(["gamma", "beta"]);
    });
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
