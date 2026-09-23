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
import type { OpdsEntry, OpdsLink } from "../opds";

const makeLink = (overrides: Partial<OpdsLink> = {}): OpdsLink => ({
  href: "",
  rel: "",
  type: "",
  ...overrides,
});

const makeEntry = (
  links: OpdsLink[] = [],
  title = "Test Entry",
  fields: Partial<OpdsEntry> = {}
): OpdsEntry => ({
  title,
  links,
  authors: [],
  categories: [],
  ...fields,
});

describe("linkIsRel", () => {
  it("returns true when link Rel matches string", () => {
    const link = makeLink({ rel: "search" });
    expect(linkIsRel(link, "search")).toBe(true);
  });

  it("returns false when link Rel does not match", () => {
    const link = makeLink({ rel: "search" });
    expect(linkIsRel(link, "other")).toBe(false);
  });

  it("handles space-separated multi-value Rel", () => {
    const link = makeLink({
      rel: "http://opds-spec.org/acquisition open-access",
    });
    expect(
      linkIsRel(link, "http://opds-spec.org/acquisition")
    ).toBe(true);
    expect(linkIsRel(link, "open-access")).toBe(true);
    expect(linkIsRel(link, "missing")).toBe(false);
  });

  it("works with function predicate", () => {
    const link = makeLink({
      rel: "http://opds-spec.org/acquisition/open-access",
    });
    expect(
      linkIsRel(link, (r) =>
        r.startsWith("http://opds-spec.org/acquisition")
      )
    ).toBe(true);
    expect(linkIsRel(link, (r) => r.startsWith("other"))).toBe(
      false
    );
  });

  it("returns false when the link has no rel", () => {
    expect(linkIsRel(makeLink(), "search")).toBe(false);
  });
});

describe("isCatalogEntry", () => {
  it("returns true for entry with acquisition links", () => {
    const entry = makeEntry([
      makeLink({ rel: "http://opds-spec.org/acquisition/open-access" }),
    ]);
    expect(isCatalogEntry(entry)).toBe(true);
  });

  it("returns false for entry without acquisition links", () => {
    const entry = makeEntry([
      makeLink({ rel: "http://opds-spec.org/image/thumbnail" }),
    ]);
    expect(isCatalogEntry(entry)).toBe(false);
  });
});

describe("isAcquisitionFeed", () => {
  it("returns true when feed has acquisition entries", () => {
    const feed = {
      links: [],
      entries: [
        makeEntry([
          makeLink({ rel: "http://opds-spec.org/acquisition" }),
        ]),
      ],
    };
    expect(isAcquisitionFeed(feed)).toBe(true);
  });

  it("returns false for navigation feed", () => {
    const feed = {
      links: [],
      entries: [
        makeEntry([makeLink({ rel: "subsection" })]),
      ],
    };
    expect(isAcquisitionFeed(feed)).toBe(false);
  });
});

describe("getImage", () => {
  it("returns thumbnail URL when present", () => {
    const entry = makeEntry([
      makeLink({
        rel: "http://opds-spec.org/image/thumbnail",
        href: "/images/thumb.jpg",
      }),
    ]);
    expect(getImage(entry)).toBe("/images/thumb.jpg");
  });

  it("returns opds thumbnail URL", () => {
    const entry = makeEntry([
      makeLink({
        rel: "http://opds-spec.org/thumbnail",
        href: "/thumb.png",
      }),
    ]);
    expect(getImage(entry)).toBe("/thumb.png");
  });

  it("returns empty string when no image links", () => {
    const entry = makeEntry([makeLink({ rel: "search" })]);
    expect(getImage(entry)).toBe("");
  });
});

describe("getLink", () => {
  it("builds absolute URL from origin + entry link href", () => {
    const entry = makeEntry([
      makeLink({
        type: "application/atom+xml;profile=opds-catalog",
        href: "/catalog/new",
      }),
    ]);
    expect(getLink("https://example.com", entry)).toBe(
      "https://example.com/catalog/new"
    );
  });

  it("handles href without leading slash", () => {
    const entry = makeEntry([
      makeLink({
        type: "application/atom+xml",
        href: "catalog/new",
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
        rel: "http://opds-spec.org/acquisition/open-access",
        href: "/books/1.epub",
        type: "application/epub+zip",
        title: "EPUB",
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
        rel: "http://opds-spec.org/acquisition/buy",
        href: "/books/2.epub",
        type: "application/epub+zip",
        title: "Buy",
        price: 9.99,
        priceCurrencyCode: "USD",
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
        rel: "http://opds-spec.org/acquisition",
        href: "https://cdn.example.com/book.epub",
        type: "application/epub+zip",
        title: "Download",
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
      rel: `http://opds-spec.org/acquisition/${suffix}`,
    });
    expect(getAcquisitionType(link)).toBe(expected);
  });

  it("is undefined for the bare acquisition rel, which says nothing", () => {
    const link = makeLink({ rel: "http://opds-spec.org/acquisition" });
    expect(getAcquisitionType(link)).toBeUndefined();
  });

  it("is undefined for a suffix it does not know", () => {
    const link = makeLink({ rel: "http://opds-spec.org/acquisition/rent" });
    expect(getAcquisitionType(link)).toBeUndefined();
  });
});

describe("getEntryUrl", () => {
  it("prefers an explicit entry document", () => {
    const entry = makeEntry([
      makeLink({ rel: "self", href: "/self" }),
      makeLink({
        href: "/entry",
        type: "application/atom+xml;type=entry;profile=opds-catalog",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/entry"
    );
  });

  it("falls back to the self link", () => {
    const entry = makeEntry([
      makeLink({ rel: "self", href: "/self" }),
      makeLink({ rel: "alternate", href: "/alt", type: "text/html" }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/self"
    );
  });

  it("falls back to an atom alternate", () => {
    const entry = makeEntry([
      makeLink({
        rel: "alternate",
        href: "/alt",
        type: "application/atom+xml",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://example.com/alt"
    );
  });

  it("keeps absolute hrefs unchanged", () => {
    const entry = makeEntry([
      makeLink({ rel: "self", href: "https://other.example.com/e" }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBe(
      "https://other.example.com/e"
    );
  });

  it("is undefined when the feed offers no link to the entry itself", () => {
    const entry = makeEntry([
      makeLink({
        rel: "http://opds-spec.org/acquisition",
        href: "/books/1.epub",
      }),
    ]);
    expect(getEntryUrl("https://example.com", entry)).toBeUndefined();
  });
});

describe("getOriginalUrl", () => {
  it("finds the html page for the book", () => {
    const entry = makeEntry([
      makeLink({ rel: "alternate", href: "/book/1", type: "text/html" }),
    ]);
    expect(getOriginalUrl("https://example.com", entry)).toBe(
      "https://example.com/book/1"
    );
  });

  it("is undefined when there is no html alternate", () => {
    const entry = makeEntry([makeLink({ rel: "self", href: "/self" })]);
    expect(getOriginalUrl("https://example.com", entry)).toBeUndefined();
  });
});

describe("toIsoDate", () => {
  it("keeps a bare year verbatim", () => {
    expect(toIsoDate("1818")).toBe("1818");
  });

  it("parses a date string", () => {
    expect(toIsoDate("2019-04-02")).toBe("2019-04-02T00:00:00.000Z");
  });

  it("is undefined for nonsense and for nothing at all", () => {
    expect(toIsoDate("not a date")).toBeUndefined();
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
  const first = makeEntry([], "First", { id: "urn:1" });
  const second = makeEntry([], "Second", { id: "urn:2" });

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
        makeLink({ rel: "self", href: "/entry/1" }),
        makeLink({ rel: "alternate", href: "/book/1", type: "text/html" }),
        makeLink({
          rel: "http://opds-spec.org/image/thumbnail",
          href: "https://example.com/cover.jpg",
        }),
        makeLink({
          rel: "http://opds-spec.org/acquisition/open-access",
          href: "/books/1.epub",
          type: "application/epub+zip",
          title: "EPUB",
        }),
      ],
      "Frankenstein",
      {
        subtitle: "Or, The Modern Prometheus",
        authors: [{ name: "Mary Shelley", uri: "https://example.com/shelley" }],
        summary: "A scientist and his creature.",
        publisher: "Lackington",
        language: "en",
        issued: "1818",
        categories: [
          { term: "FIC015000", label: "Horror", scheme: "bisac" },
          { term: "Gothic" },
        ],
        series: { name: "Gothic Classics", position: 3 },
        extent: "280",
        rights: "Public domain",
        identifier: { value: "9780486282114", type: "ISBN" },
        rating: "4.5",
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
    const entry = makeEntry([], "Moby Dick", { id: "urn:gutenberg:2701:3" });
    expect(
      entryToPublication(
        "https://m.gutenberg.org",
        entry,
        "https://m.gutenberg.org/ebooks/2701.opds"
      ).apiId
    ).toBe("https://m.gutenberg.org/ebooks/2701.opds#urn%3Agutenberg%3A2701%3A3");
  });

  it("prefers the entry's own url to the fallback", () => {
    const entry = makeEntry([makeLink({ rel: "self", href: "/entry/1" })], "A", {
      id: "urn:1",
    });
    expect(
      entryToPublication("https://example.com", entry, "https://example.com/feed")
        .apiId
    ).toBe("https://example.com/entry/1");
  });

  it("falls back to content when there is no summary", () => {
    const entry = makeEntry([], "Book", {
      content: "<p>From the content element.</p>",
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
