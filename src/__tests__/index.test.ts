import { describe, it, expect, beforeEach } from "vitest";
import {
  linkIsRel,
  isCatalogEntry,
  isAcquisitionFeed,
  getImage,
  getLink,
  getAcquisitionUrls,
  getCatalogs,
  setCatalogs,
  addCatalog,
  updateCatalog,
  deleteCatalog,
  getDefaultCatalogs,
} from "../index";

// Helper to create mock Link objects
const makeLink = (
  overrides: Partial<{
    Href: string;
    Rel: string;
    Type: string;
    Title: string;
    HasRel: (rel: string) => boolean;
  }> = {}
) => ({
  Href: "",
  Rel: "",
  Type: "",
  Title: "",
  HasRel: (rel: string) => overrides.Rel === rel,
  ...overrides,
});

// Helper to create mock Entry objects
const makeEntry = (
  links: ReturnType<typeof makeLink>[] = [],
  title = "Test Entry"
) =>
  ({
    Title: title,
    Links: links,
    Authors: [],
    Summary: "",
  }) as any;

describe("linkIsRel", () => {
  it("returns true when link Rel matches string", () => {
    const link = makeLink({ Rel: "search" });
    expect(linkIsRel(link as any, "search")).toBe(true);
  });

  it("returns false when link Rel does not match", () => {
    const link = makeLink({ Rel: "search" });
    expect(linkIsRel(link as any, "other")).toBe(false);
  });

  it("handles space-separated multi-value Rel", () => {
    const link = makeLink({
      Rel: "http://opds-spec.org/acquisition open-access",
    });
    expect(
      linkIsRel(link as any, "http://opds-spec.org/acquisition")
    ).toBe(true);
    expect(linkIsRel(link as any, "open-access")).toBe(true);
    expect(linkIsRel(link as any, "missing")).toBe(false);
  });

  it("works with function predicate", () => {
    const link = makeLink({
      Rel: "http://opds-spec.org/acquisition/open-access",
    });
    expect(
      linkIsRel(link as any, (r) =>
        r.startsWith("http://opds-spec.org/acquisition")
      )
    ).toBe(true);
    expect(linkIsRel(link as any, (r) => r.startsWith("other"))).toBe(
      false
    );
  });

  it("returns false when HasRel is falsy", () => {
    const link = { Href: "", Rel: "", Type: "", Title: "", HasRel: undefined };
    expect(linkIsRel(link as any, "search")).toBe(false);
  });
});

describe("isCatalogEntry", () => {
  it("returns true for entry with acquisition links", () => {
    const entry = makeEntry([
      makeLink({ Rel: "http://opds-spec.org/acquisition/open-access" }),
    ]);
    expect(isCatalogEntry(entry)).toBe(true);
  });

  it("returns false for entry without acquisition links", () => {
    const entry = makeEntry([
      makeLink({ Rel: "http://opds-spec.org/image/thumbnail" }),
    ]);
    expect(isCatalogEntry(entry)).toBe(false);
  });
});

describe("isAcquisitionFeed", () => {
  it("returns true when feed has acquisition entries", () => {
    const feed = {
      Entries: [
        makeEntry([
          makeLink({ Rel: "http://opds-spec.org/acquisition" }),
        ]),
      ],
    } as any;
    expect(isAcquisitionFeed(feed)).toBe(true);
  });

  it("returns false for navigation feed", () => {
    const feed = {
      Entries: [
        makeEntry([makeLink({ Rel: "subsection" })]),
      ],
    } as any;
    expect(isAcquisitionFeed(feed)).toBe(false);
  });
});

describe("getImage", () => {
  it("returns thumbnail URL when present", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/image/thumbnail",
        Href: "/images/thumb.jpg",
      }),
    ]);
    expect(getImage(entry)).toBe("/images/thumb.jpg");
  });

  it("returns opds thumbnail URL", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/thumbnail",
        Href: "/thumb.png",
      }),
    ]);
    expect(getImage(entry)).toBe("/thumb.png");
  });

  it("returns empty string when no image links", () => {
    const entry = makeEntry([makeLink({ Rel: "search" })]);
    expect(getImage(entry)).toBe("");
  });
});

describe("getLink", () => {
  it("builds absolute URL from origin + entry link href", () => {
    const entry = makeEntry([
      makeLink({
        Type: "application/atom+xml;profile=opds-catalog",
        Href: "/catalog/new",
      }),
    ]);
    expect(getLink("https://example.com", entry)).toBe(
      "https://example.com/catalog/new"
    );
  });

  it("handles href without leading slash", () => {
    const entry = makeEntry([
      makeLink({
        Type: "application/atom+xml",
        Href: "catalog/new",
      }),
    ]);
    expect(getLink("https://example.com", entry)).toBe(
      "https://example.com/catalog/new"
    );
  });
});

describe("getAcquisitionUrls", () => {
  it("returns array of PublicationSource from acquisition links", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/acquisition/open-access",
        Href: "/books/1.epub",
        Type: "application/epub+zip",
        Title: "EPUB",
      }),
    ]);
    const result = getAcquisitionUrls("https://example.com", entry);
    expect(result).toEqual([
      {
        name: "EPUB",
        source: "https://example.com/books/1.epub",
        type: "application/epub+zip",
      },
    ]);
  });

  it("keeps absolute hrefs unchanged", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/acquisition",
        Href: "https://cdn.example.com/book.epub",
        Type: "application/epub+zip",
        Title: "Download",
      }),
    ]);
    const result = getAcquisitionUrls("https://example.com", entry);
    expect(result[0].source).toBe("https://cdn.example.com/book.epub");
  });
});

describe("Catalog CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getCatalogs returns defaults when localStorage empty", () => {
    const catalogs = getCatalogs();
    expect(catalogs).toEqual(getDefaultCatalogs());
    expect(catalogs.length).toBe(3);
  });

  it("getCatalogs returns parsed catalogs from localStorage", () => {
    const stored = [{ id: "x", name: "Test", apiId: "http://test.com" }];
    localStorage.setItem("catalogs", JSON.stringify(stored));
    expect(getCatalogs()).toEqual(stored);
  });

  it("addCatalog appends and persists", () => {
    const initial = [{ id: "1", name: "A", apiId: "http://a.com" }];
    localStorage.setItem("catalogs", JSON.stringify(initial));

    addCatalog({ id: "2", name: "B", apiId: "http://b.com" });

    const result = getCatalogs();
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ id: "2", name: "B", apiId: "http://b.com" });
  });

  it("updateCatalog replaces matching catalog by id", () => {
    const initial = [
      { id: "1", name: "Old", apiId: "http://old.com" },
      { id: "2", name: "Keep", apiId: "http://keep.com" },
    ];
    localStorage.setItem("catalogs", JSON.stringify(initial));

    updateCatalog({ id: "1", name: "New", apiId: "http://new.com" });

    const result = getCatalogs();
    expect(result[0]).toEqual({ id: "1", name: "New", apiId: "http://new.com" });
    expect(result[1]).toEqual(initial[1]);
  });

  it("deleteCatalog removes matching catalog by id", () => {
    const initial = [
      { id: "1", name: "A", apiId: "http://a.com" },
      { id: "2", name: "B", apiId: "http://b.com" },
    ];
    localStorage.setItem("catalogs", JSON.stringify(initial));

    deleteCatalog({ id: "1", name: "A", apiId: "http://a.com" });

    const result = getCatalogs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("getDefaultCatalogs returns expected defaults", () => {
    const defaults = getDefaultCatalogs();
    expect(defaults.length).toBe(3);
    expect(defaults.map((c) => c.name)).toContain("Project Gutenberg");
  });
});
