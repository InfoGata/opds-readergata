/**
 * Just enough of OPDS 1 (Atom) to list catalogs and describe publications,
 * read straight off the DOM that the browser's DOMParser builds.
 *
 * Elements are matched by namespace and local name, never by prefix, since a
 * feed is free to call `http://purl.org/dc/terms/` "dc", "dcterms" or
 * anything else.
 */

const NS = {
  ATOM: "http://www.w3.org/2005/Atom",
  OPDS: "http://opds-spec.org/2010/catalog",
  DCTERMS: "http://purl.org/dc/terms/",
  DC: "http://purl.org/dc/elements/1.1/",
  XSI: "http://www.w3.org/2001/XMLSchema-instance",
};

// Feeds that forget to declare the Atom namespace still mean Atom.
const ATOM = [NS.ATOM, null];
// dcterms refines the older elements set, and feeds use either.
const DC = [NS.DCTERMS, NS.DC];
// schema.org has been declared every one of these ways in the wild.
const SCHEMA = [
  "http://schema.org/",
  "http://schema.org",
  "https://schema.org/",
  "https://schema.org",
];

export interface OpdsLink {
  href: string;
  /** Space-separated, as in the feed. */
  rel: string;
  type: string;
  title?: string;
  price?: number;
  priceCurrencyCode?: string;
}

export interface OpdsEntry {
  id?: string;
  title: string;
  subtitle?: string;
  authors: { name: string; uri?: string }[];
  summary?: string;
  content?: string;
  published?: string;
  updated?: string;
  issued?: string;
  publisher?: string;
  language?: string;
  rights?: string;
  extent?: string;
  identifier?: { value: string; type?: string };
  categories: { term: string; label?: string; scheme?: string }[];
  series?: { name: string; position?: number };
  rating?: string;
  links: OpdsLink[];
}

export interface OpdsFeed {
  title?: string;
  links: OpdsLink[];
  entries: OpdsEntry[];
}

const childElements = (
  parent: Element,
  namespaces: (string | null)[],
  localName: string
) =>
  Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 &&
      (node as Element).localName === localName &&
      namespaces.includes((node as Element).namespaceURI)
  );

const childElement = (
  parent: Element,
  namespaces: (string | null)[],
  localName: string
): Element | undefined => childElements(parent, namespaces, localName)[0];

const text = (el: Element | undefined) => el?.textContent?.trim() || undefined;

const childText = (
  parent: Element,
  namespaces: (string | null)[],
  localName: string
) => text(childElement(parent, namespaces, localName));

/**
 * An attribute that should be namespaced like its element (`schema:name` on
 * `schema:Series`), found without it too for feeds that leave the prefix off.
 */
const ownAttribute = (el: Element, localName: string) =>
  el.getAttributeNS(el.namespaceURI, localName) ??
  el.getAttribute(localName) ??
  undefined;

/**
 * Atom text constructs. `html` arrives escaped, so its text is the markup;
 * `xhtml` arrives as child elements and has to be put back into a string.
 */
const textConstruct = (el: Element | undefined) => {
  if (!el) return undefined;
  if (el.getAttribute("type") === "xhtml") {
    const serializer = new XMLSerializer();
    const markup = Array.from(el.childNodes)
      .map((node) => serializer.serializeToString(node))
      .join("")
      .trim();
    return markup || undefined;
  }
  return text(el);
};

const toNumber = (value: string | null | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const readLink = (el: Element): OpdsLink => {
  const price = childElement(el, [NS.OPDS], "price");
  return {
    href: el.getAttribute("href") ?? "",
    rel: el.getAttribute("rel") ?? "",
    type: el.getAttribute("type") ?? "",
    title: el.getAttribute("title") ?? undefined,
    price: toNumber(price?.textContent),
    priceCurrencyCode: price?.getAttribute("currencycode") ?? undefined,
  };
};

const readLinks = (parent: Element) =>
  childElements(parent, ATOM, "link").map(readLink);

export const readEntry = (el: Element): OpdsEntry => {
  const identifier = childElement(el, DC, "identifier");
  const series = childElement(el, SCHEMA, "Series");
  const rating = childElement(el, SCHEMA, "Rating");

  return {
    id: childText(el, ATOM, "id"),
    title: childText(el, ATOM, "title") ?? "",
    subtitle:
      childText(el, ATOM, "subtitle") ??
      childText(el, SCHEMA, "alternativeHeadline"),
    authors: childElements(el, ATOM, "author").map((author) => ({
      name: childText(author, ATOM, "name") ?? "",
      uri: childText(author, ATOM, "uri"),
    })),
    summary: textConstruct(childElement(el, ATOM, "summary")),
    content: textConstruct(childElement(el, ATOM, "content")),
    published: childText(el, ATOM, "published"),
    updated: childText(el, ATOM, "updated"),
    issued: childText(el, DC, "issued"),
    publisher: childText(el, DC, "publisher"),
    language: childText(el, DC, "language"),
    rights: childText(el, DC, "rights"),
    extent: childText(el, DC, "extent"),
    identifier: text(identifier)
      ? {
          value: text(identifier)!,
          type: identifier!.getAttributeNS(NS.XSI, "type") ?? undefined,
        }
      : undefined,
    categories: childElements(el, ATOM, "category").map((category) => ({
      term: category.getAttribute("term") ?? "",
      label: category.getAttribute("label") ?? undefined,
      scheme: category.getAttribute("scheme") ?? undefined,
    })),
    series:
      series && ownAttribute(series, "name")
        ? {
            name: ownAttribute(series, "name")!,
            position: toNumber(ownAttribute(series, "position")),
          }
        : undefined,
    rating: rating ? ownAttribute(rating, "ratingValue") : undefined,
    links: readLinks(el),
  };
};

export const readFeed = (doc: Document): OpdsFeed => {
  const root = doc.documentElement;
  return {
    title: childText(root, ATOM, "title"),
    links: readLinks(root),
    entries: childElements(root, ATOM, "entry").map(readEntry),
  };
};

/**
 * Parses a response body as XML. Unlike most parsers, DOMParser doesn't throw
 * on malformed input; it hands back a document holding a `<parsererror>`.
 */
export const parseXml = (xml: string): Document => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (!doc.documentElement || doc.getElementsByTagName("parsererror").length) {
    throw new Error("Not valid XML");
  }
  return doc;
};
