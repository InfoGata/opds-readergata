import { describe, it, expect, beforeEach } from "vitest";
import {
  linkIsRel,
  isCatalogEntry,
  isAcquisitionFeed,
  getImage,
  getLink,
  getAcquisitionUrls,
  getAcquisitionType,
  getEntryUrl,
  getOriginalUrl,
  toIsoDate,
  entryToPublication,
  toEntryApiId,
  parseEntryApiId,
  findEntry,
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
    OpdsPrice: number;
    OpdsPriceCurrencyCode: string;
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
  title = "Test Entry",
  fields: Record<string, unknown> = {}
) =>
  ({
    Title: title,
    Links: links,
    Authors: [],
    Summary: "",
    ...fields,
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
        price: undefined,
        currency: undefined,
        acquisitionType: "open-access",
      },
    ]);
  });

  it("carries price and currency when the catalog charges for a book", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/acquisition/buy",
        Href: "/books/2.epub",
        Type: "application/epub+zip",
        Title: "Buy",
        OpdsPrice: 9.99,
        OpdsPriceCurrencyCode: "USD",
      }),
    ]);
    const result = getAcquisitionUrls("https://example.com", entry);
    expect(result[0]).toMatchObject({
      price: 9.99,
      currency: "USD",
      acquisitionType: "buy",
    });
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

describe("getAcquisitionType", () => {
  it.each([
    ["open-access", "open-access"],
    ["borrow", "borrow"],
    ["buy", "buy"],
    ["sample", "sample"],
    ["subscribe", "subscribe"],
  ])("maps the %s rel suffix", (suffix, expected) => {
    const link = makeLink({
      Rel: `http://opds-spec.org/acquisition/${suffix}`,
    });
    expect(getAcquisitionType(link as any)).toBe(expected);
  });

  it("is undefined for the bare acquisition rel, which says nothing", () => {
    const link = makeLink({ Rel: "http://opds-spec.org/acquisition" });
    expect(getAcquisitionType(link as any)).toBeUndefined();
  });

  it("is undefined for a suffix it does not know", () => {
    const link = makeLink({ Rel: "http://opds-spec.org/acquisition/rent" });
    expect(getAcquisitionType(link as any)).toBeUndefined();
  });
});

describe("getEntryUrl", () => {
  it("prefers an explicit entry document", () => {
    const entry = makeEntry([
      makeLink({ Rel: "self", Href: "/self" }),
      makeLink({
        Href: "/entry",
        Type: "application/atom+xml;type=entry;profile=opds-catalog",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/entry"
    );
  });

  it("falls back to the self link", () => {
    const entry = makeEntry([
      makeLink({ Rel: "self", Href: "/self" }),
      makeLink({ Rel: "alternate", Href: "/alt", Type: "text/html" }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/self"
    );
  });

  it("falls back to an atom alternate", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "alternate",
        Href: "/alt",
        Type: "application/atom+xml",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/alt"
    );
  });

  it("keeps absolute hrefs unchanged", () => {
    const entry = makeEntry([
      makeLink({ Rel: "self", Href: "https://other.example.com/e" }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://other.example.com/e"
    );
  });

  it("is undefined when the feed offers no link to the entry itself", () => {
    const entry = makeEntry([
      makeLink({
        Rel: "http://opds-spec.org/acquisition",
        Href: "/books/1.epub",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBeUndefined();
  });
});

describe("getOriginalUrl", () => {
  it("finds the html page for the book", () => {
    const entry = makeEntry([
      makeLink({ Rel: "alternate", Href: "/book/1", Type: "text/html" }),
    ]);
    expect(getOriginalUrl("https://example.com", entry)).toBe(
      "https://example.com/book/1"
    );
  });

  it("is undefined when there is no html alternate", () => {
    const entry = makeEntry([makeLink({ Rel: "self", Href: "/self" })]);
    expect(getOriginalUrl("https://example.com", entry)).toBeUndefined();
  });
});

describe("toIsoDate", () => {
  it("keeps a bare year verbatim", () => {
    expect(toIsoDate("1818")).toBe("1818");
  });

  it("converts a Date, which is what r2 hands back for Published", () => {
    const date = new Date("2019-04-02T00:00:00.000Z");
    expect(toIsoDate(date)).toBe("2019-04-02T00:00:00.000Z");
  });

  it("parses a date string", () => {
    expect(toIsoDate("2019-04-02")).toBe("2019-04-02T00:00:00.000Z");
  });

  it("is undefined for nonsense and for nothing at all", () => {
    expect(toIsoDate("not a date")).toBeUndefined();
    expect(toIsoDate(new Date("nope"))).toBeUndefined();
    expect(toIsoDate(undefined)).toBeUndefined();
  });
});

describe("entry apiIds", () => {
  it("round-trips a document url and an entry id", () => {
    const apiId = toEntryApiId(
      "https://m.gutenberg.org/ebooks/2701.opds",
      "urn:gutenberg:2701:3"
    );
    expect(parseEntryApiId(apiId)).toEqual({
      url: "https://m.gutenberg.org/ebooks/2701.opds",
      entryId: "urn:gutenberg:2701:3",
    });
  });

  it("survives an id containing a #", () => {
    const apiId = toEntryApiId("https://example.com/feed", "tag:x#1");
    expect(parseEntryApiId(apiId)).toEqual({
      url: "https://example.com/feed",
      entryId: "tag:x#1",
    });
  });

  it("leaves a plain entry url alone", () => {
    expect(parseEntryApiId("https://example.com/entry/1")).toEqual({
      url: "https://example.com/entry/1",
    });
  });
});

describe("findEntry", () => {
  const first = makeEntry([], "First", { Id: "urn:1" });
  const second = makeEntry([], "Second", { Id: " urn:2\n" });

  it("picks the entry with the id", () => {
    expect(findEntry([first, second], "urn:2")).toBe(second);
  });

  it("is the first entry when no id is asked for", () => {
    expect(findEntry([first, second])).toBe(first);
  });

  it("is undefined when the id is not there", () => {
    expect(findEntry([first, second], "urn:3")).toBeUndefined();
  });
});

describe("entryToPublication", () => {
  it("maps everything a rich entry carries", () => {
    const entry = makeEntry(
      [
        makeLink({ Rel: "self", Href: "/entry/1" }),
        makeLink({ Rel: "alternate", Href: "/book/1", Type: "text/html" }),
        makeLink({
          Rel: "http://opds-spec.org/image/thumbnail",
          Href: "https://example.com/cover.jpg",
        }),
        makeLink({
          Rel: "http://opds-spec.org/acquisition/open-access",
          Href: "/books/1.epub",
          Type: "application/epub+zip",
          Title: "EPUB",
        }),
      ],
      "Frankenstein",
      {
        SubTitle: "Or, The Modern Prometheus",
        Authors: [{ Name: "Mary Shelley", Uri: "https://example.com/shelley" }],
        Summary: "A scientist and his creature.",
        DcPublisher: "Lackington",
        DcLanguage: "en",
        DcIssued: "1818",
        Categories: [
          { Term: "FIC015000", Label: "Horror", Scheme: "bisac" },
          { Term: "Gothic" },
        ],
        Series: [{ Name: "Gothic Classics", Position: 3 }],
        DcExtent: "280",
        DcRights: "Public domain",
        DcIdentifier: "9780486282114",
        DcIdentifierType: "ISBN",
        SchemaRatingValue: "4.5",
      }
    );

    expect(entryToPublication("https://example.com", entry)).toEqual({
      title: "Frankenstein",
      subtitle: "Or, The Modern Prometheus",
      apiId: "https://example.com/entry/1",
      authors: [{ name: "Mary Shelley", url: "https://example.com/shelley" }],
      images: [{ url: "https://example.com/cover.jpg" }],
      summary: "A scientist and his creature.",
      publisher: "Lackington",
      languages: ["en"],
      published: "1818",
      categories: [
        { name: "Horror", scheme: "bisac" },
        { name: "Gothic", scheme: undefined },
      ],
      series: { name: "Gothic Classics", position: 3 },
      pageCount: 280,
      rights: "Public domain",
      identifiers: [{ type: "isbn", value: "9780486282114" }],
      rating: 4.5,
      sources: [
        {
          name: "EPUB",
          source: "https://example.com/books/1.epub",
          type: "application/epub+zip",
          price: undefined,
          currency: undefined,
          acquisitionType: "open-access",
        },
      ],
      originalUrl: "https://example.com/book/1",
    });
  });

  it("leaves out everything a bare entry does not have", () => {
    const publication = entryToPublication(
      "https://example.com",
      makeEntry([], "Untitled")
    );

    expect(publication.title).toBe("Untitled");
    expect(publication.apiId).toBeUndefined();
    expect(publication.subtitle).toBeUndefined();
    expect(publication.publisher).toBeUndefined();
    expect(publication.published).toBeUndefined();
    expect(publication.series).toBeUndefined();
    expect(publication.pageCount).toBeUndefined();
    expect(publication.rating).toBeUndefined();
    expect(publication.identifiers).toBeUndefined();
    expect(publication.originalUrl).toBeUndefined();
    expect(publication.sources).toEqual([]);
  });

  it("addresses an entry with no link to itself by where it was listed", () => {
    const entry = makeEntry([], "Moby Dick", { Id: "urn:gutenberg:2701:3" });
    expect(
      entryToPublication(
        "https://m.gutenberg.org",
        entry,
        "https://m.gutenberg.org/ebooks/2701.opds"
      ).apiId
    ).toBe("https://m.gutenberg.org/ebooks/2701.opds#urn%3Agutenberg%3A2701%3A3");
  });

  it("prefers the entry's own url to the fallback", () => {
    const entry = makeEntry([makeLink({ Rel: "self", Href: "/entry/1" })], "A", {
      Id: "urn:1",
    });
    expect(
      entryToPublication("https://example.com", entry, "https://example.com/feed")
        .apiId
    ).toBe("https://example.com/entry/1");
  });

  it("falls back to Content when there is no Summary", () => {
    const entry = makeEntry([], "Book", {
      Summary: "",
      Content: "<p>From the content element.</p>",
    });
    expect(entryToPublication("https://example.com", entry).summary).toBe(
      "<p>From the content element.</p>"
    );
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
