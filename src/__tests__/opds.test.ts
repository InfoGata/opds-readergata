import { describe, it, expect } from "vitest";
import { parseXml, readEntry, readFeed } from "../opds";

const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:schema="http://schema.org/"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <id>urn:feed</id>
  <title>New Releases</title>
  <link rel="self" href="/new"/>
  <link rel="search" href="/opensearch.xml" type="application/opensearchdescription+xml"/>
  <entry>
    <id>
      urn:book:1
    </id>
    <title>Frankenstein</title>
    <schema:alternativeHeadline>Or, The Modern Prometheus</schema:alternativeHeadline>
    <author><name>Mary Shelley</name><uri>https://example.com/shelley</uri></author>
    <author><name>Percy Shelley</name></author>
    <summary type="html">&lt;p&gt;A scientist and his creature.&lt;/p&gt;</summary>
    <published>2019-04-02T00:00:00Z</published>
    <updated>2020-01-01T00:00:00Z</updated>
    <dc:issued>1818</dc:issued>
    <dc:publisher>Lackington</dc:publisher>
    <dc:language>en</dc:language>
    <dc:rights>Public domain</dc:rights>
    <dc:extent>280</dc:extent>
    <dc:identifier xsi:type="ISBN">9780486282114</dc:identifier>
    <category term="FIC015000" label="Horror" scheme="bisac"/>
    <category term="Gothic"/>
    <schema:Series schema:name="Gothic Classics" schema:position="3"/>
    <schema:Rating schema:ratingValue="4.5"/>
    <link rel="http://opds-spec.org/acquisition/buy" href="/books/1.epub"
          type="application/epub+zip" title="Buy">
      <opds:price currencycode="USD">9.99</opds:price>
    </link>
    <link rel="http://opds-spec.org/image/thumbnail" href="/covers/1.jpg"/>
  </entry>
  <entry>
    <id>urn:book:2</id>
    <title>Bare</title>
    <summary type="html"></summary>
    <dc:publisher></dc:publisher>
  </entry>
</feed>`;

describe("readFeed", () => {
  const feed = readFeed(parseXml(feedXml));
  const [rich, bare] = feed.entries;

  it("reads the feed's own title and links", () => {
    expect(feed.title).toBe("New Releases");
    expect(feed.links).toEqual([
      { href: "/new", rel: "self", type: "", title: undefined, price: undefined, priceCurrencyCode: undefined },
      {
        href: "/opensearch.xml",
        rel: "search",
        type: "application/opensearchdescription+xml",
        title: undefined,
        price: undefined,
        priceCurrencyCode: undefined,
      },
    ]);
  });

  it("reads everything a rich entry carries", () => {
    expect(rich).toEqual({
      id: "urn:book:1",
      title: "Frankenstein",
      subtitle: "Or, The Modern Prometheus",
      authors: [
        { name: "Mary Shelley", uri: "https://example.com/shelley" },
        { name: "Percy Shelley", uri: undefined },
      ],
      summary: "<p>A scientist and his creature.</p>",
      content: undefined,
      published: "2019-04-02T00:00:00Z",
      updated: "2020-01-01T00:00:00Z",
      issued: "1818",
      publisher: "Lackington",
      language: "en",
      rights: "Public domain",
      extent: "280",
      identifier: { value: "9780486282114", type: "ISBN" },
      categories: [
        { term: "FIC015000", label: "Horror", scheme: "bisac" },
        { term: "Gothic", label: undefined, scheme: undefined },
      ],
      series: { name: "Gothic Classics", position: 3 },
      rating: "4.5",
      links: [
        {
          href: "/books/1.epub",
          rel: "http://opds-spec.org/acquisition/buy",
          type: "application/epub+zip",
          title: "Buy",
          price: 9.99,
          priceCurrencyCode: "USD",
        },
        {
          href: "/covers/1.jpg",
          rel: "http://opds-spec.org/image/thumbnail",
          type: "",
          title: undefined,
          price: undefined,
          priceCurrencyCode: undefined,
        },
      ],
    });
  });

  it("leaves empty elements out rather than making something up", () => {
    expect(bare.summary).toBeUndefined();
    expect(bare.publisher).toBeUndefined();
    expect(bare.series).toBeUndefined();
    expect(bare.identifier).toBeUndefined();
    expect(bare.authors).toEqual([]);
    expect(bare.categories).toEqual([]);
  });
});

describe("namespaces", () => {
  it("matches by namespace, not by prefix", () => {
    const [entry] = readFeed(
      parseXml(`<a:feed xmlns:a="http://www.w3.org/2005/Atom" xmlns:terms="http://purl.org/dc/terms/">
        <a:entry><a:title>Prefixed</a:title><terms:language>fr</terms:language></a:entry>
      </a:feed>`)
    ).entries;
    expect(entry.title).toBe("Prefixed");
    expect(entry.language).toBe("fr");
  });

  it("accepts the older Dublin Core elements namespace", () => {
    const [entry] = readFeed(
      parseXml(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <entry><title>Old DC</title><dc:language>de</dc:language></entry>
      </feed>`)
    ).entries;
    expect(entry.language).toBe("de");
  });

  it("accepts schema.org without a trailing slash", () => {
    const [entry] = readFeed(
      parseXml(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:schema="http://schema.org">
        <entry><title>S</title><schema:Series schema:name="Saga" schema:position="2"/></entry>
      </feed>`)
    ).entries;
    expect(entry.series).toEqual({ name: "Saga", position: 2 });
  });

  it("reads a feed that never declared the Atom namespace", () => {
    const feed = readFeed(
      parseXml(`<feed><entry><title>Plain</title><link rel="self" href="/e"/></entry></feed>`)
    );
    expect(feed.entries[0].title).toBe("Plain");
    expect(feed.entries[0].links[0].href).toBe("/e");
  });

  it("ignores same-named elements from other namespaces", () => {
    const [entry] = readFeed(
      parseXml(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:x="urn:other">
        <entry><x:title>Wrong</x:title><title>Right</title></entry>
      </feed>`)
    ).entries;
    expect(entry.title).toBe("Right");
  });
});

describe("readEntry", () => {
  it("reads a bare entry document", () => {
    const doc = parseXml(`<entry xmlns="http://www.w3.org/2005/Atom"><id>urn:e</id><title>Alone</title></entry>`);
    expect(readEntry(doc.documentElement)).toMatchObject({ id: "urn:e", title: "Alone" });
  });

  it("keeps xhtml content as markup", () => {
    const doc = parseXml(`<entry xmlns="http://www.w3.org/2005/Atom"><title>X</title>
      <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <b>there</b></p></div></content>
    </entry>`);
    expect(readEntry(doc.documentElement).content).toContain("<p>Hi <b>there</b></p>");
  });
});

describe("parseXml", () => {
  it("throws on malformed XML instead of returning an error document", () => {
    expect(() => parseXml("<feed><entry></feed>")).toThrow("Not valid XML");
  });
});
