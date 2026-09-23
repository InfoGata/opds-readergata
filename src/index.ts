import {
  OpdsEntry,
  OpdsFeed,
  OpdsLink,
  parseXml,
  readEntry,
  readFeed,
} from "./opds";
import { MessageType, UiMessageType } from "./shared";

const proxyUrl = "https://vercelcors-three.vercel.app/api?url=";

const imageRels = [
  //"http://opds-spec.org/image",
  //"http://opds-spec.org/cover",
  "http://opds-spec.org/image/thumbnail",
  "http://opds-spec.org/thumbnail",
];

export const linkIsRel = (
  link: OpdsLink,
  rel: string | ((r: string) => boolean)
) => {
  if (!link.rel) return false;
  const rels = link.rel.split(" ");
  return typeof rel === "function"
    ? rels.some(rel)
    : rels.some((x) => x === rel);
};

export const isCatalogEntry = (entry: OpdsEntry) => {
  return (
    entry.links &&
    entry.links.some((link) =>
      linkIsRel(link, (rel) =>
        rel.startsWith("http://opds-spec.org/acquisition")
      )
    )
  );
};

export const isAcquisitionFeed = (feed: OpdsFeed) => {
  return feed.entries && feed.entries.some(isCatalogEntry);
};

export const getImage = (entry: OpdsEntry) => {
  for (const rel of imageRels) {
    const link = entry.links.find((x) => linkIsRel(x, rel));
    if (link) {
      return link.href;
    }
  }
  return "";
};

export const getLink = (
  origin: string,
  entry: OpdsEntry
): string | undefined => {
  let href = entry.links.find((l) =>
    l.type.startsWith("application/atom+xml")
  )?.href;
  href = href?.startsWith("/") ? href : `/${href}`;
  return `${origin}${href}`;
};

const acquisitionRel = "http://opds-spec.org/acquisition";

const acquisitionTypes: Record<string, AcquisitionType> = {
  "open-access": "open-access",
  borrow: "borrow",
  buy: "buy",
  sample: "sample",
  subscribe: "subscribe",
};

/**
 * The kind of acquisition a link offers, from the suffix of its rel. The bare
 * `.../acquisition` rel says nothing about how, so it stays undefined.
 */
export const getAcquisitionType = (
  link: OpdsLink
): AcquisitionType | undefined => {
  const rel = link.rel.split(" ").find((r) => r.startsWith(acquisitionRel));
  if (!rel || rel === acquisitionRel) return undefined;
  return acquisitionTypes[rel.slice(acquisitionRel.length + 1)];
};

export const getAcquisitionUrls = (
  origin: string,
  entry: OpdsEntry
): PublicationSource[] => {
  return entry.links.filter((l) => l.rel.startsWith(acquisitionRel)).map(
    (l): PublicationSource => ({
      name: l.title,
      source: l.href.indexOf("://") === -1 ? `${origin}${l.href}` : l.href,
      type: l.type,
      price: l.price,
      currency: l.priceCurrencyCode,
      acquisitionType: getAcquisitionType(l),
    })
  );
};

const toAbsoluteUrl = (origin: string, href: string) =>
  href.indexOf("://") === -1
    ? `${origin}${href.startsWith("/") ? href : `/${href}`}`
    : href;

/**
 * Url of the entry's own OPDS document, which is what `apiId` points at and
 * what `onGetPublicationDetails` is later handed back.
 *
 * Feeds advertise this in three different ways and plenty don't advertise it
 * at all — those publications simply don't get a page of their own.
 */
export const getEntryUrl = (
  origin: string,
  entry: OpdsEntry
): string | undefined => {
  const candidates = [
    // An explicit entry document, the OPDS way of saying "the full record".
    (l: OpdsLink) => l.type.includes("type=entry"),
    (l: OpdsLink) => linkIsRel(l, "self"),
    (l: OpdsLink) =>
      linkIsRel(l, "alternate") && l.type.startsWith("application/atom+xml"),
  ];

  for (const matches of candidates) {
    const link = entry.links.find(matches);
    if (link?.href) return toAbsoluteUrl(origin, link.href);
  }
  return undefined;
};

/**
 * An apiId for an entry that has no url of its own: the document it was listed
 * in, with the entry's atom id as the fragment. Project Gutenberg is the
 * common case — its entries carry acquisition and related links but nothing
 * pointing back at the entry.
 *
 * The id is encoded, so the last `#` is always the one added here.
 */
export const toEntryApiId = (documentUrl: string, entryId: string) =>
  `${documentUrl}#${encodeURIComponent(entryId)}`;

export const parseEntryApiId = (
  apiId: string
): { url: string; entryId?: string } => {
  const hash = apiId.lastIndexOf("#");
  if (hash === -1) return { url: apiId };
  return {
    url: apiId.slice(0, hash),
    entryId: decodeURIComponent(apiId.slice(hash + 1)),
  };
};

/**
 * The entry an apiId names within a fetched feed. Without an id it is the
 * first, for servers that answer an entry url with a feed of one.
 */
export const findEntry = (
  entries: OpdsEntry[] | undefined,
  entryId?: string
): OpdsEntry | undefined =>
  entryId === undefined
    ? entries?.[0]
    : entries?.find((e) => e.id === entryId);

/** The human-readable page for this book on the catalog's own site. */
export const getOriginalUrl = (
  origin: string,
  entry: OpdsEntry
): string | undefined => {
  const link = entry.links.find(
    (l) => linkIsRel(l, "alternate") && l.type.startsWith("text/html")
  );
  return link?.href ? toAbsoluteUrl(origin, link.href) : undefined;
};

/**
 * Normalizes the several date shapes an entry can carry into an ISO string.
 * Catalogs write `dcterms:issued` and `published` however they like, and
 * sometimes as nonsense.
 */
export const toIsoDate = (value: string | undefined) => {
  if (!value) return undefined;
  // Bare years are common and worth keeping verbatim rather than anchoring to
  // a January 1st that the catalog never claimed.
  if (/^\d{4}$/.test(value.trim())) return value.trim();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const toNumber = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The one place an OPDS entry becomes a Publication, shared by the feed
 * listing and the single-entry detail fetch so that a book doesn't change
 * shape when you click on it.
 *
 * `documentUrl` is where the entry was found, the fallback address for one
 * that doesn't link to itself.
 */
export const entryToPublication = (
  origin: string,
  entry: OpdsEntry,
  documentUrl?: string
): Publication => ({
  title: entry.title,
  subtitle: entry.subtitle,
  apiId:
    getEntryUrl(origin, entry) ??
    (documentUrl && entry.id
      ? toEntryApiId(documentUrl, entry.id)
      : undefined),
  authors: entry.authors.map(
    (a): Author => ({ name: a.name, url: a.uri })
  ),
  images: [{ url: getImage(entry) }],
  summary: entry.summary || entry.content,
  publisher: entry.publisher,
  languages: entry.language ? [entry.language] : undefined,
  published: toIsoDate(entry.issued) ?? toIsoDate(entry.published),
  categories: entry.categories.map(
    (c): Category => ({ name: c.label || c.term, scheme: c.scheme })
  ),
  series: entry.series,
  pageCount: toNumber(entry.extent),
  rights: entry.rights,
  identifiers: entry.identifier
    ? [
        {
          type: (entry.identifier.type || "urn").toLowerCase(),
          value: entry.identifier.value,
        },
      ]
    : undefined,
  rating: toNumber(entry.rating),
  sources: getAcquisitionUrls(origin, entry),
  originalUrl: getOriginalUrl(origin, entry),
});

const onSearch = async (request: SearchRequest): Promise<Feed> => {
  const searchUrl = request.searchInfo;
  if (!searchUrl) {
    throw new Error("Doesn't have search rule");
  }
  const proxy = proxyUrl;
  const searchData = await fetch(`${proxy}${encodeURIComponent(searchUrl)}`);
  const searchText = await searchData.text();
  const parser = new DOMParser();
  const openSearchDoc = parser.parseFromString(searchText, "application/xml");
  const urls = openSearchDoc.querySelectorAll("Url");
  const opdsUrl = Array.from(urls).find((url) =>
    url.getAttribute("type")?.includes("application/atom+xml")
  );

  if (!opdsUrl) {
    throw new Error("Failed to search");
  }

  const template = opdsUrl.getAttribute("template");
  if (!template) {
    throw new Error("Failed to search");
  }
  // Exmaple: https://standardebooks.org/ebooks?query={searchTerms}
  const queryUrl = template?.replace("{searchTerms}", request.query);
  return makeOpdsRequest(queryUrl);
};

const fetchOpdsDocument = async (url: string) => {
  const response = await fetch(`${proxyUrl}${encodeURIComponent(url)}`);
  const responseString = await response.text();
  let doc: Document;
  try {
    doc = parseXml(responseString);
  } catch {
    throw new Error(`Not valid XML: ${url}`);
  }
  return { origin: new URL(url).origin, doc };
};

const makeOpdsRequest = async (url: string): Promise<Feed> => {
  const { origin, doc } = await fetchOpdsDocument(url);
  // A single entry is a publication, not a catalog. Reaching one here means a
  // catalog apiId pointed at a book.
  if (doc.documentElement.localName === "entry") {
    throw new Error(`Expected a feed but got a single entry: ${url}`);
  }

  let feed = readFeed(doc);
  const search = feed.links.find((link) => linkIsRel(link, "search"));
  let searchInfo = "";
  if (search) {
    const absoluteReg = new RegExp("^(?:[a-z]+:)?//", "i");
    const openSearchUrl = absoluteReg.test(search.href)
      ? search.href
      : `${origin}${search.href}`;
    searchInfo = openSearchUrl;
  }
  if (isAcquisitionFeed(feed)) {
    let books: Publication[] = feed.entries.map((e) =>
      entryToPublication(origin, e, url)
    );
    return {
      type: "publication",
      items: books,
    };
  } else {
    return {
      type: "catalog",
      items: feed.entries.map(
        (e): Catalog => ({
          name: e.title,
          apiId: getLink(origin, e) || "",
        })
      ),
      searchInfo: searchInfo,
      hasSearch: !!searchInfo,
    };
  }
};

const sendMessage = (message: MessageType) => {
  application.postUiMessage(message);
};

const sendCatalogs = () => {
  sendMessage({
    type: "get-catalogs",
    catalogs: getCatalogs(),
  });
};

export const setCatalogs = (catalogs: Catalog[]) => {
  localStorage.setItem("catalogs", JSON.stringify(catalogs));
};

export const addCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  currentCatalogs.push(catalog);
  setCatalogs(currentCatalogs);
};

export const updateCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  const newCatalogs = currentCatalogs.map((c) =>
    c.id === catalog.id ? catalog : c
  );
  setCatalogs(newCatalogs);
};

export const deleteCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  const newCatalogs = currentCatalogs.filter((c) => c.id !== catalog.id);
  setCatalogs(newCatalogs);
};

application.onUiMessage = async (message: UiMessageType) => {
  switch (message.type) {
    case "get-catalogs":
      sendCatalogs();
      break;
    case "add-catalog":
      addCatalog(message.catalog);
      sendCatalogs();
      break;
    case "update-catalog":
      updateCatalog(message.catalog);
      sendCatalogs();
      break;
    case "delete-catalog":
      deleteCatalog(message.catalog);
      sendCatalogs();
      break;
    default:
      const _exhaustive: never = message;
      break;
  }
};

export const getDefaultCatalogs = (): Catalog[] => {
  return [
    {
      id: "1",
      name: "SimplyE Collection",
      apiId: "https://circulation.librarysimplified.org/OPEN/",
    },
    {
      id: "3",
      name: "Open Textbook",
      apiId: "http://open.minitex.org/textbooks",
    },
    {
      id: "4",
      name: "Project Gutenberg",
      apiId: "https://m.gutenberg.org/ebooks.opds/",
    },
  ];
};

export const getCatalogs = (): Catalog[] => {
  const catalogString = localStorage.getItem("catalogs");
  if (catalogString) {
    const catalogs = JSON.parse(catalogString) as Catalog[];
    return catalogs;
  }
  return getDefaultCatalogs();
};

application.onGetFeed = async (request: GetFeedRequest) => {
  if (request.apiId) {
    return makeOpdsRequest(request.apiId);
  } else {
    return { type: "catalog", items: getCatalogs() };
  }
};

export const blobToString = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (res) => {
      resolve(res.target?.result as string);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(blob);
  });
};

application.onGetPublicationSource = async (
  request: GetPublicationSourceRequest
) => {
  const proxy = proxyUrl;
  const result = await fetch(`${proxy}${encodeURIComponent(request.source)}`);

  const blob = await result.blob();
  const response: GetPublicationSourceResponse = {
    source: await blobToString(blob),
    sourceType: "binary",
  };

  return response;
};

application.onGetPublicationDetails = async (
  request: GetPublicationDetailsRequest
): Promise<Publication> => {
  const { url, entryId } = parseEntryApiId(request.apiId);
  const { origin, doc } = await fetchOpdsDocument(url);
  // The url usually resolves to a bare <entry> document, but some servers
  // answer it with a feed holding that one entry instead, and an apiId made
  // by toEntryApiId points at a feed that lists it among others.
  const entry =
    doc.documentElement.localName === "entry"
      ? readEntry(doc.documentElement)
      : findEntry(readFeed(doc).entries, entryId);
  if (!entry) {
    throw new Error(`No entry at ${request.apiId}`);
  }
  return entryToPublication(origin, entry, url);
};

application.onSearch = onSearch;

const changeTheme = (theme: Theme) => {
  localStorage.setItem("vite-ui-theme", theme);
};
application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

const init = async () => {
  const theme = await application.getTheme();
  changeTheme(theme);
};
init();
